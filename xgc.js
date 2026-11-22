/**
 * XGC (仙宫云) open-API client.
 *
 * Verified against the live service on 2026-11-22:
 *   · envelope is  { code: 200, data: {...}, success: true }
 *   · failures are still HTTP 200: { code: 1000, msg: '…', success: false }
 *   · real status values differ from the docs (instances report `shutdown`)
 *   · `retain_price` is a per-hour price for the whole retained disk,
 *     i.e. retainedBytes / 1e9 * storagePricePerGbHour.
 */

const TIMEOUT_MS = 20_000

export function fail(code, msg) {
  return { ok: false, error: { code, msg } }
}

/**
 * True when a boot refusal means "no free GPU right now" rather than a real
 * error. The wording is not documented, so this matches the resource-shortage
 * family and explicitly excludes the failures a retry can never fix.
 */
export function isGpuShortage(error) {
  const msg = String(error?.msg ?? '').trim()
  if (!msg) return false
  if (/余额|欠费|未支付|不存在|无权|权限|参数|格式|非法/.test(msg)) return false
  return /gpu|显卡|算力/i.test(msg)
    && /不足|无可用|没有可用|暂无|已售罄|售完|不够|占满|紧张|稍后/.test(msg)
}

export function ok(data) {
  return { ok: true, data }
}

/** Seconds-or-milliseconds epoch → ISO string (null when absent). */
export function toIso(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = n < 1e12 ? n * 1000 : n
  return new Date(ms).toISOString()
}

export function fmtBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

const STATUS_TABLE = {
  running: { key: 'running', label: '运行中' },
  shutdown: { key: 'stopped', label: '已关机' },
  stopped: { key: 'stopped', label: '已关机' },
  shutdown_backing_up: { key: 'transition', label: '关机备份中' },
  shutdown_releasing: { key: 'transition', label: '释放 GPU 中' },
  restoring: { key: 'transition', label: '恢复中' },
  rebooting: { key: 'transition', label: '重启中' },
  stopped_retain: { key: 'stopped', label: '已关机（保留磁盘）' },
  deploying: { key: 'transition', label: '部署中' },
  creating: { key: 'transition', label: '创建中' },
  starting: { key: 'transition', label: '启动中' },
  booting: { key: 'transition', label: '开机中' },
  shutting_down: { key: 'transition', label: '关机中' },
  saving: { key: 'transition', label: '存镜像中' },
  destroying: { key: 'transition', label: '销毁中' },
  error: { key: 'error', label: '错误' },
}

export function normalizeStatus(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return { key: 'unknown', label: '未知' }
  const hit = STATUS_TABLE[value.toLowerCase()]
  if (hit) return { ...hit, raw: value }
  // The platform keeps adding states (e.g. `shutdown_backing_up`). Classify by
  // prefix so an unknown value still gets a sensible colour and Chinese label
  // instead of a raw identifier in the table.
  const lower = value.toLowerCase()
  const prefix = [
    ['running', { key: 'running', label: '运行中' }],
    ['boot', { key: 'transition', label: '开机中' }],
    ['start', { key: 'transition', label: '启动中' }],
    ['deploy', { key: 'transition', label: '部署中' }],
    ['creat', { key: 'transition', label: '创建中' }],
    ['shutdown', { key: 'transition', label: '关机中' }],
    ['stop', { key: 'stopped', label: '已关机' }],
    ['sav', { key: 'transition', label: '存镜像中' }],
    ['destroy', { key: 'transition', label: '销毁中' }],
    ['delet', { key: 'transition', label: '删除中' }],
    ['error', { key: 'error', label: '错误' }],
    ['fail', { key: 'error', label: '失败' }],
  ].find(([head]) => lower.startsWith(head))
  if (prefix) return { key: prefix[1].key, label: prefix[1].label, raw: value }
  return { key: 'unknown', label: value, raw: value }
}

const IMAGE_STATUS = {
  available: { key: 'ready', label: '可用' },
  ready: { key: 'ready', label: '可用' },
  saving: { key: 'transition', label: '保存中' },
  creating: { key: 'transition', label: '创建中' },
  error: { key: 'error', label: '错误' },
  failed: { key: 'error', label: '失败' },
}

export function normalizeImageStatus(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return { key: 'unknown', label: '未知' }
  const hit = IMAGE_STATUS[value.toLowerCase()]
  if (hit) return { ...hit, raw: value }
  return { key: 'unknown', label: value, raw: value }
}

/** Strip secrets before anything leaves the Host process. */
const SECRET_KEYS = ['password', 'ssh_key', 'jupyter_token', 'xgcos_token']

function stripSecrets(object) {
  const copy = { ...object }
  for (const key of SECRET_KEYS) delete copy[key]
  return copy
}

/**
 * XGC publishes every container port as `<id>-<port>.container.x-gpu.com`
 * (Jupyter is -8888, web is -80). ComfyUI therefore sits at `-<comfyPort>`,
 * derived from web_url when present.
 */
export function comfyUrlOf(raw, comfyPort = 8188) {
  const id = String(raw?.id ?? '')
  const webUrl = String(raw?.web_url ?? '')
  const port = Math.max(1, Number(comfyPort) || 8188)
  if (webUrl) {
    const replaced = webUrl.replace(/-80\./, `-${port}.`).replace(/\/+$/, '')
    if (replaced !== webUrl) return `${replaced}/`
  }
  if (!id) return ''
  return `https://${id}-${port}.container.x-gpu.com/`
}

export function normalizeInstance(raw, now = Date.now(), options = {}) {
  const status = normalizeStatus(raw.status)
  const startedAt = Number(raw.start_timestamp) || 0
  const stoppedAt = Number(raw.stop_timestamp) || 0

  // A rebooted instance keeps its ORIGINAL start_timestamp, so a running
  // instance can report start < stop. When that happens the current boot time
  // is not exposed at all; the last stop time is the sound lower bound.
  const startMs = startedAt > 0 ? startedAt * 1000 : 0
  const stopMs = stoppedAt > 0 ? stoppedAt * 1000 : 0
  let runningSinceMs = 0
  let bootTimeKnown = false
  if (status.key === 'running') {
    if (startMs > 0 && stopMs > 0 && startMs < stopMs) {
      runningSinceMs = stopMs
    } else if (startMs > 0) {
      runningSinceMs = startMs
      bootTimeKnown = true
    }
  }
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? '').trim() || String(raw.id ?? '').slice(0, 8),
    nameGiven: String(raw.name ?? '').trim() !== '',
    status,
    progress: Number(raw.progress) || 0,
    gpuModel: String(raw.gpu_model ?? ''),
    gpuUsed: Number(raw.gpu_used) || 0,
    cpuModel: String(raw.cpu_model ?? ''),
    cpuCores: Number(raw.cpu_core_count) || 0,
    memorySize: Number(raw.memory_size) || 0,
    systemDiskSize: Number(raw.system_disk_size) || 0,
    dataDiskSize: Number(raw.data_disk_size) || 0,
    storageMountPath: String(raw.storage_mount_path ?? ''),
    pricePerHour: Number(raw.price_per_hour) || 0,
    basePrice: Number(raw.base_price) || 0,
    imagePrice: Number(raw.image_price) || 0,
    retain: Boolean(raw.retain),
    retainPrice: Number(raw.retain_price) || 0,
    retainSize: Number(raw.retain_size) || 0,
    autoShutdown: Number(raw.auto_shutdown) || 0,
    autoShutdownAction: Number(raw.auto_shutdown_action) || 0,
    image: { id: String(raw.image_id ?? ''), type: String(raw.image_type ?? '') },
    publicImage: String(raw.public_image ?? ''),
    dataCenter: String(raw.data_center_name ?? ''),
    ssh: {
      host: String(raw.ssh_domain ?? ''),
      port: String(raw.ssh_port ?? ''),
      user: String(raw.ssh_user ?? ''),
      hasKey: String(raw.ssh_key ?? '') !== '',
      hasPassword: String(raw.password ?? '') !== '',
    },
    jupyter: {
      url: String(raw.jupyter_url ?? ''),
      hasToken: String(raw.jupyter_token ?? '') !== '',
    },
    webUrl: String(raw.web_url ?? ''),
    comfyUrl: comfyUrlOf(raw, options.comfyPort ?? 8188),
    cosUrl: String(raw.xgcos_url ?? ''),
    hasCosToken: String(raw.xgcos_token ?? '') !== '',
    createdAt: toIso(raw.create_timestamp),
    startedAt: toIso(raw.start_timestamp),
    stoppedAt: toIso(raw.stop_timestamp),
    uptimeSeconds: runningSinceMs > 0 ? Math.max(0, Math.round((now - runningSinceMs) / 1000)) : null,
    runningSinceMs,
    bootTimeKnown,
    runningSinceEstimated: status.key === 'running' && !bootTimeKnown && runningSinceMs > 0,
    raw: stripSecrets(raw),
  }
}

export function normalizeImage(raw, { pricePerGbHour = 0.00003, now = Date.now() } = {}) {
  const size = Number(raw.size) || 0
  const createdAt = Number(raw.create_timestamp) || 0
  const ageDays = createdAt > 0 ? Math.floor((now - createdAt * 1000) / 86_400_000) : null
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? '').trim() || String(raw.id ?? '').slice(0, 12),
    introduction: String(raw.introduction ?? ''),
    size,
    sizeText: fmtBytes(size),
    status: normalizeImageStatus(raw.status),
    visibility: Number(raw.visibility) || 0,
    price: Number(raw.price) || 0,
    saveImage: Number(raw.save_image) || 0,
    originalOwner: Boolean(raw.original_owner),
    originalImageId: String(raw.original_image_id ?? ''),
    originalImageName: String(raw.original_image_name ?? ''),
    originalImagePrice: Number(raw.original_image_price) || 0,
    createdAt: toIso(raw.create_timestamp),
    fileUpdatedAt: toIso(raw.file_timestamp),
    ageDays,
    estStorageCostPerMonth: Math.round((size / 1e9) * pricePerGbHour * 720 * 100) / 100,
    raw,
  }
}

export function createXgc({ apiBase, getToken, logger }) {
  // apiBase may be a getter so a live config edit needs no client rebuild.
  const baseOf = () => String(typeof apiBase === 'function' ? apiBase() : apiBase || 'https://api.xiangongyun.com').replace(/\/+$/, '')

  async function request(method, path, body, { token: explicitToken } = {}) {
    const token = explicitToken || (await getToken())
    if (!token) {
      return fail(-1, '未配置访问令牌：请在「仙宫云镜像」页填写访问令牌')
    }
    const started = Date.now()
    let lastError = ''
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
      }
      let res
      try {
        res = await fetch(baseOf() + path, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        lastError = `网络错误：${String(error?.message ?? error)}`
        continue
      }

      let json = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      const ms = Date.now() - started
      if (json === null) {
        lastError = `接口未返回 JSON（HTTP ${res.status}）`
        if (res.status >= 500 || res.status === 429) continue
        logger?.warn?.(`xgc ${method} ${path} → non-json ${res.status} (${ms}ms)`)
        return fail(res.status, lastError)
      }

      if (json.success === true || json.code === 200) {
        logger?.debug?.(`xgc ${method} ${path} → ok (${ms}ms)`)
        return ok(json.data ?? json)
      }

      const code = Number(json.code ?? res.status)
      const msg = String(json.msg || json.message || '').trim()
      // 5xx / 429 with a business envelope: worth one retry.
      if ((res.status >= 500 || res.status === 429) && attempt < 2) {
        lastError = msg || `HTTP ${res.status}`
        continue
      }
      logger?.debug?.(`xgc ${method} ${path} → code=${code} (${ms}ms)`)
      return fail(code, msg || `操作被拒绝（code ${code}）`)
    }
    return fail(-2, lastError || '请求失败')
  }

  return {
    get base() {
      return baseOf()
    },
    request,
    whoami: () => request('GET', '/open/whoami'),
    balance: () => request('GET', '/open/balance'),
    instances: () => request('GET', '/open/instances'),
    instance: (id) => request('GET', `/open/instance/${encodeURIComponent(id)}`),
    instanceImages: (id) => request('GET', `/open/instance/${encodeURIComponent(id)}/images`),
    images: () => request('GET', '/open/images'),
    image: (id) => request('GET', `/open/image/${encodeURIComponent(id)}`),
    deploy: (payload) => request('POST', '/open/instance/deploy', payload),
    boot: (payload) => request('POST', '/open/instance/boot', payload),
    shutdown: (id) => request('POST', '/open/instance/shutdown', { id }),
    shutdownReleaseGpu: (id) => request('POST', '/open/instance/shutdown_release_gpu', { id }),
    shutdownDestroy: (id) => request('POST', '/open/instance/shutdown_destroy', { id }),
    destroy: (id) => request('POST', '/open/instance/destroy', { id }),
    saveImage: (id, extra = {}) => request('POST', '/open/instance/saveimage', { id, ...extra }),
    saveImageDestroy: (id, extra = {}) =>
      request('POST', '/open/instance/saveimage_destroy', { id, ...extra }),
    destroyImage: (id) => request('POST', '/open/image/destroy', { id }),
    createRechargeOrder: (payload) => request('POST', '/open/recharge/order', payload),
    rechargeOrder: (tradeNo) =>
      request('GET', `/open/recharge/order/${encodeURIComponent(tradeNo)}`),
  }
}
