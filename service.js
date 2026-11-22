/**
 * Every operation of this plugin lives here exactly once.
 *
 * Both callers go through these methods: the browser page (via the
 * `/xiangongyun/api` route) and the agent tools. Nothing in the UI or in a
 * tool re-implements a call, a guard, or a polling rule.
 */

import {
  fmtBytes, isGpuShortage, normalizeImage, normalizeInstance, normalizeStatus, fail, ok,
} from './xgc.js'
import { localDayKey } from './store.js'

const HOUR_MS = 3_600_000
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The platform answers "该镜像暂时无法进行销毁操作" right after an image is created. */
function isTransientRefusal(error) {
  return /暂时无法|稍后|稍后重试|try again/i.test(String(error?.msg ?? ''))
}

function dayStartMs(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function createService({ xgc, jobs, store, getConfig, credentials, logger }) {
  const cache = { at: 0, payload: null }
  // Filled by the client half (`ui.mount` / `ui.error`) so a headless Host can
  // still tell whether the page rendered and whether it crashed.
  const ui = { mounts: [], lastError: null }
  // `whoami` never changes for a given token; a fast refresh loop must not re-ask.
  let meCache = { at: 0, value: null }

  function uiSnapshot() {
    return { mounts: ui.mounts, lastError: ui.lastError }
  }

  function uiMount(params = {}) {
    const mode = String(params.mode ?? 'unknown')
    const entry = { mode, at: new Date().toISOString(), tab: params.tab ? String(params.tab) : null }
    ui.mounts = ui.mounts.filter((item) => item.mode !== mode).concat(entry).slice(-6)
    return ok(entry)
  }

  function uiError(params = {}) {
    ui.lastError = {
      at: new Date().toISOString(),
      message: String(params.message ?? '').slice(0, 500),
      detail: String(params.componentStack ?? params.detail ?? '').slice(0, 1200),
    }
    store.audit({ op: 'ui.render-error', target: 'client', result: 'error' })
    logger?.warn?.(`xgc client render error: ${ui.lastError.message}`)
    return ok(ui.lastError)
  }

  /** The config projection the page renders; always read from the live snapshot. */
  function configView() {
    const config = getConfig()
    const pricePerGbHour = Number(config.storagePricePerGbHour) || 0.00003
    return {
      refreshSeconds: config.refreshSeconds,
      localOnly: config.localOnly,
      confirmDestructive: config.confirmDestructive,
      gpuModels: config.gpuModels,
      dataCenterId: config.dataCenterId,
      balanceWarnBelow: config.balanceWarnBelow,
      longRunningWarnHours: config.longRunningWarnHours,
      staleImageWarnDays: config.staleImageWarnDays,
      storagePricePerGbHour: pricePerGbHour,
      gpuGrabMinutes: config.gpuGrabMinutes,
    }
  }

  function invalidate() {
    cache.at = 0
    cache.payload = null
  }
  let inflight = null

  // ---- token ------------------------------------------------------------
  async function readToken() {
    const creds = credentials()
    if (creds) {
      try {
        const record = await creds.readRecord('xiangongyun/access-token')
        if (record && typeof record === 'object' && record.key) return String(record.key)
      } catch {
        /* fall through to env */
      }
      try {
        const resolved = await creds.resolve('XGC_API_TOKEN')
        if (resolved?.value) return String(resolved.value)
      } catch {
        /* no env fallback */
      }
    }
    return ''
  }

  async function tokenStatus() {
    const creds = credentials()
    const token = await readToken()
    let writable = false
    let source = token ? 'record' : 'none'
    if (creds && token) {
      try {
        const info = await creds.describeRecord('xiangongyun/access-token')
        writable = Boolean(info?.writable)
        if (!info?.configured) source = 'env'
      } catch {
        /* keep defaults */
      }
    } else if (creds) {
      try {
        const info = await creds.describeRecord('xiangongyun/access-token')
        writable = Boolean(info?.writable)
      } catch {
        /* keep defaults */
      }
    }
    return {
      configured: token !== '',
      writable,
      source,
      tail: token ? token.slice(-4) : '',
    }
  }

  async function tokenSet(token) {
    const value = String(token ?? '').trim()
    if (!value) return fail(400, '令牌不能为空')
    // Prove the token before storing it, so a typo never replaces a working one.
    const check = await xgc.request('GET', '/open/whoami', undefined, { token: value })
    if (!check.ok) {
      return fail(check.error.code, `令牌无效：${check.error.msg}`)
    }
    const creds = credentials()
    if (!creds) return fail(409, '当前 profile 没有 credentials 服务，无法保存令牌')
    try {
      await creds.modifyRecord('xiangongyun/access-token', async () => ({
        kind: 'api-key',
        key: value,
      }))
    } catch (error) {
      return fail(409, `保存失败：${String(error?.message ?? error)}`)
    }
    cache.at = 0
    meCache = { at: 0, value: null }
    store.audit({ op: 'token.set', target: 'credential', result: 'ok' })
    return ok({
      nickname: String(check.data?.nickname ?? ''),
      phone: String(check.data?.phone ?? ''),
    })
  }

  async function tokenClear() {
    const creds = credentials()
    if (!creds) return fail(409, '当前 profile 没有 credentials 服务')
    try {
      await creds.deleteRecord('xiangongyun/access-token')
    } catch (error) {
      return fail(409, `清除失败：${String(error?.message ?? error)}`)
    }
    cache.at = 0
    meCache = { at: 0, value: null }
    store.audit({ op: 'token.clear', target: 'credential', result: 'ok' })
    return ok({ configured: false })
  }

  // ---- snapshot ---------------------------------------------------------
  function costOf(instances, images, pricePerGbHour, now) {
    const start = dayStartMs(now)
    const runningHours = (now - start) / HOUR_MS
    let instancePart = 0
    let retainPart = 0
    for (const item of instances) {
      if (item.status.key === 'running' && item.runningSinceMs) {
        const from = Math.max(start, item.runningSinceMs)
        instancePart += ((now - from) / HOUR_MS) * item.pricePerHour
      } else if (item.retain && item.retainPrice > 0) {
        // A retained (powered-off) instance keeps charging for its disk only.
        retainPart += runningHours * item.retainPrice
      }
    }
    const bytes = images.reduce((sum, image) => sum + (Number(image.size) || 0), 0)
    const storagePart = (bytes / 1e9) * pricePerGbHour * runningHours
    const estimatedInstances = instances.filter((item) => item.runningSinceEstimated).length
    return {
      day: localDayKey(now),
      todayEstimate: round2(instancePart + retainPart + storagePart),
      estimatedInstances,
      instancePart: round2(instancePart),
      retainPart: round2(retainPart),
      storagePart: round2(storagePart),
      monthlyStorage: round2((bytes / 1e9) * pricePerGbHour * 720),
      estimated: true,
      currency: 'CNY',
      note: '按接口返回的 ¥/小时单价与今天已过时长估算，不是账单；镜像存储按 ¥/GB/小时 估算',
    }
  }

  function alertsOf({ account, instances, images, config, tokenConfigured }) {
    const out = []
    if (!tokenConfigured) {
      out.push({ level: 'error', code: 'token-missing', text: '尚未配置访问令牌' })
      return out
    }
    const warnBelow = Number(config.balanceWarnBelow) || 0
    if (warnBelow > 0 && account && typeof account.balance === 'number' && account.balance < warnBelow) {
      out.push({
        level: 'warn',
        code: 'balance-low',
        text: `余额 ¥${account.balance.toFixed(2)} 低于阈值 ¥${warnBelow}`,
      })
    }
    const longHours = Number(config.longRunningWarnHours) || 0
    for (const item of instances) {
      if (longHours > 0 && item.status.key === 'running' && item.uptimeSeconds !== null
        && item.uptimeSeconds > longHours * 3600) {
        out.push({
          level: 'warn',
          code: 'long-running',
          text: `${item.name} 已连续运行 ${(item.uptimeSeconds / 3600).toFixed(1)} 小时（阈值 ${longHours}h）`,
        })
      }
    }
    const staleDays = Number(config.staleImageWarnDays) || 0
    const stale = images.filter(
      (image) => staleDays > 0 && image.ageDays !== null && image.ageDays >= staleDays && !image.annotation?.keep,
    )
    if (stale.length > 0) {
      const bytes = stale.reduce((sum, image) => sum + image.size, 0)
      out.push({
        level: 'info',
        code: 'stale-images',
        text: `${stale.length} 个镜像已超过 ${staleDays} 天未更新（占用 ${fmtBytes(bytes)}，可考虑清理）`,
      })
    }
    return out
  }

  async function buildSnapshot() {
    const config = getConfig()
    const meFresh = meCache.value && Date.now() - meCache.at < 10 * 60_000
    const [instancesRes, imagesRes, balanceRes, meRes] = await Promise.all([
      xgc.instances(),
      xgc.images(),
      xgc.balance(),
      meFresh
        ? Promise.resolve({ ok: true, data: meCache.value })
        : xgc.whoami().then((res) => {
            if (res.ok) meCache = { at: Date.now(), value: res.data }
            return res
          }),
    ])

    if (!instancesRes.ok && !imagesRes.ok) {
      const err = instancesRes.error ?? imagesRes.error
      const stale = store.readCache()
      if (stale) return { ok: false, error: err, data: { ...stale, offline: true } }
      return { ok: false, error: err }
    }

    const now = Date.now()
    const pricePerGbHour = Number(config.storagePricePerGbHour) || 0.00003
    const instances = (instancesRes.ok ? instancesRes.data?.list ?? [] : []).map((raw) =>
      normalizeInstance(raw, now, { comfyPort: config.comfyuiPort }),
    )
    const images = (imagesRes.ok ? imagesRes.data?.list ?? [] : []).map((raw) => {
      const image = normalizeImage(raw, { pricePerGbHour, now })
      return { ...image, annotation: store.annotationsFor(image.id) }
    })
    const account = {
      nickname: meRes.ok ? String(meRes.data?.nickname ?? '') : '',
      phone: meRes.ok ? String(meRes.data?.phone ?? '') : '',
      uuid: meRes.ok ? String(meRes.data?.uuid ?? '') : '',
      balance: balanceRes.ok ? Number(balanceRes.data?.balance) || 0 : null,
    }
    const token = await tokenStatus()
    const cost = costOf(instances, images, pricePerGbHour, now)
    const payload = {
      account: { ...account, tokenConfigured: token.configured, tokenTail: token.tail, tokenSource: token.source },
      instances,
      images,
      cost,
      jobs: jobs.list(),
      alerts: alertsOf({ account, instances, images, config, tokenConfigured: token.configured }),
      config: configView(),
      ui: uiSnapshot(),
      fetchedAt: new Date(now).toISOString(),
      warnings: [
        ...(instancesRes.ok ? [] : [`实例列表读取失败：${instancesRes.error?.msg}`]),
        ...(imagesRes.ok ? [] : [`镜像列表读取失败：${imagesRes.error?.msg}`]),
      ],
    }
    store.writeCache(payload)
    store.sampleCost({
      instances: instances.map((i) => ({
        id: i.id,
        status: i.status.key,
        price: i.pricePerHour,
        retain: i.retainPrice,
      })),
      images: images.map((i) => ({ id: i.id, gb: Math.round((i.size / 1e9) * 100) / 100 })),
    })
    cache.at = now
    cache.payload = payload
    return { ok: true, data: payload }
  }

  async function state({ force = false } = {}) {
    const refresh = Number(getConfig().refreshSeconds) || 30
    if (!force && cache.payload && Date.now() - cache.at < refresh * 1000) {
      // A cached snapshot still reports the settings as they are right now.
      return ok({ ...cache.payload, config: configView(), jobs: jobs.list(), cached: true })
    }
    if (inflight) return inflight
    inflight = (async () => {
      try {
        return await buildSnapshot()
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  // ---- cheap sidebar summary -------------------------------------------
  function summarize(data) {
    const running = data.instances.filter((item) => item.status.key === 'running')
    const retained = data.instances.filter((item) => item.status.key !== 'running' && item.retain)
    return {
      balance: data.account.balance,
      running: running.length,
      total: data.instances.length,
      hourly: round2(running.reduce((sum, item) => sum + item.pricePerHour, 0)),
      retainHourly: round2(retained.reduce((sum, item) => sum + item.retainPrice, 0)),
      images: data.images.length,
      imageBytes: data.images.reduce((sum, image) => sum + image.size, 0),
      alerts: data.alerts.length,
      tokenConfigured: data.account.tokenConfigured,
      sidebarRefreshMinutes: data.config?.sidebarRefreshMinutes ?? 10,
      fetchedAt: data.fetchedAt,
    }
  }

  /**
   * A no-upstream-cost change signal for the sidebar: the snapshot timestamp plus
   * the job epoch. Watching this is how "boot finished" reaches the menu without
   * polling 仙宫云.
   */
  function revision() {
    return ok({ r: cache.at, j: jobs.epoch(), jobsRunning: jobs.list().filter((job) => job.state === 'running').length })
  }

  /**
   * What the sidebar row shows. Served from the snapshot cache unless it is
   * older than `maxAgeMs`, so a 60s sidebar poll costs at most one rebuild.
   */
  async function summary({ maxAgeMs = 60_000, force = false } = {}) {
    const maxAge = Math.max(5_000, Number(maxAgeMs) || 60_000)
    if (!force && cache.payload && Date.now() - cache.at < maxAge) {
      return ok({ ...summarize(cache.payload), cached: true })
    }
    const res = await state({ force: true })
    if (!res.ok) return res
    return ok({ ...summarize(res.data), cached: false })
  }

  // ---- reads ------------------------------------------------------------
  async function instanceGet(id) {
    if (!id) return fail(400, '缺少实例 ID')
    const res = await xgc.instance(id)
    if (!res.ok) return res
    const instance = normalizeInstance(res.data, Date.now(), { comfyPort: getConfig().comfyuiPort })
    return ok({ ...instance, annotation: null })
  }

  async function instanceImages(id) {
    if (!id) return fail(400, '缺少实例 ID')
    const res = await xgc.instanceImages(id)
    if (!res.ok) return res
    const pricePerGbHour = Number(getConfig().storagePricePerGbHour) || 0.00003
    const list = (res.data?.list ?? []).map((raw) => {
      const image = normalizeImage(raw, { pricePerGbHour })
      return { ...image, annotation: store.annotationsFor(image.id) }
    })
    return ok({ list, total: list.length })
  }

  async function imageGet(id) {
    if (!id) return fail(400, '缺少镜像 ID')
    const res = await xgc.image(id)
    if (!res.ok) return res
    const pricePerGbHour = Number(getConfig().storagePricePerGbHour) || 0.00003
    const image = normalizeImage(res.data, { pricePerGbHour })
    return ok({ ...image, annotation: store.annotationsFor(image.id) })
  }

  async function overview() {
    const snap = await state({ force: true })
    if (!snap.ok) return snap
    const data = snap.data
    return ok({
      account: data.account,
      cost: data.cost,
      alerts: data.alerts,
      counts: {
        instances: data.instances.length,
        running: data.instances.filter((i) => i.status.key === 'running').length,
        images: data.images.length,
        imageBytes: data.images.reduce((sum, i) => sum + i.size, 0),
      },
      jobs: data.jobs,
      fetchedAt: data.fetchedAt,
    })
  }

  // ---- instance actions -------------------------------------------------
  function findInstance(snapshot, id) {
    return (snapshot?.instances ?? []).find((item) => item.id === id)
  }

  async function instanceAction(id, action, params = {}) {
    if (!id) return fail(400, '缺少实例 ID')
    const snap = await state()
    const target = snap.ok ? findInstance(snap.data, id) : null
    const label = target?.name ?? id
    const confirmText = String(params.confirmText ?? '')
    const config = getConfig()

    if ((action === 'destroy' || action === 'saveImageDestroy') && config.confirmDestructive) {
      // An empty confirmation must never match: the name may be unknown here.
      const named = String(target?.name ?? '')
      const proven = (named !== '' && confirmText === named) || confirmText === id
      if (!proven) return fail(409, `危险操作需要输入实例名确认：${label}`)
    }

    // The platform only accepts 储存镜像 on a fully stopped instance
    // ("请关机后执行储存镜像操作", and "暂时无法进行操作" while backing up).
    // Read the live status so a stale 30s snapshot cannot block or mislead.
    if (action === 'saveImage' || action === 'saveImageDestroy') {
      const live = await xgc.instance(id)
      if (!live.ok) return live
      const status = normalizeStatus(live.data?.status)
      if (status.key !== 'stopped') {
        return fail(
          409,
          `实例当前状态是「${status.label}」，无法存镜像：需要先关机并等待磁盘备份完成`,
        )
      }
    }

    let res
    if (action === 'boot') {
      const body = { id }
      if (params.gpuModel) body.gpu_model = String(params.gpuModel)
      if (params.gpuCount !== undefined && params.gpuCount !== null && params.gpuCount !== '') {
        body.gpu_count = Number(params.gpuCount)
      }
      res = await xgc.boot(body)
      if (!res.ok) {
        // No free GPU: keep the same boot command on a 1s retry loop until the
        // configured deadline, then stop. Never retries a non-resource failure.
        const minutes = Math.max(0, Number(config.gpuGrabMinutes) || 0)
        const wantsGrab = params.grab === true || isGpuShortage(res.error)
        if (minutes > 0 && wantsGrab) {
          const already = jobs.runningGrab(id)
          const job = already ?? jobs.startGrab(id, {
            target: label,
            bootBody: body,
            deadlineMs: Date.now() + minutes * 60_000,
          })
          store.audit({
            op: 'instance.boot.grab',
            target: label,
            id,
            result: already ? 'already-running' : 'started',
            // The platform's exact refusal: this is what the matcher keys on.
            message: String(res.error?.msg ?? '').slice(0, 200),
          })
          cache.at = 0
          return ok({
            id,
            action,
            job,
            grabbing: true,
            message: already
              ? `已在抢卡中（已试 ${already.attempts} 次）`
              : `没有可用 GPU：已开始自动抢卡，每 1 秒重试，最多 ${minutes} 分钟`,
          })
        }
      }
    } else if (action === 'shutdown') {
      res = await xgc.shutdown(id)
    } else if (action === 'release') {
      res = await xgc.shutdownReleaseGpu(id)
    } else if (action === 'destroy') {
      res = await xgc.destroy(id)
    } else if (action === 'shutdownDestroy') {
      res = await xgc.shutdownDestroy(id)
    } else if (action === 'saveImage' || action === 'saveImageDestroy') {
      // The platform names the image after its own id and ignores `image_name`
      // (verified 2026-11-22), so no name is sent; use the local annotation.
      res = action === 'saveImage' ? await xgc.saveImage(id) : await xgc.saveImageDestroy(id)
    } else {
      return fail(400, `未知操作：${action}`)
    }

    const okFlag = res.ok
    store.audit({
      op: `instance.${action}`,
      target: label,
      id,
      result: okFlag ? 'ok' : `fail:${res.error?.code}`,
      // Keep the platform's own words: the GPU-shortage matcher is tuned from them.
      ...(okFlag ? {} : { message: String(res.error?.msg ?? '').slice(0, 200) }),
    })
    if (!okFlag) return res

    let job = null
    if (action === 'saveImage' || action === 'saveImageDestroy') {
      const before = snap.ok ? (snap.data.images ?? []).map((image) => image.id) : []
      job = jobs.startSave(id, { target: label, imageIdsBefore: before })
    } else if (action === 'boot') {
      job = jobs.startBoot(id, { target: label })
    } else if (action === 'shutdown' || action === 'release') {
      job = jobs.startStop(id, { target: label })
    } else if (action === 'destroy' || action === 'shutdownDestroy') {
      job = jobs.startDestroy(id, { target: label })
    }
    cache.at = 0
    return ok({ id, action, job })
  }

  async function deploy(params = {}) {
    const imageId = String(params.imageId ?? '').trim()
    if (!imageId) return fail(400, '缺少镜像 ID')
    const imageType = String(params.imageType ?? 'private')
    if (!['public', 'community', 'private'].includes(imageType)) {
      return fail(400, `image_type 必须是 public / community / private，收到 ${imageType}`)
    }
    const gpuCount = Number(params.gpuCount)
    if (!Number.isInteger(gpuCount) || gpuCount < 0 || gpuCount > 8) {
      return fail(400, 'GPU 数量必须是 0–8 的整数')
    }
    const config = getConfig()
    const gpuModel = String(params.gpuModel ?? '').trim()
    if (!gpuModel) return fail(400, '缺少 GPU 型号')
    const warnings = []
    if (Array.isArray(config.gpuModels) && config.gpuModels.length > 0 && !config.gpuModels.includes(gpuModel)) {
      warnings.push(`GPU 型号不在已知列表内（${gpuModel}），平台可能拒绝`)
    }

    const body = {
      gpu_model: gpuModel,
      gpu_count: gpuCount,
      image: imageId,
      image_type: imageType,
      data_center_id: Number(params.dataCenterId ?? config.dataCenterId) || 1,
    }
    const name = String(params.name ?? '').trim()
    if (name) body.name = name
    if (params.storage) {
      body.storage = true
      if (params.storageMountPath) body.storage_mount_path = String(params.storageMountPath)
    }
    if (params.sshKey) body.ssh_key = String(params.sshKey)
    if (params.expandSystemDisk) {
      body.system_disk_expand = true
      if (params.expandSystemDiskSize) body.system_disk_expand_size = Number(params.expandSystemDiskSize)
    }

    const snap = await state()
    if (snap.ok && snap.data.account.balance !== null && snap.data.account.balance <= 0) {
      warnings.push('账户余额为 0，部署可能失败')
    }

    const res = await xgc.deploy(body)
    store.audit({ op: 'deploy', target: name || imageId, result: res.ok ? 'ok' : `fail:${res.error?.code}` })
    if (!res.ok) return res
    const newId = String(res.data?.id ?? '')
    const job = newId ? jobs.startDeploy(newId, { target: name || newId }) : null
    cache.at = 0
    return ok({ id: newId, job, warnings, submitted: body })
  }

  // ---- image actions ----------------------------------------------------
  async function imageDestroy(id, { confirmText = '' } = {}) {
    if (!id) return fail(400, '缺少镜像 ID')
    const annotation = store.annotationsFor(id)
    if (annotation?.keep) {
      return fail(409, '该镜像已标记「保留」，先在详情里取消保留再删除')
    }
    const config = getConfig()
    if (config.confirmDestructive) {
      const snap = await state()
      const target = snap.ok ? (snap.data.images ?? []).find((image) => image.id === id) : null
      const named = String(target?.name ?? '')
      const shortId = id.slice(0, 8)
      // API-saved images are named after their own id; type the short id then.
      const proven = (named !== '' && confirmText === named)
        || confirmText === id
        || confirmText === shortId
      if (!proven) return fail(409, `危险操作需要输入镜像名确认：${named !== id ? named : shortId}`)
    }
    let res = await xgc.destroyImage(id)
    for (let attempt = 2; !res.ok && attempt <= 4 && isTransientRefusal(res.error); attempt += 1) {
      await sleep(2000)
      res = await xgc.destroyImage(id)
    }
    store.audit({ op: 'image.destroy', target: id, result: res.ok ? 'ok' : `fail:${res.error?.code}` })
    if (res.ok) {
      delete cache.payload
      cache.at = 0
    }
    return res
  }

  async function imageBatchDestroy(ids = [], { confirmText = '' } = {}) {
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
    if (list.length === 0) return fail(400, '没有选中镜像')
    if (list.length > 20) return fail(400, '一次最多删除 20 个镜像')
    const config = getConfig()
    const expectToken = `DELETE ${list.length}`
    if (config.confirmDestructive && String(confirmText ?? '').trim().toUpperCase() !== expectToken) {
      return fail(409, `批量删除需要输入「${expectToken}」确认`)
    }
    const results = []
    for (const id of list) {
      if (store.annotationsFor(id)?.keep) {
        results.push({ id, ok: false, error: { code: 409, msg: '已标记保留' } })
        continue
      }
      const res = await xgc.destroyImage(id)
      results.push({ id, ok: res.ok, error: res.ok ? null : res.error })
      store.audit({ op: 'image.destroy', target: id, result: res.ok ? 'ok' : `fail:${res.error?.code}` })
      if (!res.ok) break
    }
    cache.at = 0
    return ok({
      results,
      removed: results.filter((item) => item.ok).length,
      stopped: results.length < list.length,
    })
  }

  async function annotate(id, patch) {
    if (!id) return fail(400, '缺少镜像 ID')
    const next = store.setAnnotation(id, patch ?? {})
    if (cache.payload) {
      cache.payload.images = cache.payload.images.map((image) =>
        image.id === id ? { ...image, annotation: next } : image,
      )
    }
    store.audit({ op: 'image.annotate', target: id, result: 'ok' })
    return ok(next)
  }

  // ---- account ----------------------------------------------------------
  async function recharge(payload = {}) {
    const amount = Number(payload.amount)
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, '金额必须大于 0')
    const payment = String(payload.payment ?? 'alipay')
    if (!['alipay', 'wechat'].includes(payment)) return fail(400, '支付方式必须是 alipay 或 wechat')
    const res = await xgc.createRechargeOrder({ amount, payment })
    store.audit({ op: 'recharge.create', target: String(amount), result: res.ok ? 'ok' : 'fail' })
    return res
  }

  async function rechargeQuery(tradeNo) {
    if (!tradeNo) return fail(400, '缺少订单号')
    return xgc.rechargeOrder(tradeNo)
  }

  // ---- secrets ----------------------------------------------------------
  const REVEALABLE = new Set(['password', 'jupyter_token', 'xgcos_token', 'ssh_key'])

  async function reveal(id, field) {
    if (!id) return fail(400, '缺少实例 ID')
    if (!REVEALABLE.has(field)) return fail(400, `不可读取字段：${field}`)
    const res = await xgc.instance(id)
    if (!res.ok) return res
    const value = String(res.data?.[field] ?? '')
    store.audit({ op: `reveal.${field}`, target: id, result: value ? 'ok' : 'empty' })
    return ok({ value })
  }

  return {
    invalidate,
    uiMount,
    uiError,
    uiSnapshot,
    readToken,
    tokenStatus,
    tokenSet,
    tokenClear,
    state,
    summary,
    revision,
    overview,
    instanceGet,
    instanceImages,
    imageGet,
    imageDestroy,
    imageBatchDestroy,
    instanceAction,
    deploy,
    annotate,
    recharge,
    rechargeQuery,
    reveal,
    log: (n = 50) => ok({ entries: store.readAudit(n) }),
    costToday: () => ok({ rows: store.costForDay(), day: localDayKey() }),
  }
}
