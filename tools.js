/**
 * Two agent tools over the same service methods the page calls.
 *
 * Outputs are bounded on purpose: the model gets identifiers, the few numbers
 * that matter, and an explicit note when the list was cut. Destructive actions
 * demand the target name/ID verbatim in `confirm`, which is the only guard a
 * tool can enforce on its own; the real confirmation stays in the UI dialog.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

const MAX_ROWS = 30
const HARD_CAP = 200

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `¥${n.toFixed(2)}` : '¥?'
}

/** Retained-disk and storage prices are sub-cent per hour; keep 4 decimals. */
function moneyFine(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '¥?'
  return n > 0 && n < 0.01 ? `¥${n.toFixed(4)}` : `¥${n.toFixed(2)}`
}

function bytesText(bytes) {
  const n = Number(bytes) || 0
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

function failText(message) {
  return { ok: false, message }
}

function errText(res) {
  return `失败（code ${res.error?.code ?? '?'}）：${res.error?.msg ?? '未知错误'}`
}

export function registerTools(ctx, { service, getConfig }) {
  ctx.tools.register(defineTool({
    name: 'xiangongyun_images',
    description:
      '仙宫云（XGC）私有镜像：查看概览/列表/详情、写本地标签备注与「保留」白名单、生成清理计划、删除镜像。'
      + '删除不可恢复，必须把镜像 ID 原文放进 confirm；带「保留」标记的镜像会被拒绝。',
    parameters: {
      action: {
        type: 'string',
        enum: ['overview', 'list', 'get', 'tag', 'cleanup_plan', 'delete'],
        description: '默认 overview。cleanup_plan 列出超过阈值且未标记保留的镜像及可省费用。',
      },
      all: {
        type: 'boolean',
        description: 'action=list：默认只回前 30 条，true 回全部（上限 200 条）。',
      },
      imageId: { type: 'string', description: 'action=get / tag / delete 必填。' },
      tags: { type: 'array', items: { type: 'string' }, description: 'action=tag：替换标签，最多 8 个。' },
      note: { type: 'string', description: 'action=tag：备注，最多 500 字。' },
      keep: { type: 'boolean', description: 'action=tag：保留白名单，true 时禁止删除。' },
      confirm: { type: 'string', description: 'action=delete：必须与 imageId 完全一致，否则拒绝。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args = {}) {
      const action = String(args.action ?? 'overview')

      if (action === 'overview') {
        const res = await service.overview()
        if (!res.ok) return failText(errText(res))
        const d = res.data
        return {
          ok: true,
          message: [
            `账户：${d.account.nickname || '（未命名）'} ${d.account.phone || ''} 余额 ${money(d.account.balance)}`,
            `实例：${d.counts.instances} 个（运行中 ${d.counts.running}）`,
            `私有镜像：${d.counts.images} 个，占用 ${bytesText(d.counts.imageBytes)}`,
            `今日估算：${money(d.cost.todayEstimate)}（实例 ${money(d.cost.instancePart)} / 关机保留 ${money(d.cost.retainPart)} / 镜像存储 ${money(d.cost.storagePart)}）`,
            ...(d.alerts.length ? ['告警：', ...d.alerts.map((a) => `· ${a.text}`)] : ['告警：无']),
          ].join('\n'),
        }
      }

      if (action === 'list' || action === 'cleanup_plan') {
        const snap = await service.state()
        if (!snap.ok) return failText(errText(snap))
        const config = getConfig()
        let rows = snap.data.images
        if (action === 'cleanup_plan') {
          const days = Number(config.staleImageWarnDays) || 90
          rows = rows
            .filter((image) => !image.annotation?.keep && (image.ageDays ?? 0) >= days)
            .sort((a, b) => b.size - a.size)
        } else {
          rows = [...rows].sort((a, b) => b.size - a.size)
        }
        const cap = args.all ? HARD_CAP : MAX_ROWS
        const shown = rows.slice(0, cap)
        const totalBytes = rows.reduce((sum, image) => sum + image.size, 0)
        const monthly = rows.reduce((sum, image) => sum + image.estStorageCostPerMonth, 0)
        const lines = shown.map((image) => {
          const keep = image.annotation?.keep ? ' [保留]' : ''
          const tags = image.annotation?.tags?.length ? ` #${image.annotation.tags.join(' #')}` : ''
          return `· ${image.name} — ${image.sizeText} · ${image.ageDays ?? '?'} 天 · ${image.status.label} · ${money(image.estStorageCostPerMonth)}/月 · id=${image.id}${keep}${tags}`
        })
        return {
          ok: true,
          message: [
            action === 'cleanup_plan'
              ? `可清理候选 ${rows.length} 个（超过 ${config.staleImageWarnDays ?? 90} 天且未标记保留），合计 ${bytesText(totalBytes)}，约 ${money(monthly)}/月`
              : `私有镜像 ${rows.length} 个，合计 ${bytesText(totalBytes)}，约 ${money(monthly)}/月`,
            ...lines,
            rows.length > shown.length ? `（还有 ${rows.length - shown.length} 条未列出，用 all=true 或界面查看）` : '',
          ].filter(Boolean).join('\n'),
        }
      }

      if (action === 'get') {
        const res = await service.imageGet(String(args.imageId ?? ''))
        if (!res.ok) return failText(errText(res))
        const d = res.data
        return {
          ok: true,
          message: [
            `镜像 ${d.name}（${d.id}）`,
            `大小 ${d.sizeText} · 状态 ${d.status.label} · 创建 ${d.createdAt ?? '?'} · 年龄 ${d.ageDays ?? '?'} 天`,
            `售价 ${money(d.price)} · 原始拥有者 ${d.originalOwner ? '是' : '否'} · 来源 ${d.originalImageName || '（自身）'}`,
            `估算存储 ${money(d.estStorageCostPerMonth)}/月`,
            `标签 ${d.annotation?.tags?.join(', ') || '（无）'} · 保留 ${d.annotation?.keep ? '是' : '否'} · 备注 ${d.annotation?.note || '（无）'}`,
          ].join('\n'),
        }
      }

      if (action === 'tag') {
        const id = String(args.imageId ?? '')
        if (!id) return failText('action=tag 需要 imageId')
        const patch = {}
        if ('tags' in args) patch.tags = args.tags
        if ('note' in args) patch.note = args.note
        if ('keep' in args) patch.keep = args.keep
        if (Object.keys(patch).length === 0) return failText('tag 至少提供 tags / note / keep 之一')
        const res = await service.annotate(id, patch)
        if (!res.ok) return failText(errText(res))
        return {
          ok: true,
          message: `已更新 ${id}：标签 [${res.data.tags.join(', ')}] · 保留 ${res.data.keep ? '是' : '否'}`,
        }
      }

      // delete
      const id = String(args.imageId ?? '')
      if (!id) return failText('action=delete 需要 imageId')
      if (String(args.confirm ?? '') !== id) {
        return failText(`确认不一致：confirm 必须与镜像 ID 完全相同（${id}）`)
      }
      const res = await service.imageDestroy(id, { confirmText: args.confirm })
      if (!res.ok) return failText(errText(res))
      return { ok: true, message: `镜像 ${id} 已删除` }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'xiangongyun_instances',
    description:
      '仙宫云（XGC）GPU 实例：查看列表/详情/该实例存过的镜像，开机、关机（保留 GPU，继续计费）、'
      + '关机释放 GPU（停止计费）、存镜像、存镜像并销毁、部署、销毁。'
      + '注意：存镜像要求实例已关机（运行中会被平台拒绝）；存镜像并销毁不可恢复。'
      + '销毁与「存镜像并销毁」不可恢复，必须在 confirm 里原样写出实例名或实例 ID。',
    parameters: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'images', 'boot', 'shutdown', 'release', 'save_image', 'save_image_destroy', 'deploy', 'destroy'],
        description: '默认 list。shutdown 仍计费；release 释放 GPU 后仅磁盘计费。',
      },
      instanceId: { type: 'string', description: '除 list / deploy 外必填。' },
      confirm: { type: 'string', description: 'action=destroy / save_image_destroy：实例名或实例 ID 原文。' },
      gpuModel: {
        type: 'string',
        description: 'action=boot 可选（关机保留磁盘时才有意义）/ deploy 必填，如 "NVIDIA GeForce RTX 4090 D"。',
      },
      gpuCount: { type: 'number', description: '0–8。boot 可选，deploy 必填。' },
      imageId: { type: 'string', description: 'action=deploy：镜像 ID（不是镜像名）。' },
      imageType: { type: 'string', enum: ['public', 'community', 'private'], description: 'action=deploy 必填。' },
      name: { type: 'string', description: 'action=deploy：实例名，可选。' },
      dataCenterId: { type: 'number', description: 'action=deploy：数据中心 ID，缺省用插件配置。' },
      storage: { type: 'boolean', description: 'action=deploy：是否挂载云存储。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args = {}) {
      const action = String(args.action ?? 'list')

      if (action === 'list') {
        const snap = await service.state()
        if (!snap.ok) return failText(errText(snap))
        const rows = snap.data.instances
        const lines = rows.slice(0, MAX_ROWS).map((item) => {
          const uptime = item.uptimeSeconds > 0 ? ` · 已运行 ${(item.uptimeSeconds / 3600).toFixed(1)}h` : ''
          const retain = item.retain ? ` · 关机保留磁盘 ${moneyFine(item.retainPrice)}/h` : ''
          return `· ${item.name} [${item.status.label}] ${item.gpuModel}×${item.gpuUsed} · ${money(item.pricePerHour)}/h${uptime}${retain} · id=${item.id}`
        })
        return {
          ok: true,
          message: [
            `实例 ${rows.length} 个，运行中 ${rows.filter((i) => i.status.key === 'running').length} 个`,
            ...lines,
            ...(snap.data.jobs.length ? ['进行中的任务：', ...snap.data.jobs.map((j) => `· ${j.kind} ${j.target} — ${j.message}`)] : []),
          ].join('\n'),
        }
      }

      if (action === 'get') {
        const res = await service.instanceGet(String(args.instanceId ?? ''))
        if (!res.ok) return failText(errText(res))
        const d = res.data
        return {
          ok: true,
          message: [
            `${d.name}（${d.id}）[${d.status.label}] 进度 ${d.progress}%`,
            `${d.gpuModel} × ${d.gpuUsed} · ${d.cpuModel}/${d.cpuCores} 核 · 内存 ${bytesText(d.memorySize)}`,
            `系统盘 ${bytesText(d.systemDiskSize)} · 数据盘 ${bytesText(d.dataDiskSize)} · ${money(d.pricePerHour)}/h`,
            `镜像 ${d.image.id}（${d.image.type}）· 数据中心 ${d.dataCenter}`,
            `SSH ${d.ssh.user}@${d.ssh.host}:${d.ssh.port}${d.ssh.hasPassword ? '（有密码）' : ''}`,
            d.jupyter.url ? `Jupyter ${d.jupyter.url}` : 'Jupyter 无',
            d.comfyUrl ? `ComfyUI ${d.comfyUrl}` : '',
          ].join('\n'),
        }
      }

      if (action === 'images') {
        const res = await service.instanceImages(String(args.instanceId ?? ''))
        if (!res.ok) return failText(errText(res))
        const rows = res.data.list
        return {
          ok: true,
          message: rows.length === 0
            ? '该实例没有存过镜像'
            : [`该实例存过 ${rows.length} 个镜像：`, ...rows.map((i) => `· ${i.name} — ${i.sizeText} · id=${i.id}`)].join('\n'),
        }
      }

      if (action === 'deploy') {
        const res = await service.deploy({
          imageId: args.imageId,
          imageType: args.imageType,
          gpuModel: args.gpuModel,
          gpuCount: args.gpuCount,
          name: args.name,
          dataCenterId: args.dataCenterId,
          storage: args.storage,
        })
        if (!res.ok) return failText(errText(res))
        return {
          ok: true,
          message: [
            `已下发部署：${res.data.id}`,
            ...(res.data.warnings ?? []).map((w) => `注意：${w}`),
            '部署是异步的；用 list 观察状态直到 running。',
          ].join('\n'),
        }
      }

      const id = String(args.instanceId ?? '')
      if (!id) return failText(`${action} 需要 instanceId`)
      const res = await service.instanceAction(id, mapAction(action), {
        confirmText: args.confirm,
        gpuModel: args.gpuModel,
        gpuCount: args.gpuCount,
      })
      if (!res.ok) return failText(errText(res))
      const job = res.data.job
      if (res.data.grabbing) {
        return { ok: true, message: `${res.data.message}（任务 ${job?.id ?? '?'}，用 job 状态或界面观察）` }
      }
      return {
        ok: true,
        message: `已下发 ${action}（实例 ${id}）${job ? `；任务 ${job.id} 跟踪中：${job.message}` : ''}`,
      }
    },
  }))
}

function mapAction(action) {
  if (action === 'save_image') return 'saveImage'
  if (action === 'save_image_destroy') return 'saveImageDestroy'
  return action
}
