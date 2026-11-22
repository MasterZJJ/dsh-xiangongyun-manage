/**
 * DSH Host half of the XGC (仙宫云) image manager.
 *
 * One HTTP route, one service, two agent tools and a handful of volatile
 * config fields. The browser page talks to this route; the token lives in the
 * credential store, never in config or in a response body.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { createXgc, fail, ok } from './xgc.js'
import { createStore } from './store.js'
import { createJobs } from './jobs.js'
import { createService } from './service.js'
import { registerTools } from './tools.js'

export const name = 'xiangongyun'
export const inject = ['webServer', 'tools']

const ROUTE = '/xiangongyun/api'
const BODY_LIMIT = 64 * 1024

export const Config = z.object({
  apiBase: z.string().default('https://api.xiangongyun.com').volatile()
    .description('仙宫云开放接口根地址；一般不用改。'),
  refreshSeconds: z.natural().min(5).max(600).default(30).volatile()
    .description('页面自动刷新间隔（秒），页面不可见时暂停。'),
  localOnly: z.boolean().default(true).volatile()
    .description('只接受本机回环直连。经 LAN 网关登录后转发的请求来自 127.0.0.1，无法与本地请求区分——那层访问控制由网关口令负责。'),
  confirmDestructive: z.boolean().default(true).volatile()
    .description('销毁实例 / 删除镜像前要求在对话框里手动输入目标名。'),
  saveImageSendName: z.boolean().default(false).volatile()
    .description('已实测无效：平台按镜像 ID 命名，会忽略 image_name。保留该字段只为兼容既有配置。'),
  gpuModels: z.array(z.string()).default([
    'NVIDIA GeForce RTX 4090',
    'NVIDIA GeForce RTX 4090 48G',
    'NVIDIA GeForce RTX 4090 D',
    'NVIDIA GeForce RTX 4090 D 48G',
  ]).volatile()
    .description('部署/开机可选的 GPU 型号，接口文档变更时可在此覆盖。'),
  dataCenterId: z.natural().default(1).volatile()
    .description('默认数据中心 ID。'),
  storagePricePerGbHour: z.number().min(0).default(0.00003).volatile()
    .description('估算镜像/磁盘存储费用用的 ¥/GB/小时 单价（仅用于估算展示）。'),
  balanceWarnBelow: z.number().min(0).default(20).volatile()
    .description('余额低于该值时顶部告警；0 关闭。'),
  longRunningWarnHours: z.number().min(0).default(6).volatile()
    .description('实例连续运行超过该小时数时告警；0 关闭。'),
  sidebarRefreshMinutes: z.number().min(1).max(120).default(10).volatile()
    .description('侧边栏那行数字的兜底刷新间隔（分钟）。开机/关机/存镜像结束时会立即刷新，不受此值限制。'),
  gpuGrabMinutes: z.number().min(0).max(60).default(5).volatile()
    .description('开机时若提示没有可用 GPU，自动每 1 秒重试抢卡的分钟数；0 = 不自动抢卡。'),
  comfyuiPort: z.natural().min(1).max(65535).default(8188).volatile()
    .description('实例详情里 ComfyUI 地址使用的容器端口；仙宫云默认把 8188 映射为 <实例ID>-8188.container.x-gpu.com。'),
  staleImageWarnDays: z.natural().default(90).volatile()
    .description('镜像超过该天数未更新视为可清理候选；也是 cleanup_plan 的阈值。'),
  workdir: z.string().default('').volatile()
    .description('本地数据目录（标注/成本/审计/缓存），留空 = ~/.dsh-xiangongyun。'),
})

const KEYS = [
  'apiBase', 'refreshSeconds', 'localOnly', 'confirmDestructive', 'saveImageSendName',
  'gpuModels', 'dataCenterId', 'storagePricePerGbHour', 'balanceWarnBelow',
  'longRunningWarnHours', 'staleImageWarnDays', 'comfyuiPort', 'gpuGrabMinutes',
  'sidebarRefreshMinutes', 'workdir',
]

function readConfig(refs) {
  return {
    apiBase: refs.apiBase.get(),
    refreshSeconds: refs.refreshSeconds.get(),
    localOnly: refs.localOnly.get(),
    confirmDestructive: refs.confirmDestructive.get(),
    saveImageSendName: refs.saveImageSendName.get(),
    gpuModels: refs.gpuModels.get(),
    dataCenterId: refs.dataCenterId.get(),
    storagePricePerGbHour: refs.storagePricePerGbHour.get(),
    balanceWarnBelow: refs.balanceWarnBelow.get(),
    longRunningWarnHours: refs.longRunningWarnHours.get(),
    staleImageWarnDays: refs.staleImageWarnDays.get(),
    comfyuiPort: refs.comfyuiPort.get(),
    gpuGrabMinutes: refs.gpuGrabMinutes.get(),
    sidebarRefreshMinutes: refs.sidebarRefreshMinutes.get(),
    workdir: refs.workdir.get(),
  }
}

function isLoopback(address) {
  const value = String(address ?? '')
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1' || value === ''
}

export function apply(ctx, config) {
  let cfg = readConfig(config)

  const store = createStore({
    dir: cfg.workdir || join(homedir(), '.dsh-xiangongyun'),
    logger: ctx.logger,
  })

  // `apiBase` is read on every request, so editing it needs no rebuild.
  const client = createXgc({
    apiBase: () => cfg.apiBase,
    getToken: () => service.readToken(),
    logger: ctx.logger,
  })

  const jobs = createJobs({ xgc: client, logger: ctx.logger })

  const credentials = () => ctx.get('credentials')

  const service = createService({
    xgc: client,
    jobs,
    store,
    getConfig: () => cfg,
    credentials,
    logger: ctx.logger,
  })

  // ---- config writes (Settings tab of the page) -------------------------
  async function setConfig(patch) {
    const entry = ctx.fiber?.entry
    const ns = entry?.options?.id
    const editor = ctx.get('configEditor')
    const settingsService = ctx.get('settings')
    if (!entry) return fail(409, '这个 profile 无法保存插件配置，请改 profile 的 cordis.patch.yml')
    const filtered = {}
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (!KEYS.includes(key)) continue
      if (key === 'refreshSeconds' || key === 'dataCenterId') {
        const n = Math.round(Number(value))
        if (!Number.isFinite(n) || n < 1) return fail(400, `${key} 必须是正整数`)
        filtered[key] = n
      } else if (key === 'storagePricePerGbHour' || key === 'balanceWarnBelow'
        || key === 'longRunningWarnHours' || key === 'gpuGrabMinutes'
        || key === 'sidebarRefreshMinutes') {
        const n = Number(value)
        if (!Number.isFinite(n) || n < 0) return fail(400, `${key} 必须是非负数`)
        filtered[key] = n
      } else if (key === 'staleImageWarnDays') {
        const n = Math.round(Number(value))
        if (!Number.isFinite(n) || n < 0) return fail(400, `${key} 必须是非负整数`)
        filtered[key] = n
      } else if (key === 'localOnly' || key === 'confirmDestructive' || key === 'saveImageSendName') {
        filtered[key] = Boolean(value)
      } else if (key === 'gpuModels') {
        const list = (Array.isArray(value) ? value : String(value ?? '').split('\n'))
          .map((item) => String(item).trim())
          .filter(Boolean)
        filtered[key] = list
      } else {
        filtered[key] = String(value ?? '')
      }
    }
    if (Object.keys(filtered).length === 0) return fail(400, '没有需要保存的字段')

    // The settings service merges the fields live: the plugin is not re-applied,
    // so in-flight jobs and the state cache survive a settings change.
    if (settingsService && ns) {
      try {
        const ops = Object.entries(filtered).map(([key, value]) => ({ op: 'set', path: [key], value }))
        await settingsService.mutate(ns, ops)
        return ok({ applied: Object.keys(filtered), via: 'settings' })
      } catch (error) {
        ctx.logger.warn(`xiangongyun: settings.mutate failed (${String(error?.message ?? error)}); falling back to configEditor`)
      }
    }

    if (!editor) return fail(409, '这个 profile 无法保存插件配置，请改 profile 的 cordis.patch.yml')
    try {
      await editor.edit(entry, (current) => ({ ...current, ...filtered }))
    } catch (error) {
      return fail(409, String(error?.message ?? error))
    }
    return ok({ applied: Object.keys(filtered), via: 'configEditor' })
  }

  // ---- HTTP -------------------------------------------------------------
  const sameOrigin = (req) => {
    const origin = req.headers?.origin
    if (!origin) return true
    try {
      return new URL(origin).host === req.headers?.host
    } catch {
      return false
    }
  }

  const sendJson = (res, status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  async function readBody(req, res) {
    let size = 0
    const chunks = []
    for await (const chunk of req) {
      size += chunk.length
      if (size > BODY_LIMIT) {
        sendJson(res, 413, { ok: false, error: { code: 413, msg: '请求体过大' } })
        return undefined
      }
      chunks.push(chunk)
    }
    try {
      const text = Buffer.concat(chunks).toString('utf8') || '{}'
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
    } catch {
      sendJson(res, 400, { ok: false, error: { code: 400, msg: '请求体不是合法 JSON' } })
      return undefined
    }
  }

  async function runOp(op, params) {
    switch (op) {
      case 'state': return service.state({ force: Boolean(params.force) })
      case 'summary': return service.summary({
        maxAgeMs: Number(params.maxAgeMs) || 60_000,
        force: params.force === true || params.force === 1,
      })
      case 'revision': return service.revision()
      case 'overview': return service.overview()
      case 'log': return service.log(Number(params.n) || 50)
      case 'cost': return service.costToday()
      case 'config.get': return ok({ config: cfg, keys: KEYS })
      case 'config.set': return setConfig(params.patch ?? params.config ?? {})
      case 'ui.mount':
      case 'ui.tab': return service.uiMount(params)
      case 'ui.error': return service.uiError(params)
      case 'ui.state': return ok(service.uiSnapshot())
      case 'token.status': return ok(await service.tokenStatus())
      case 'token.set': return service.tokenSet(params.token)
      case 'token.clear': return service.tokenClear()
      case 'instance.get': return service.instanceGet(String(params.id ?? ''))
      case 'instance.images': return service.instanceImages(String(params.id ?? ''))
      case 'instance.action': return service.instanceAction(String(params.id ?? ''), String(params.action ?? ''), params)
      case 'image.get': return service.imageGet(String(params.id ?? ''))
      case 'image.destroy': return service.imageDestroy(String(params.id ?? ''), { confirmText: params.confirmText })
      case 'image.batchDestroy': return service.imageBatchDestroy(params.ids, { confirmText: params.confirmText })
      case 'image.annotate': return service.annotate(String(params.id ?? ''), params.patch ?? {})
      case 'deploy': return service.deploy(params)
      case 'recharge.create': return service.recharge(params)
      case 'recharge.query': return service.rechargeQuery(String(params.tradeNo ?? ''))
      case 'reveal': return service.reveal(String(params.id ?? ''), String(params.field ?? ''))
      default: return fail(400, `未知操作：${op}`)
    }
  }

  const routeHandler = async (req, res) => {
    if (!sameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: { code: 403, msg: '仅接受同源请求' } })
      return
    }
    if (cfg.localOnly && !isLoopback(req.socket?.remoteAddress)) {
      sendJson(res, 403, { ok: false, error: { code: 403, msg: '插件设置为仅本机访问（localOnly）' } })
      return
    }

    const url = new URL(req.url ?? ROUTE, 'http://127.0.0.1')
    let op = url.searchParams.get('op') ?? ''
    let params = Object.fromEntries(url.searchParams.entries())

    if (req.method === 'POST') {
      const body = await readBody(req, res)
      if (body === undefined) return
      op = String(body.op ?? op)
      params = { ...params, ...body }
    } else if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: { code: 405, msg: '只支持 GET / POST' } })
      return
    }

    if (!op) {
      sendJson(res, 200, { ok: true, data: { route: ROUTE, ops: [
        'state', 'summary', 'revision', 'overview', 'log', 'cost', 'config.get', 'config.set', 'token.status', 'token.set',
        'ui.mount', 'ui.error', 'ui.state',
        'token.clear', 'instance.get', 'instance.images', 'instance.action', 'image.get', 'image.destroy',
        'image.batchDestroy', 'image.annotate', 'deploy', 'recharge.create', 'recharge.query', 'reveal',
      ] } })
      return
    }

    try {
      const result = await runOp(op, params)
      sendJson(res, result.ok ? 200 : 400, result)
    } catch (error) {
      ctx.logger.error(`xgc route ${op}: ${String(error?.message ?? error)}`)
      sendJson(res, 500, { ok: false, error: { code: 500, msg: String(error?.message ?? error) } })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: routeHandler }), 'xgc: api route')

  // ---- live config ------------------------------------------------------
  // Volatile fields are references updated in place, so the snapshot is simply
  // re-read. `settings/document-updated` is the event the settings service
  // emits after a form write; `loader/volatile-update` is not part of the
  // public event catalog in this release.
  ctx.inject(['settings'], (sctx) => {
    const ns = ctx.fiber?.entry?.options?.id
    sctx.effect(() => sctx.on('settings/document-updated', (changedNs) => {
      if (ns !== undefined && String(changedNs) !== String(ns)) return
      const next = readConfig(config)
      const changed = KEYS.filter((key) => JSON.stringify(next[key]) !== JSON.stringify(cfg[key]))
      cfg = next
      if (changed.length > 0) {
        service.invalidate()
        ctx.logger.info(`xiangongyun: config changed (${changed.join(', ')})`)
      }
    }), 'xiangongyun: settings listener')
  })

  // ---- agent tools ------------------------------------------------------
  registerTools(ctx, { service, getConfig: () => cfg })

  ctx.effect(() => () => {
    jobs.dispose()
    ctx.logger.info('xiangongyun: disposed')
  }, 'xiangongyun: jobs')
}
