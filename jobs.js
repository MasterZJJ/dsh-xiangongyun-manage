/**
 * Tracks asynchronous XGC commands.
 *
 * The API hands back no job id: every mutating call only means "command
 * dispatched". So a job here is a small state machine that polls the instance
 * (or the image list) until the platform state proves the command finished.
 * A job never claims success it did not observe: unproven outcomes end `warn`.
 */

// One ticker for every kind; each job carries its own cadence, because a GPU
// grab must retry every second while a save/deploy poll must not.
const TICK_MS = 1000
const DEFAULT_INTERVAL_MS = 3000
const MAX_JOBS = 24

function nowIso() {
  return new Date().toISOString()
}

import { isGpuShortage } from './xgc.js'

export function createJobs({ xgc, logger }) {
  const jobs = new Map()
  let timer = null
  let seq = 0
  let disposed = false
  // Bumped on every job add/finish so the sidebar can notice an outcome
  // without polling the platform.
  let epoch = 0

  function add(job) {
    seq += 1
    const id = `j${seq}`
    const entry = {
      id,
      state: 'running',
      progress: 0,
      message: '',
      error: null,
      startedAt: nowIso(),
      finishedAt: null,
      intervalMs: DEFAULT_INTERVAL_MS,
      nextAt: 0,
      ...job,
      createdAt: Date.now(),
      startedAtMs: Date.now(),
    }
    jobs.set(id, entry)
    epoch += 1
    if (jobs.size > MAX_JOBS) {
      for (const [key, value] of jobs) {
        if (value.state !== 'running') {
          jobs.delete(key)
          break
        }
      }
    }
    startTimer()
    return entry
  }

  function view(entry) {
    return {
      id: entry.id,
      kind: entry.kind,
      target: entry.target,
      instanceId: entry.instanceId ?? null,
      state: entry.state,
      progress: entry.progress,
      message: entry.message,
      error: entry.error,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      attempts: entry.attempts ?? 0,
      remainingSeconds: entry.deadline ? Math.max(0, Math.round((entry.deadline - Date.now()) / 1000)) : null,
    }
  }

  function finish(entry, state, message, extra = {}) {
    entry.state = state
    entry.message = message
    entry.finishedAt = nowIso()
    Object.assign(entry, extra)
    epoch += 1
    if (state === 'running') return
    logger?.info?.(`xgc job ${entry.id} (${entry.kind}) → ${state}: ${message}`)
  }

  async function pollInstance(entry) {
    const res = await xgc.instance(entry.instanceId)
    if (res.ok) return res.data
    // code 1000 with "未找到" style text (or any failure) can also mean gone.
    const msg = String(res.error?.msg ?? '')
    if (res.error?.code === 1000 && !msg) return null
    throw new Error(msg || `读取实例失败（code ${res.error?.code}）`)
  }

  const handlers = {
    async save(entry) {
      const instance = await pollInstance(entry)
      if (instance === null) {
        // Saved then destroyed, or gone: the image list is the only truth left.
        await finishFromImages(entry)
        return
      }
      const status = String(instance.status ?? '')
      if (status === 'saving') {
        entry.sawSaving = true
        entry.progress = Math.max(entry.progress, Number(instance.progress) || 0)
        entry.message = `保存中${entry.progress ? ` ${entry.progress}%` : ''}`
        return
      }
      const elapsed = Date.now() - entry.createdAt
      if (entry.sawSaving || elapsed > 15_000) {
        await finishFromImages(entry)
      } else {
        entry.message = '命令已下发，等待进入保存状态'
      }
    },

    /**
     * Re-send the boot command once per interval until the platform accepts it
     * (a GPU became free) or the deadline passes. Only a GPU-shortage refusal is
     * retried: anything else ends the job instead of hammering the API.
     */
    async grab(entry) {
      const now = Date.now()
      if (now >= entry.deadline) {
        finish(entry, 'warn', `超时：${entry.attempts ?? 0} 次尝试后仍没有可用 GPU`)
        return
      }
      entry.attempts = (entry.attempts ?? 0) + 1
      const span = Math.max(1, entry.deadline - entry.startedAtMs)
      entry.progress = Math.min(99, Math.round(((now - entry.startedAtMs) / span) * 100))
      const res = await xgc.boot(entry.bootBody)
      if (res.ok) {
        const seconds = Math.max(1, Math.round((Date.now() - entry.startedAtMs) / 1000))
        finish(entry, 'done', `抢到 GPU 了（第 ${entry.attempts} 次尝试，用时 ${seconds}s）`)
        return
      }
      if (!isGpuShortage(res.error)) {
        finish(entry, 'error', `抢卡中断：${res.error?.msg || '平台拒绝'}`)
        return
      }
      const left = Math.max(0, Math.round((entry.deadline - Date.now()) / 1000))
      entry.message = `等待可用 GPU：已试 ${entry.attempts} 次，剩 ${left}s`
    },

    async boot(entry) {
      const instance = await pollInstance(entry)
      if (instance === null) {
        finish(entry, 'error', '实例已不存在')
        return
      }
      entry.progress = Math.max(entry.progress, Number(instance.progress) || 0)
      const status = String(instance.status ?? '')
      if (status === 'running') {
        finish(entry, 'done', `开机完成：${instance.name || entry.target}`)
        return
      }
      if (status === 'error') {
        finish(entry, 'error', '平台报告开机失败')
        return
      }
      entry.message = `开机中${entry.progress ? ` ${entry.progress}%` : ''}（${status || '未知状态'}）`
    },

    async deploy(entry) {
      const instance = await pollInstance(entry)
      if (instance === null) {
        finish(entry, 'error', '实例已不存在：部署被取消或已失败')
        return
      }
      entry.progress = Math.max(entry.progress, Number(instance.progress) || 0)
      const status = String(instance.status ?? '')
      if (status === 'running') {
        finish(entry, 'done', `部署完成：${instance.name || entry.target}`)
        return
      }
      if (status === 'error') {
        finish(entry, 'error', '平台报告部署失败')
        return
      }
      entry.message = `部署中${entry.progress ? ` ${entry.progress}%` : ''}（${status || '未知状态'}）`
    },

    async stop(entry) {
      const instance = await pollInstance(entry)
      if (instance === null) {
        finish(entry, 'done', entry.expectDestroyed ? '实例已销毁' : '实例已不存在')
        return
      }
      const status = String(instance.status ?? '')
      if (status === 'shutdown' || status === 'stopped') {
        finish(entry, 'done', entry.expectDestroyed ? '已关机（等待销毁）' : '已关机')
        return
      }
      entry.progress = Math.max(entry.progress, Number(instance.progress) || 0)
      entry.message = `关机中（${status || '未知状态'}）`
    },

    async destroy(entry) {
      const instance = await pollInstance(entry)
      if (instance === null) {
        finish(entry, 'done', '实例已销毁')
        return
      }
      const status = String(instance.status ?? '')
      entry.progress = Math.max(entry.progress, Number(instance.progress) || 0)
      entry.message = `销毁中（${status || '未知状态'}）`
    },
  }

  async function finishFromImages(entry) {
    const res = await xgc.images()
    if (!res.ok) {
      finish(entry, 'warn', `命令已下发，但读取镜像列表失败：${res.error?.msg ?? '未知错误'}`)
      return
    }
    const list = Array.isArray(res.data?.list) ? res.data.list : []
    const before = new Set(entry.imageIdsBefore ?? [])
    const fresh = list.filter((image) => !before.has(String(image.id)))
    if (fresh.length > 0) {
      const newest = fresh[0]
      finish(entry, 'done', `镜像已生成：${newest.name || newest.id}`, {
        imageId: String(newest.id),
        imageName: String(newest.name ?? ''),
      })
      return
    }
    const elapsed = Date.now() - entry.createdAt
    if (elapsed > 10 * 60_000) {
      finish(entry, 'warn', '超过 10 分钟未在新镜像列表中看到条目，请手动刷新确认')
      return
    }
    entry.message = '命令已下发，等待镜像出现在列表中'
  }

  const TIMEOUTS = { save: 30 * 60_000, boot: 20 * 60_000, deploy: 20 * 60_000, stop: 6 * 60_000, destroy: 6 * 60_000, grab: 65 * 60_000 }

  async function tick() {
    const now = Date.now()
    const running = [...jobs.values()].filter((job) => job.state === 'running')
    for (const entry of running) {
      if (entry.nextAt && now < entry.nextAt) continue
      entry.nextAt = now + (entry.intervalMs ?? DEFAULT_INTERVAL_MS)
      if (Date.now() - entry.createdAt > (TIMEOUTS[entry.kind] ?? 10 * 60_000)) {
        finish(entry, 'warn', '等待超时，平台未在预期时间内完成；请在列表中手动确认结果')
        continue
      }
      try {
        await handlers[entry.kind]?.(entry)
      } catch (error) {
        entry.failures = (entry.failures ?? 0) + 1
        if (entry.failures >= 5) {
          finish(entry, 'warn', `轮询反复失败：${String(error?.message ?? error)}`)
        } else {
          entry.message = `轮询失败，正在重试：${String(error?.message ?? error)}`
        }
      }
    }
    if (![...jobs.values()].some((job) => job.state === 'running')) stopTimer()
  }

  function startTimer() {
    if (timer || disposed) return
    timer = setInterval(() => {
      void tick()
    }, TICK_MS)
    timer.unref?.()
  }

  function stopTimer() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  return {
    startSave(instanceId, { target, imageIdsBefore }) {
      return view(add({ kind: 'save', instanceId, target, imageIdsBefore, sawSaving: false }))
    },
    startGrab(instanceId, { target, bootBody, deadlineMs }) {
      return view(add({
        kind: 'grab',
        instanceId,
        target,
        bootBody,
        deadline: deadlineMs,
        intervalMs: 1000,
        attempts: 0,
      }))
    },
    /** An in-flight grab for this instance, if any. */
    runningGrab(instanceId) {
      for (const entry of [...jobs.values()].reverse()) {
        if (entry.kind === 'grab' && entry.instanceId === instanceId && entry.state === 'running') {
          return view(entry)
        }
      }
      return null
    },
    startBoot(instanceId, { target }) {
      return view(add({ kind: 'boot', instanceId, target }))
    },
    startDeploy(instanceId, { target }) {
      return view(add({ kind: 'deploy', instanceId, target }))
    },
    startStop(instanceId, { target, expectDestroyed = false }) {
      return view(add({ kind: 'stop', instanceId, target, expectDestroyed }))
    },
    startDestroy(instanceId, { target }) {
      return view(add({ kind: 'destroy', instanceId, target }))
    },
    list() {
      return [...jobs.values()].map(view)
    },
    epoch() {
      return epoch
    },
    dispose() {
      disposed = true
      stopTimer()
      jobs.clear()
    },
  }
}
