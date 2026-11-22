/**
 * Client half of the XGC (仙宫云) image manager.
 *
 * One Console component serves two seats: a Settings page (`settings.section`)
 * and a full-screen overlay (`shell.overlay`) opened from the sidebar foot.
 * All data comes from the Host route `/xiangongyun/api`; this file never talks
 * to api.xiangongyun.com and never sees the access token.
 *
 * No Harness client package is imported: controls below are written here, and
 * styling uses only `--dsw-alias-*` tokens so light/dark both work.
 */
window.__ModuleLoader__.load({
  id: 'dsh-xiangongyun',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback, useMemo } = React

    // ---------------------------------------------------------------- tokens
    const T = {
      bg: 'var(--dsw-alias-bg-base)',
      layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      overlay: 'var(--dsw-alias-bg-overlay)',
      line: 'var(--dsw-alias-border-l1)',
      line2: 'var(--dsw-alias-border-l2)',
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-brand-primary)',
      danger: 'var(--dsw-alias-state-error-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }

    const CSS = `
.xgc-root{color:${T.text};font-size:13px;line-height:1.55;}
.xgc-root *{box-sizing:border-box;}
.xgc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;
  border:1px solid ${T.line2};background:transparent;color:${T.text};cursor:pointer;font:inherit;
  padding:6px 12px;transition:background .12s ease,filter .12s ease,opacity .12s ease;white-space:nowrap;}
.xgc-btn:hover:not(:disabled){background:${T.layer2};}
.xgc-btn:focus-visible{outline:2px solid ${T.brand};outline-offset:2px;}
.xgc-btn:disabled{opacity:.5;cursor:not-allowed;}
.xgc-btn[data-variant="primary"]{background:${T.brand};border-color:transparent;color:#fff;}
.xgc-btn[data-variant="primary"]:hover:not(:disabled){filter:brightness(1.08);background:${T.brand};}
.xgc-btn[data-variant="danger"]{color:${T.danger};border-color:${T.danger};}
.xgc-btn[data-variant="danger"]:hover:not(:disabled){background:${T.layer2};}
.xgc-btn[data-size="sm"]{padding:3px 8px;font-size:12px;border-radius:6px;}
.xgc-input,.xgc-select,.xgc-area{width:100%;font:inherit;color:inherit;background:transparent;
  border:1px solid ${T.line2};border-radius:8px;padding:6px 9px;}
.xgc-input:focus,.xgc-select:focus,.xgc-area:focus{outline:2px solid ${T.brand};outline-offset:1px;border-color:transparent;}
.xgc-input[data-mono="1"]{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;}
.xgc-area{min-height:64px;resize:vertical;}
.xgc-row{display:flex;align-items:center;gap:10px;}
.xgc-grow{flex:1;min-width:0;}
.xgc-table{width:100%;border-collapse:separate;border-spacing:0;}
.xgc-table th{text-align:left;font-weight:600;font-size:12px;color:${T.muted};
  padding:8px 10px;border-bottom:1px solid ${T.line};white-space:nowrap;}
.xgc-table td{padding:9px 10px;border-bottom:1px solid ${T.line};vertical-align:middle;}
.xgc-table tr:last-child td{border-bottom:none;}
.xgc-table tbody tr:hover td{background:${T.layer2};}
.xgc-chip{display:inline-flex;align-items:center;border-radius:999px;padding:1px 8px;font-size:11px;
  border:1px solid ${T.line2};color:${T.muted};}
.xgc-nav{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;
  border:1px solid transparent;background:transparent;color:${T.muted};cursor:pointer;font:inherit;}
.xgc-nav:hover{color:${T.text};background:${T.layer2};}
.xgc-nav[data-active="1"]{color:${T.text};background:${T.layer2};border-color:${T.line2};font-weight:600;}
.xgc-nav:focus-visible{outline:2px solid ${T.brand};outline-offset:2px;}
.xgc-scroll{overflow:auto;}
.xgc-scroll::-webkit-scrollbar{width:10px;height:10px;}
.xgc-scroll::-webkit-scrollbar-thumb{background:${T.line2};border-radius:6px;}
.xgc-muted{color:${T.muted};}
.xgc-popup{position:fixed;bottom:128px;left:12px;z-index:2147483000;box-sizing:border-box;
  pointer-events:auto;
  display:flex;flex-direction:column;overflow:hidden;
  width:440px;max-width:calc(100vw - 24px);max-height:82vh;
  border:0;border-radius:var(--dsw-radius-lg,12px);
  background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)));
  backdrop-filter:var(--dsw-menu-backdrop-filter);
  box-shadow:var(--dsw-elevation-panel,0 18px 50px rgba(0,0,0,.28));
  --dsw-elevation-stroke-color:var(--dsw-alias-border-l1);
  color:${T.text};font-size:13px;line-height:1.55;}
.xgc-popup-head{display:flex;align-items:center;gap:8px;min-height:44px;padding:10px 12px;
  border-bottom:1px solid ${T.line2};flex:none;}
.xgc-popup-title{font-size:13px;font-weight:500;line-height:20px;}
.xgc-popup-body{flex:1;min-height:0;overflow-y:auto;padding:4px 14px 14px;}
.xgc-stat{box-sizing:border-box;border:1px solid ${T.line2};border-radius:10px;padding:8px 10px;
  display:flex;flex-direction:column;gap:1px;min-width:0;}
.xgc-stat-value{font-size:15px;font-weight:600;line-height:22px;font-variant-numeric:tabular-nums;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.xgc-stat-label{font-size:11px;line-height:16px;color:${T.muted};}
.xgc-icon-btn{width:26px;height:26px;border:none;background:transparent;border-radius:6px;
  color:${T.muted};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;}
.xgc-icon-btn:hover{background:${T.layer2};color:${T.text};}
.xgc-icon-btn:focus-visible{outline:2px solid ${T.brand};outline-offset:2px;}
.xgc-card{border:1px solid ${T.line2};border-radius:10px;padding:9px 10px;
  display:flex;flex-direction:column;gap:6px;background:transparent;}
.xgc-side{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;
  border:1px solid transparent;background:transparent;border-radius:10px;padding:10px 10px;
  cursor:pointer;font:inherit;text-align:left;transition:background .15s ease;color:inherit;}
.xgc-side:hover,.xgc-side[data-active="1"]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));
  border-color:${T.line};}
.xgc-side:focus-visible{outline:2px solid ${T.brand};outline-offset:2px;}
.xgc-side[data-rail="1"]{flex-direction:column;gap:3px;padding:8px 0;justify-content:center;}
.xgc-side-title{font-size:calc(var(--dsh-content-font-size,14px) * .893);font-weight:500;line-height:1.35;}
.xgc-pills{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;}
.xgc-pill{display:inline-flex;align-items:center;gap:3px;border-radius:6px;padding:2px 6px;
  background:var(--dsw-alias-fill-l2,#f5f5f5);color:${T.muted};
  font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,monospace);
  font-size:calc(var(--dsh-content-font-size,14px) * .679);line-height:1.3;white-space:nowrap;}
.xgc-dot{width:6px;height:6px;border-radius:3px;flex:none;}
.xgc-popup-foot{display:flex;align-items:center;gap:6px;padding:7px 12px;flex:none;
  border-top:1px solid ${T.line2};font-size:11px;color:${T.muted};}
.xgc-seg{border:1px solid transparent;background:transparent;color:inherit;font:inherit;font-size:11px;
  padding:2px 7px;border-radius:6px;cursor:pointer;line-height:1.4;}
.xgc-seg:hover{background:${T.layer2};color:${T.text};}
.xgc-seg:focus-visible{outline:2px solid ${T.brand};outline-offset:1px;}
.xgc-seg[data-active="1"]{background:var(--dsw-alias-fill-l2,#f5f5f5);border-color:${T.line};color:${T.text};font-weight:600;}
.xgc-sec-title{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:${T.muted};margin:12px 0 6px;}
.xgc-link{color:${T.brand};text-decoration:none;cursor:pointer;background:none;border:none;font:inherit;padding:0;}
.xgc-link:hover{text-decoration:underline;}
@media (max-width:560px){
  .xgc-hide-sm{display:none !important;}
  .xgc-cards{grid-template-columns:1fr 1fr !important;}
  .xgc-stack{grid-template-columns:1fr !important;}
}
`

    // ------------------------------------------------------------------ i18n
    const ZH = {
      'nav.title': '仙宫云镜像',
      'nav.overview': '概览',
      'nav.instances': '实例',
      'nav.images': '镜像',
      'nav.deploy': '部署',
      'nav.account': '账号',
      'nav.settings': '设置',
      'common.refresh': '刷新',
      'common.refreshing': '刷新中…',
      'common.close': '关闭',
      'common.cancel': '取消',
      'common.confirm': '确认',
      'common.save': '保存',
      'common.saving': '保存中…',
      'common.copy': '复制',
      'common.copied': '已复制',
      'common.detail': '详情',
      'common.delete': '删除',
      'common.retry': '重试',
      'common.loading': '加载中…',
      'common.none': '无',
      'common.unknown': '未知',
      'header.balance': '余额',
      'header.fullscreen': '全屏',
      'header.exit': '退出全屏',
      'overview.todayCost': '今日估算',
      'overview.instancePart': '实例部分',
      'overview.retainPart': '关机保留',
      'overview.storagePart': '镜像存储',
      'overview.running': '运行中实例',
      'overview.images': '私有镜像',
      'overview.imageBytes': '镜像占用',
      'overview.jobs': '进行中的任务',
      'overview.noJobs': '没有进行中的任务',
      'overview.alerts': '告警',
      'overview.noAlerts': '一切正常',
      'overview.monthly': '镜像存储估算',
      'overview.perMonth': '/月',
      'instances.empty': '还没有实例。',
      'instances.emptyHint': '到「部署」页用镜像起一台。',
      'instances.boot': '开机',
      'instances.shutdown': '关机（保留 GPU）',
      'instances.release': '关机释放 GPU',
      'instances.save': '存镜像',
      'instances.saveDestroy': '存镜像并销毁',
      'instances.destroy': '销毁',
      'instances.name': '名称',
      'instances.status': '状态',
      'instances.gpu': 'GPU',
      'instances.price': '单价',
      'instances.uptime': '运行时长',
      'instances.image': '镜像',
      'instances.progress': '进度',
      'instances.ssh': 'SSH',
      'instances.jupyter': 'Jupyter',
      'instances.disk': '磁盘',
      'instances.retain': '关机保留磁盘',
      'instances.reveal': '显示',
      'instances.hide': '隐藏',
      'instances.saveHint': '把当前实例的系统盘保存成一个私有镜像。',
      'instances.saveNeedsShutdown': '实例需要先关机（并等磁盘备份完成）才能存镜像：先「关机释放 GPU」可同时停止计费。',
      'instances.releaseHint': '释放 GPU 后停止按小时计费，磁盘继续按 GB/小时 计费，可随时再开机。',
      'instances.shutdownHint': '只关机，GPU 仍为你保留，期间照常计费。',
      'images.empty': '还没有私有镜像。',
      'images.emptyHint': '在实例详情里点「存镜像」就会出现在这里。',
      'images.search': '搜索名称、标签、备注…',
      'images.filter': '筛选',
      'images.filter.all': '全部',
      'images.filter.keep': '仅保留',
      'images.filter.stale': '仅超期未用',
      'images.filter.tagged': '仅有标签',
      'images.sort': '排序',
      'images.sort.size': '按大小',
      'images.sort.age': '按时间',
      'images.sort.name': '按名称',
      'images.name': '名称',
      'images.size': '大小',
      'images.age': '年龄',
      'images.status': '状态',
      'images.tags': '标签',
      'images.keep': '保留',
      'images.cost': '估算存储',
      'images.deploy': '部署',
      'images.delete': '删除',
      'images.batch': '批量删除',
      'images.selected': '已选',
      'images.keepOn': '已标记保留，先取消保留才能删除',
      'images.annotation': '标签与备注',
      'images.tagsField': '标签（逗号分隔，最多 8 个）',
      'images.noteField': '备注',
      'images.keepField': '保留白名单（禁止删除）',
      'images.saved': '标注已保存',
      'deploy.source': '来源镜像',
      'deploy.manual': '手动输入镜像 ID',
      'deploy.imageId': '镜像 ID',
      'deploy.imageType': '镜像类型',
      'deploy.gpu': 'GPU 型号',
      'deploy.gpuCount': 'GPU 数量',
      'deploy.name': '实例名',
      'deploy.dataCenter': '数据中心 ID',
      'deploy.storage': '挂载云存储',
      'deploy.submit': '部署',
      'deploy.submitting': '部署中…',
      'deploy.hint': '部署是异步的：提交后会在「概览」显示进度，完成后状态变为运行中。',
      'deploy.warn': '注意',
      'deploy.submitted': '已下发部署',
      'account.nickname': '昵称',
      'account.phone': '手机',
      'account.uuid': '用户 ID',
      'account.balance': '余额',
      'account.recharge': '充值',
      'account.amount': '金额（元）',
      'account.payment': '支付方式',
      'account.alipay': '支付宝',
      'account.wechat': '微信',
      'account.createOrder': '生成充值单',
      'account.order': '订单',
      'account.tradeNo': '订单号',
      'account.open': '打开支付链接',
      'account.query': '查询状态',
      'account.wechatHint': '微信链接需要转成二维码后用微信 App 扫码。',
      'settings.token': '访问令牌',
      'settings.tokenConfigured': '已配置',
      'settings.tokenMissing': '未配置',
      'settings.tokenHint': '在 xiangongyun.com/a/API 生成。令牌只保存在凭据库，页面只显示末 4 位。',
      'settings.tokenSave': '保存并校验',
      'settings.tokenClear': '清除令牌',
      'settings.tokenOk': '令牌有效',
      'settings.config': '插件设置',
      'settings.refresh': '自动刷新间隔（秒）',
      'settings.balanceWarn': '余额告警阈值（元，0 关闭）',
      'settings.longRun': '长时运行告警（小时，0 关闭）',
      'settings.stale': '镜像超期阈值（天）',
      'settings.price': '存储单价（元/GB/小时，仅估算）',
      'settings.confirm': '危险操作需要手输目标名',
      'settings.localOnly': '仅接受本机直连（LAN 网关转发不受此限制）',
      'settings.sendName': '存镜像时下发 image_name',
      'settings.gpuModels': '可选 GPU 型号（每行一个）',
      'settings.workdir': '数据目录',
      'settings.saved': '设置已保存',
      'settings.client': '客户端诊断',
      'settings.audit': '操作审计',
      'settings.noAudit': '还没有操作记录',
      'danger.title': '确认危险操作',
      'danger.typeToConfirm': '请输入',
      'danger.toContinue': '以继续',
      'danger.running': '执行中…',
    }

    const EN = {
      'nav.title': 'XGC images',
      'nav.overview': 'Overview',
      'nav.instances': 'Instances',
      'nav.images': 'Images',
      'nav.deploy': 'Deploy',
      'nav.account': 'Account',
      'nav.settings': 'Settings',
      'common.refresh': 'Refresh',
      'common.refreshing': 'Refreshing…',
      'common.close': 'Close',
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
      'common.save': 'Save',
      'common.saving': 'Saving…',
      'common.copy': 'Copy',
      'common.copied': 'Copied',
      'common.detail': 'Details',
      'common.delete': 'Delete',
      'common.retry': 'Retry',
      'common.loading': 'Loading…',
      'common.none': 'none',
      'common.unknown': 'unknown',
      'header.balance': 'Balance',
      'header.fullscreen': 'Full screen',
      'header.exit': 'Exit full screen',
      'overview.todayCost': 'Today (est.)',
      'overview.instancePart': 'Instances',
      'overview.retainPart': 'Retained disks',
      'overview.storagePart': 'Image storage',
      'overview.running': 'Running instances',
      'overview.images': 'Private images',
      'overview.imageBytes': 'Image size',
      'overview.jobs': 'Jobs in progress',
      'overview.noJobs': 'No jobs in progress',
      'overview.alerts': 'Alerts',
      'overview.noAlerts': 'All clear',
      'overview.monthly': 'Image storage estimate',
      'overview.perMonth': '/mo',
      'instances.empty': 'No instances yet.',
      'instances.emptyHint': 'Deploy one from the Deploy tab.',
      'instances.boot': 'Boot',
      'instances.shutdown': 'Shut down (keep GPU)',
      'instances.release': 'Shut down and release GPU',
      'instances.save': 'Save image',
      'instances.saveDestroy': 'Save image and destroy',
      'instances.destroy': 'Destroy',
      'instances.name': 'Name',
      'instances.status': 'Status',
      'instances.gpu': 'GPU',
      'instances.price': 'Price',
      'instances.uptime': 'Uptime',
      'instances.image': 'Image',
      'instances.progress': 'Progress',
      'instances.ssh': 'SSH',
      'instances.jupyter': 'Jupyter',
      'instances.disk': 'Disk',
      'instances.retain': 'Retained disk',
      'instances.reveal': 'Show',
      'instances.hide': 'Hide',
      'instances.saveHint': 'Save this instance system disk as a private image.',
      'instances.saveNeedsShutdown': 'The instance must be stopped (and its disk backup finished) before saving an image; shutting it down with GPU release also stops billing.',
      'instances.releaseHint': 'Releasing the GPU stops hourly billing; the disk keeps a small GB/hour charge and can boot again later.',
      'instances.shutdownHint': 'Only powers off; the GPU stays reserved and billing continues.',
      'images.empty': 'No private images yet.',
      'images.emptyHint': 'Use Save image on an instance and it shows up here.',
      'images.search': 'Search name, tags, note…',
      'images.filter': 'Filter',
      'images.filter.all': 'All',
      'images.filter.keep': 'Whitelisted only',
      'images.filter.stale': 'Stale only',
      'images.filter.tagged': 'Tagged only',
      'images.sort': 'Sort',
      'images.sort.size': 'Size',
      'images.sort.age': 'Age',
      'images.sort.name': 'Name',
      'images.name': 'Name',
      'images.size': 'Size',
      'images.age': 'Age',
      'images.status': 'Status',
      'images.tags': 'Tags',
      'images.keep': 'Keep',
      'images.cost': 'Storage est.',
      'images.deploy': 'Deploy',
      'images.delete': 'Delete',
      'images.batch': 'Delete selected',
      'images.selected': 'selected',
      'images.keepOn': 'Whitelisted — clear the keep flag before deleting',
      'images.annotation': 'Tags and note',
      'images.tagsField': 'Tags (comma separated, max 8)',
      'images.noteField': 'Note',
      'images.keepField': 'Keep whitelist (blocks delete)',
      'images.saved': 'Annotation saved',
      'deploy.source': 'Source image',
      'deploy.manual': 'Enter an image ID',
      'deploy.imageId': 'Image ID',
      'deploy.imageType': 'Image type',
      'deploy.gpu': 'GPU model',
      'deploy.gpuCount': 'GPU count',
      'deploy.name': 'Instance name',
      'deploy.dataCenter': 'Data center ID',
      'deploy.storage': 'Mount cloud storage',
      'deploy.submit': 'Deploy',
      'deploy.submitting': 'Deploying…',
      'deploy.hint': 'Deployment is asynchronous: progress shows on Overview, and the status becomes running when it finishes.',
      'deploy.warn': 'Note',
      'deploy.submitted': 'Deployment submitted',
      'account.nickname': 'Nickname',
      'account.phone': 'Phone',
      'account.uuid': 'User ID',
      'account.balance': 'Balance',
      'account.recharge': 'Recharge',
      'account.amount': 'Amount (CNY)',
      'account.payment': 'Payment',
      'account.alipay': 'Alipay',
      'account.wechat': 'WeChat',
      'account.createOrder': 'Create order',
      'account.order': 'Order',
      'account.tradeNo': 'Trade no.',
      'account.open': 'Open payment link',
      'account.query': 'Check status',
      'account.wechatHint': 'The WeChat link must be converted to a QR code and scanned in the WeChat app.',
      'settings.token': 'Access token',
      'settings.tokenConfigured': 'configured',
      'settings.tokenMissing': 'not configured',
      'settings.tokenHint': 'Create one at xiangongyun.com/a/API. It is stored in the credential store; this page only shows the last 4 characters.',
      'settings.tokenSave': 'Save and verify',
      'settings.tokenClear': 'Clear token',
      'settings.tokenOk': 'Token is valid',
      'settings.config': 'Plugin settings',
      'settings.refresh': 'Refresh interval (seconds)',
      'settings.balanceWarn': 'Low-balance threshold (CNY, 0 disables)',
      'settings.longRun': 'Long-run threshold (hours, 0 disables)',
      'settings.stale': 'Stale image threshold (days)',
      'settings.price': 'Storage price (CNY/GB/hour, estimate only)',
      'settings.confirm': 'Destructive actions require typing the target name',
      'settings.localOnly': 'Loopback only (LAN gateway relays arrive as loopback)',
      'settings.sendName': 'Send image_name when saving an image',
      'settings.gpuModels': 'GPU models offered (one per line)',
      'settings.workdir': 'Data directory',
      'settings.saved': 'Settings saved',
      'settings.client': 'Client diagnostics',
      'settings.audit': 'Audit trail',
      'settings.noAudit': 'No operations recorded yet',
      'danger.title': 'Confirm destructive action',
      'danger.typeToConfirm': 'Type',
      'danger.toContinue': 'to continue',
      'danger.running': 'Working…',
    }

    function makeT(ctx) {
      let translate = null
      try {
        ctx.locale.register('xiangongyun', 'zh', ZH)
        ctx.locale.register('xiangongyun', 'en', EN)
        translate = ctx.locale.bind('xiangongyun')
      } catch (error) {
        translate = null
      }
      return (key, fallback) => {
        if (translate) {
          try {
            const value = translate(key)
            if (value && value !== key) return value
          } catch {
            /* fall through */
          }
        }
        return fallback ?? ZH[key] ?? key
      }
    }

    // ----------------------------------------------------------------- utils
    async function api(op, params) {
      try {
        const res = await fetch('/xiangongyun/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, ...(params ?? {}) }),
        })
        const body = await res.json().catch(() => null)
        if (!body) return { ok: false, error: { code: res.status, msg: `接口无响应（HTTP ${res.status}）` } }
        return body
      } catch (error) {
        return { ok: false, error: { code: -1, msg: `无法连接插件接口：${String(error?.message ?? error)}` } }
      }
    }

    const money = (n) => (n === null || n === undefined ? '—' : `¥${(Number(n) || 0).toFixed(2)}`)
    // Sub-cent hourly prices (retained disks, storage) would round to ¥0.00.
    const moneyFine = (n) => {
      const v = Number(n) || 0
      return v > 0 && v < 0.01 ? `¥${v.toFixed(4)}` : money(v)
    }
    const pct = (n) => `${Math.max(0, Math.min(100, Number(n) || 0))}%`

    function fmtBytes(bytes) {
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

    function fmtDuration(seconds) {
      const s = Math.max(0, Number(seconds) || 0)
      if (s < 60) return `${Math.round(s)}s`
      const hours = Math.floor(s / 3600)
      const minutes = Math.floor((s % 3600) / 60)
      if (hours >= 24) return `${Math.floor(hours / 24)}d${hours % 24}h`
      if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`
      return `${minutes}m`
    }

    /** Images saved through the API are named after their own id. */
    function displayName(image) {
      const name = String(image.name ?? '')
      if (name && name !== image.id) return name
      return `未命名镜像 · ${String(image.id).slice(0, 8)}`
    }

    const STATUS_KIND = { running: 'ok', stopped: 'idle', transition: 'warn', error: 'danger', unknown: 'idle' }
    const IMAGE_KIND = { ready: 'ok', transition: 'warn', error: 'danger', unknown: 'idle' }

    /** Fire-and-forget report to the Host: mount proof and render errors. */
    function report(op, payload) {
      try {
        void fetch('/xiangongyun/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, ...(payload ?? {}) }),
        }).catch(() => {})
      } catch {
        /* diagnostics must never break the page */
      }
    }

    function copyText(text) {
      try {
        void navigator.clipboard?.writeText(text)
        return true
      } catch {
        return false
      }
    }

    // ------------------------------------------------------------ primitives
    function Btn({ children, variant, size, onClick, disabled, title, type }) {
      return h('button', {
        className: 'xgc-btn',
        type: type ?? 'button',
        'data-variant': variant ?? 'default',
        'data-size': size ?? 'md',
        onClick,
        disabled,
        title,
      }, children)
    }

    function Icon({ name, size = 14 }) {
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      }
      const paths = {
        refresh: ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'],
        close: ['M18 6 6 18', 'M6 6l12 12'],
        expand: ['M8 3H5a2 2 0 0 0-2 2v3', 'M16 3h3a2 2 0 0 1 2 2v3', 'M8 21H5a2 2 0 0 1-2-2v-3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
        shrink: ['M9 3v4a2 2 0 0 1-2 2H3', 'M15 3v4a2 2 0 0 0 2 2h4', 'M9 21v-4a2 2 0 0 0-2-2H3', 'M15 21v-4a2 2 0 0 1 2-2h4'],
        copy: ['M9 9h10v10H9z', 'M15 9V5H5v10h4'],
        power: ['M12 3v9', 'M18.4 6.6a9 9 0 1 1-12.8 0'],
        stop: ['M6 6h12v12H6z'],
        save: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
        trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14'],
        alert: ['M12 3 2 21h20L12 3z', 'M12 9v5', 'M12 17h.01'],
        check: ['M4 12l5 5L20 6'],
        plus: ['M12 5v14', 'M5 12h14'],
        external: ['M14 4h6v6', 'M20 4 10 14', 'M18 14v6H4V6h6'],
        cloud: ['M7 18a4 4 0 0 1 .6-7.96A6 6 0 0 1 19 11.5 3.5 3.5 0 0 1 18 18H7z'],
      }
      const d = paths[name] ?? paths.alert
      return h('svg', common, d.map((p, i) => h('path', { key: i, d: p })))
    }

    function Pill({ kind = 'idle', children, title }) {
      const color = kind === 'ok' ? T.ok : kind === 'danger' ? T.danger : kind === 'warn' ? T.warn : T.muted
      return h('span', {
        title,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '1px 8px',
          borderRadius: '999px',
          fontSize: '11px',
          border: `1px solid ${color}`,
          color,
          whiteSpace: 'nowrap',
        },
      }, h('span', {
        style: { width: '6px', height: '6px', borderRadius: '50%', background: color, flex: 'none' },
      }), children)
    }

    function Field({ label, hint, error, children }) {
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
        label ? h('span', { style: { fontSize: '12px', fontWeight: 600 } }, label) : null,
        children,
        hint ? h('span', { style: { fontSize: '11px', color: T.muted } }, hint) : null,
        error ? h('span', { style: { fontSize: '11px', color: T.danger } }, error) : null)
    }

    function TextInput({ value, onChange, type, placeholder, mono, id, disabled, autoFocus }) {
      return h('input', {
        id,
        className: 'xgc-input',
        'data-mono': mono ? '1' : '0',
        type: type ?? 'text',
        value: value ?? '',
        placeholder,
        disabled,
        autoFocus: Boolean(autoFocus),
        onChange: (e) => onChange?.(e.target.value),
      })
    }

    function TextArea({ value, onChange, rows, placeholder }) {
      return h('textarea', {
        className: 'xgc-area',
        rows: rows ?? 3,
        value: value ?? '',
        placeholder,
        onChange: (e) => onChange?.(e.target.value),
      })
    }

    function Sel({ value, onChange, options, id, disabled, ariaLabel }) {
      return h('select', {
        id,
        'aria-label': ariaLabel,
        className: 'xgc-select',
        value: value ?? '',
        disabled,
        onChange: (e) => onChange?.(e.target.value),
      }, options.map((opt) => h('option', { key: String(opt.value), value: opt.value }, opt.label)))
    }

    function Toggle({ checked, onChange, label, hint, disabled }) {
      return h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
        h('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          disabled,
          onClick: () => onChange?.(!checked),
          style: {
            width: '34px',
            height: '20px',
            borderRadius: '999px',
            border: `1px solid ${checked ? T.brand : T.line2}`,
            background: checked ? T.brand : 'transparent',
            position: 'relative',
            cursor: disabled ? 'not-allowed' : 'pointer',
            flex: 'none',
            marginTop: '1px',
            padding: 0,
          },
        }, h('span', {
          style: {
            position: 'absolute',
            top: '2px',
            left: checked ? '16px' : '2px',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: checked ? '#fff' : T.muted,
            transition: 'left .12s ease',
          },
        })),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
          h('span', { style: { fontSize: '13px' } }, label),
          hint ? h('span', { style: { fontSize: '11px', color: T.muted } }, hint) : null))
    }

    function Spinner({ label }) {
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', color: T.muted, fontSize: '12px' } },
        h('span', {
          style: {
            width: '12px', height: '12px', borderRadius: '50%',
            border: `2px solid ${T.line2}`, borderTopColor: T.brand,
            animation: 'xgc-spin 0.9s linear infinite',
          },
        }),
        h('style', null, '@keyframes xgc-spin{to{transform:rotate(360deg)}}'),
        label)
    }

    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

    function Modal({ open, title, onClose, children, footer, width = 560, danger }) {
      const ref = useRef(null)
      // The parent re-renders on every poll; a changing onClose must not re-run
      // this effect or it yanks focus out of the type-to-confirm field.
      const closeRef = useRef(onClose)
      closeRef.current = onClose
      const restoreRef = useRef(null)
      useEffect(() => {
        if (!open) return undefined
        restoreRef.current = document.activeElement
        const onKey = (e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            closeRef.current?.()
            return
          }
          if (e.key !== 'Tab' || !ref.current) return
          const nodes = [...ref.current.querySelectorAll(FOCUSABLE)]
            .filter((node) => node.offsetParent !== null || node === document.activeElement)
          if (nodes.length === 0) return
          const first = nodes[0]
          const last = nodes[nodes.length - 1]
          if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        }
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', onKey, true)
        const timer = setTimeout(() => {
          const node = ref.current
          if (!node || node.contains(document.activeElement)) return
          node.focus?.()
        }, 40)
        return () => {
          document.body.style.overflow = prev
          window.removeEventListener('keydown', onKey, true)
          clearTimeout(timer)
          const back = restoreRef.current
          if (back && typeof back.focus === 'function') back.focus()
        }
      }, [open])
      if (!open) return null
      return h('div', {
        style: {
          position: 'fixed', inset: 0, zIndex: 2147483200, display: 'flex',
          // shell.overlay is click-through; a modal that is a sibling of the
          // popup must opt back into pointer events itself.
          pointerEvents: 'auto',
          alignItems: 'center', justifyContent: 'center', padding: '16px',
          background: 'rgba(0,0,0,.45)',
        },
        onMouseDown: (e) => { if (e.target === e.currentTarget) onClose?.() },
      }, h('div', {
        ref,
        tabIndex: -1,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        style: {
          width: `min(${width}px, 100%)`,
          maxHeight: 'min(86vh, 760px)',
          display: 'flex', flexDirection: 'column',
          background: T.overlay, color: T.text,
          border: `1px solid ${danger ? T.danger : T.line2}`,
          borderRadius: '14px',
          boxShadow: '0 18px 50px rgba(0,0,0,.35)',
          outline: 'none',
        },
      },
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 16px', borderBottom: `1px solid ${T.line}`,
        },
      },
      h('strong', { style: { fontSize: '14px', flex: 1 } }, title),
      h(Btn, { size: 'sm', onClick: onClose, title: 'Esc' }, h(Icon, { name: 'close' }))),
      h('div', { className: 'xgc-scroll', style: { padding: '14px 16px', overflow: 'auto' } }, children),
      footer ? h('div', {
        style: {
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '12px 16px', borderTop: `1px solid ${T.line}`,
        },
      }, footer) : null))
    }

    function Banner({ level = 'warn', children, action }) {
      const color = level === 'error' || level === 'danger' ? T.danger : level === 'ok' ? T.ok : T.warn
      return h('div', {
        style: {
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '8px 10px', borderRadius: '9px',
          border: `1px solid ${color}`, color: T.text,
          background: T.layer1, fontSize: '12px',
        },
      },
      h('span', { style: { color, flex: 'none', marginTop: '1px' } }, h(Icon, { name: level === 'ok' ? 'check' : 'alert' })),
      h('div', { className: 'xgc-grow' }, children),
      action)
    }

    function Empty({ title, hint, action }) {
      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          padding: '34px 16px', border: `1px dashed ${T.line2}`, borderRadius: '12px',
          color: T.muted, textAlign: 'center',
        },
      },
      h('div', { style: { fontSize: '13px', color: T.text } }, title),
      hint ? h('div', { style: { fontSize: '12px' } }, hint) : null,
      action)
    }

    function Stat({ label, value, sub, tone }) {
      const color = tone === 'danger' ? T.danger : tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : T.text
      return h('div', {
        style: {
          border: `1px solid ${T.line}`, background: T.layer1,
          borderRadius: '12px', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0,
        },
      },
      h('span', { style: { fontSize: '11px', color: T.muted } }, label),
      h('span', {
        style: { fontSize: '20px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' },
      }, value),
      sub ? h('span', { style: { fontSize: '11px', color: T.muted } }, sub) : null)
    }

    function Progress({ value, label }) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '90px' } },
        label ? h('span', { style: { fontSize: '11px', color: T.muted } }, label) : null,
        h('div', { style: { height: '5px', borderRadius: '3px', background: T.layer2, overflow: 'hidden' } },
          h('div', {
            style: {
              width: pct(value), height: '100%', borderRadius: '3px',
              background: T.brand, transition: 'width .3s ease',
            },
          })))
    }

    // ------------------------------------------------------------- data hook
    function useSnapshot(t, options = {}) {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(true)
      const forceAlways = Boolean(options.force)
      const explicitMs = Number(options.intervalMs) || 0

      const load = useCallback(async (force) => {
        const res = await api('state', { force: Boolean(force) || forceAlways })
        if (res.ok) {
          setData(res.data)
          setError(res.data?.warnings?.length ? { code: -3, msg: res.data.warnings.join('；') } : null)
        } else {
          setError(res.error ?? { code: -1, msg: t('common.unknown', '未知错误') })
          if (res.data) setData(res.data)
        }
        setLoading(false)
      }, [t])

      useEffect(() => {
        void load(false)
      }, [load])

      const hasJobs = Boolean(data?.jobs?.some((job) => job.state === 'running'))
      const configuredMs = explicitMs || Math.max(5000, (Number(data?.config?.refreshSeconds) || 30) * 1000)
      // A running job needs a livelier cadence than the chosen interval.
      const periodMs = hasJobs ? Math.min(configuredMs, 3000) : configuredMs
      useEffect(() => {
        const timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return
          void load(false)
        }, periodMs)
        return () => clearInterval(timer)
      }, [periodMs, load])

      return { data, error, loading, reload: load }
    }

    // ---------------------------------------------------------------- pieces
    function AlertStack({ alerts, t }) {
      if (!alerts || alerts.length === 0) {
        return h('div', { style: { fontSize: '12px', color: T.muted, display: 'flex', alignItems: 'center', gap: '6px' } },
          h('span', { style: { color: T.ok } }, h(Icon, { name: 'check' })), t('overview.noAlerts', '一切正常'))
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        alerts.map((alert, index) => h(Banner, {
          key: index,
          level: alert.level === 'error' ? 'error' : alert.level === 'info' ? 'warn' : 'warn',
        }, alert.text)))
    }

    function JobList({ jobs, t }) {
      // Keep running jobs plus anything that settled within the last 10 minutes.
      const visible = (jobs ?? []).filter((job) => job.state === 'running'
        || (job.finishedAt && Date.now() - Date.parse(job.finishedAt) < 10 * 60_000))
      if (visible.length === 0) {
        return h('div', { style: { fontSize: '12px', color: T.muted } }, t('overview.noJobs', '没有进行中的任务'))
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        visible.map((job) => h('div', {
          key: job.id,
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '7px 10px', borderRadius: '9px', border: `1px solid ${T.line}`,
            background: T.layer1, fontSize: '12px',
          },
        },
        h(Pill, { kind: job.state === 'running' ? 'warn' : job.state === 'done' ? 'ok' : job.state === 'error' ? 'danger' : 'warn' },
          job.state === 'running' ? '进行中' : job.state === 'done' ? '完成' : job.state === 'error' ? '失败' : '待确认'),
        h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          `${job.target} — ${job.message || job.kind}`),
        job.state === 'running' ? h(Progress, { value: job.progress }) : null)))
    }

    // ---------------------------------------------------------------- views
    function OverviewView({ snap, t, nav }) {
      const cost = snap.cost ?? {}
      const counts = {
        instances: snap.instances.length,
        running: snap.instances.filter((i) => i.status.key === 'running').length,
        images: snap.images.length,
        bytes: snap.images.reduce((sum, i) => sum + i.size, 0),
        monthly: snap.images.reduce((sum, i) => sum + i.estStorageCostPerMonth, 0),
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('div', {
          style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '10px' },
          className: 'xgc-cards',
        },
        h(Stat, {
          label: t('overview.todayCost', '今日估算'),
          value: money(cost.todayEstimate),
          sub: `${t('overview.instancePart', '实例')} ${money(cost.instancePart)} · ${t('overview.retainPart', '关机保留')} ${money(cost.retainPart)} · ${t('overview.storagePart', '存储')} ${money(cost.storagePart)}`,
        }),
        h(Stat, {
          label: t('overview.running', '运行中实例'),
          value: `${counts.running} / ${counts.instances}`,
          tone: counts.running > 0 ? 'warn' : 'ok',
        }),
        h(Stat, { label: t('overview.images', '私有镜像'), value: String(counts.images) }),
        h(Stat, {
          label: t('overview.imageBytes', '镜像占用'),
          value: fmtBytes(counts.bytes),
          sub: `${money(counts.monthly)}${t('overview.perMonth', '/月')}（估算）`,
        })),

        h('div', { className: 'xgc-stack', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: '14px' } },
          h('section', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            h('div', { style: { fontSize: '12px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.04em' } },
              t('overview.alerts', '告警')),
            h(AlertStack, { alerts: snap.alerts, t })),
          h('section', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            h('div', { style: { fontSize: '12px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.04em' } },
              t('overview.jobs', '进行中的任务')),
            h(JobList, { jobs: snap.jobs, t }))),

        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h(Btn, { onClick: () => nav('images') }, t('nav.images', '镜像')),
          h(Btn, { onClick: () => nav('deploy') }, t('nav.deploy', '部署')),
          h('span', { style: { flex: 1 } }),
          h('span', { style: { fontSize: '11px', color: T.muted, alignSelf: 'center' } },
            `${snap.account.nickname || ''} ${snap.account.phone || ''}`.trim())),

        h('div', { style: { fontSize: '11px', color: T.muted } },
          (cost.note ?? '')
          + (cost.estimatedInstances
            ? ` · 其中 ${cost.estimatedInstances} 台开机时间未回传，按「距上次关机」估算（偏大）`
            : '')))
    }

    function InstanceRow({ item, t, act, confirm, openDrawer, onBoot }) {
      const running = item.status.key === 'running'
      const busy = item.status.key === 'transition'
      return h('tr', null,
        h('td', null,
          h('div', { style: { display: 'flex', flexDirection: 'column' } },
            h('span', { style: { fontWeight: 600 } }, item.name),
            h('span', { style: { fontSize: '11px', color: T.muted } }, `${item.id} · ${item.dataCenter || '—'}`))),
        h('td', null, h(Pill, { kind: STATUS_KIND[item.status.key] ?? 'idle' },
          busy ? `${item.status.label} ${item.progress ? pct(item.progress) : ''}`.trim() : item.status.label)),
        h('td', { className: 'xgc-hide-sm' },
          h('div', { style: { display: 'flex', flexDirection: 'column' } },
            h('span', null, `${item.gpuModel} × ${item.gpuUsed}`),
            h('span', { style: { fontSize: '11px', color: T.muted } }, `${item.cpuCores} 核 · ${fmtBytes(item.memorySize)}`))),
        h('td', { style: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
          h('div', { style: { display: 'flex', flexDirection: 'column' } },
            h('span', null, `${money(item.pricePerHour)}/h`),
            item.retain
              ? h('span', { style: { fontSize: '11px', color: T.muted } },
                  `${t('instances.retain', '关机保留磁盘')} ${moneyFine(item.retainPrice)}/h`)
              : null)),
        h('td', { className: 'xgc-hide-sm', style: { whiteSpace: 'nowrap' } },
          item.uptimeSeconds === null || item.uptimeSeconds === undefined
            ? h('span', { title: '平台未回传本次开机时间' }, '—')
            : h('span', {
                title: item.runningSinceEstimated
                  ? '平台不回传本次开机时间；这里按时距上次关机估算，实际只多不少'
                  : undefined,
              }, `${item.runningSinceEstimated ? '≥ ' : ''}${fmtDuration(item.uptimeSeconds)}`)),
        h('td', null,
          h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' } },
            running
              ? h(Btn, { size: 'sm', onClick: () => act('instance.action', { id: item.id, action: 'release' }, '已下发释放 GPU') },
                  t('instances.release', '关机释放 GPU'))
              : null,
            running
              ? h(Btn, { size: 'sm', onClick: () => act('instance.action', { id: item.id, action: 'shutdown' }, '已下发关机') },
                  t('instances.shutdown', '关机（保留 GPU）'))
              : null,
            !running && !busy
              ? h(Btn, { size: 'sm', variant: 'primary', onClick: () => onBoot?.(item) },
                  t('instances.boot', '开机'))
              : null,
            item.status.key === 'stopped'
              ? h(Btn, { size: 'sm', onClick: () => act('instance.action', { id: item.id, action: 'saveImage' }, '已下发存镜像') },
                  t('instances.save', '存镜像'))
              : null,
            h(Btn, { size: 'sm', onClick: () => openDrawer({ kind: 'instance', id: item.id }) },
              t('common.detail', '详情')))))
    }

    function InstancesView({ snap, t, act, confirm, openDrawer, onBoot }) {
      if (snap.instances.length === 0) {
        return h(Empty, { title: t('instances.empty', '还没有实例。'), hint: t('instances.emptyHint', '到「部署」页用镜像起一台。') })
      }
      return h('div', { style: { overflowX: 'auto' } },
        h('table', { className: 'xgc-table' },
          h('thead', null, h('tr', null,
            h('th', null, t('instances.name', '名称')),
            h('th', null, t('instances.status', '状态')),
            h('th', { className: 'xgc-hide-sm' }, t('instances.gpu', 'GPU')),
            h('th', null, t('instances.price', '单价')),
            h('th', { className: 'xgc-hide-sm' }, t('instances.uptime', '运行时长')),
            h('th', { style: { textAlign: 'right' } }, t('common.detail', '操作')))),
          h('tbody', null, snap.instances.map((item) => h(InstanceRow, {
            key: item.id, item, t, act, confirm, openDrawer, onBoot,
          })))))
    }

    function ImageRow({ item, t, act, confirm, openDrawer, selected, toggleSelect }) {
      const tags = item.annotation?.tags ?? []
      const expectText = item.name === item.id ? item.id.slice(0, 8) : item.name
      const keep = Boolean(item.annotation?.keep)
      return h('tr', null,
        h('td', { style: { width: '28px' } },
          h('input', {
            type: 'checkbox',
            'aria-label': displayName(item),
            checked: selected,
            onChange: () => toggleSelect(item.id),
          })),
        h('td', null,
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
            h('button', {
              className: 'xgc-link',
              style: { fontWeight: 600, textAlign: 'left' },
              onClick: () => openDrawer({ kind: 'image', id: item.id }),
            }, displayName(item)),
            keep ? h('span', { className: 'xgc-chip', title: t('images.keep', '保留'), style: { borderColor: T.ok, color: T.ok } }, '★ ' + t('images.keep', '保留')) : null),
          tags.length
            ? h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' } },
                tags.map((tag) => h('span', { key: tag, className: 'xgc-chip' }, tag)),
                item.annotation?.note ? h('span', { style: { fontSize: '11px', color: T.muted } }, item.annotation.note) : null)
            : null),
        h('td', { style: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }, item.sizeText),
        h('td', { className: 'xgc-hide-sm', style: { whiteSpace: 'nowrap' } },
          item.ageDays === null ? '—' : `${item.ageDays}d`),
        h('td', null, h(Pill, { kind: IMAGE_KIND[item.status.key] ?? 'idle' }, item.status.label)),
        h('td', { className: 'xgc-hide-sm', style: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } },
          `${money(item.estStorageCostPerMonth)}${t('overview.perMonth', '/月')}`),
        h('td', null,
          h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
            h(Btn, {
              size: 'sm',
              onClick: () => openDrawer({ kind: 'image', id: item.id }),
            }, t('common.detail', '详情')),
            h(Btn, {
              size: 'sm',
              variant: 'danger',
              disabled: keep,
              title: keep ? t('images.keepOn', '已标记保留，先取消保留才能删除') : undefined,
              onClick: () => confirm({
                title: t('common.delete', '删除') + ' · ' + displayName(item),
                body: `删除后不可恢复：${displayName(item)}（${item.sizeText}）`,
                expect: expectText,
                danger: true,
                run: () => act('image.destroy', { id: item.id, confirmText: expectText }, '镜像已删除'),
              }),
            }, t('common.delete', '删除')))))
    }

    function ImagesView({ snap, t, act, confirm, openDrawer, onNav }) {
      const [query, setQuery] = useState('')
      const [filter, setFilter] = useState('all')
      const [sort, setSort] = useState('size')
      const [selected, setSelected] = useState({})

      const staleDays = Number(snap.config?.staleImageWarnDays) || 90
      const rows = useMemo(() => {
        let list = [...snap.images]
        if (filter === 'keep') list = list.filter((i) => i.annotation?.keep)
        if (filter === 'tagged') list = list.filter((i) => (i.annotation?.tags?.length ?? 0) > 0)
        if (filter === 'stale') list = list.filter((i) => (i.ageDays ?? 0) >= staleDays && !i.annotation?.keep)
        const q = query.trim().toLowerCase()
        if (q) {
          list = list.filter((i) =>
            i.name.toLowerCase().includes(q)
            || (i.annotation?.note ?? '').toLowerCase().includes(q)
            || (i.annotation?.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
            || i.id.toLowerCase().includes(q))
        }
        if (sort === 'size') list.sort((a, b) => b.size - a.size)
        else if (sort === 'age') list.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
        else list.sort((a, b) => a.name.localeCompare(b.name))
        return list
      }, [snap.images, filter, query, sort, staleDays])

      const selectedIds = Object.keys(selected).filter((id) => selected[id])
      const toggleSelect = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }))

      if (snap.images.length === 0) {
        return h(Empty, {
          title: t('images.empty', '还没有私有镜像。'),
          hint: t('images.emptyHint', '在实例详情里点「存镜像」就会出现在这里。'),
          action: h(Btn, { onClick: () => onNav?.('instances') }, t('nav.instances', '实例')),
        })
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
          h('div', { style: { flex: '1 1 220px', minWidth: '160px' } },
            h(TextInput, { value: query, onChange: setQuery, placeholder: t('images.search', '搜索名称、标签、备注…') })),
          h('div', { style: { width: '150px' } },
            h(Sel, {
              value: filter,
              ariaLabel: t('images.filter', '筛选'),
              onChange: setFilter,
              options: [
                { value: 'all', label: t('images.filter.all', '全部') },
                { value: 'keep', label: t('images.filter.keep', '仅保留') },
                { value: 'stale', label: t('images.filter.stale', '仅超期未用') },
                { value: 'tagged', label: t('images.filter.tagged', '仅有标签') },
              ],
            })),
          h('div', { style: { width: '130px' } },
            h(Sel, {
              value: sort,
              ariaLabel: t('images.sort', '排序'),
              onChange: setSort,
              options: [
                { value: 'size', label: t('images.sort.size', '按大小') },
                { value: 'age', label: t('images.sort.age', '按时间') },
                { value: 'name', label: t('images.sort.name', '按名称') },
              ],
            })),
          h(Btn, {
            variant: 'danger',
            disabled: selectedIds.length === 0,
            onClick: () => confirm({
              title: `${t('images.batch', '批量删除')} (${selectedIds.length})`,
              body: `将删除 ${selectedIds.length} 个镜像，不可恢复。保留白名单中的镜像会被跳过。`,
              expect: `DELETE ${selectedIds.length}`,
              danger: true,
              run: async () => {
                const res = await act('image.batchDestroy', {
                  ids: selectedIds,
                  confirmText: `DELETE ${selectedIds.length}`,
                })
                if (!res?.ok) return
                const removed = Number(res.data?.removed ?? 0)
                const failures = (res.data?.results ?? [])
                  .filter((item) => !item.ok)
                  .map((item) => item.error?.msg)
                  .filter(Boolean)
                setToast({
                  level: removed === selectedIds.length ? 'ok' : 'error',
                  text: `已删除 ${removed}/${selectedIds.length}`
                    + (failures.length ? `；未删除：${failures.slice(0, 2).join('；')}` : ''),
                })
                if (removed === selectedIds.length) setSelected({})
              },
            }),
          }, `${t('images.batch', '批量删除')}${selectedIds.length ? ` (${selectedIds.length})` : ''}`)),

        h('div', { style: { overflowX: 'auto' } },
          h('table', { className: 'xgc-table' },
            h('thead', null, h('tr', null,
              h('th', { style: { width: '28px' } }, h('input', {
                type: 'checkbox',
                'aria-label': '全选当前列表',
                checked: rows.length > 0 && rows.every((row) => selected[row.id]),
                onChange: (e) => {
                  const next = {}
                  for (const row of rows) next[row.id] = e.target.checked
                  setSelected(next)
                },
              })),
              h('th', null, t('images.name', '名称')),
              h('th', null, t('images.size', '大小')),
              h('th', { className: 'xgc-hide-sm' }, t('images.age', '年龄')),
              h('th', null, t('images.status', '状态')),
              h('th', { className: 'xgc-hide-sm' }, t('images.cost', '估算存储')),
              h('th', { style: { textAlign: 'right' } }, t('common.detail', '操作')))),
            h('tbody', null, rows.map((item) => h(ImageRow, {
              key: item.id,
              item,
              t,
              act,
              confirm,
              openDrawer,
              selected: Boolean(selected[item.id]),
              toggleSelect,
            }))))),

        rows.length === 0
          ? h('div', { style: { fontSize: '12px', color: T.muted, padding: '8px 2px' } }, '没有符合筛选条件的镜像')
          : h('div', { style: { fontSize: '11px', color: T.muted } },
              `${rows.length} / ${snap.images.length} 个 · 合计 ${fmtBytes(rows.reduce((s, i) => s + i.size, 0))}`))
    }

    function InstanceDrawer({ id, t, act, confirm, onClose, onBoot, readOnly }) {
      const [detail, setDetail] = useState(null)
      const [error, setError] = useState(null)
      const [revealed, setRevealed] = useState({})

      useEffect(() => {
        let alive = true
        void (async () => {
          const res = await api('instance.get', { id })
          if (!alive) return
          if (res.ok) setDetail(res.data)
          else setError(res.error)
        })()
        return () => { alive = false }
      }, [id])

      const reveal = async (field) => {
        if (revealed[field]) {
          setRevealed((prev) => ({ ...prev, [field]: '' }))
          return
        }
        const res = await api('reveal', { id, field })
        if (res.ok) setRevealed((prev) => ({ ...prev, [field]: res.data.value }))
        else setError(res.error)
      }

      const row = (label, value) => h('div', {
        style: { display: 'flex', gap: '10px', padding: '4px 0', borderBottom: `1px solid ${T.line}` },
      },
      h('span', { style: { width: '110px', color: T.muted, flex: 'none', fontSize: '12px' } }, label),
      h('span', { style: { flex: 1, minWidth: 0, wordBreak: 'break-all' } }, value))

      const secretRow = (label, field) => h('div', {
        style: { display: 'flex', gap: '10px', padding: '4px 0', borderBottom: `1px solid ${T.line}`, alignItems: 'center' },
      },
      h('span', { style: { width: '110px', color: T.muted, flex: 'none', fontSize: '12px' } }, label),
      h('span', { style: { flex: 1, minWidth: 0, fontFamily: 'ui-monospace,monospace', fontSize: '12px', wordBreak: 'break-all' } },
        revealed[field] || '••••••••'),
      h(Btn, { size: 'sm', onClick: () => reveal(field) }, revealed[field] ? t('instances.hide', '隐藏') : t('instances.reveal', '显示')),
      revealed[field] ? h(Btn, { size: 'sm', onClick: () => copyText(revealed[field]) }, t('common.copy', '复制')) : null)

      const running = detail?.status?.key === 'running'

      return h(Modal, {
        open: true,
        onClose,
        width: 620,
        title: detail ? `${displayName(detail)} · ${detail.id}` : t('common.loading', '加载中…'),
        footer: detail && !readOnly
          ? h(React.Fragment, null,
              h('div', { style: { flex: 1 } }),
              h(Btn, {
                onClick: () => act('instance.action', { id, action: 'saveImage' }, '已下发存镜像'),
                disabled: detail.status?.key !== 'stopped',
              }, t('instances.save', '存镜像')),
              detail.status?.key === 'stopped'
                ? h(Btn, {
                    variant: 'danger',
                    onClick: () => confirm({
                      title: t('instances.destroy', '销毁') + ' · ' + detail.name,
                      body: '先把实例保存成镜像，然后销毁实例：镜像留下，实例与磁盘消失。不可恢复。',
                      expect: detail.name,
                      danger: true,
                      run: async () => {
                        const res = await act(
                          'instance.action',
                          { id, action: 'saveImageDestroy', confirmText: detail.name },
                          '已下发存镜像并销毁',
                        )
                        if (res?.ok) onClose?.()
                      },
                    }),
                  }, t('instances.saveDestroy', '存镜像并销毁'))
                : null,
              running
                ? h(Btn, { onClick: () => act('instance.action', { id, action: 'release' }, '已下发释放 GPU') },
                    t('instances.release', '关机释放 GPU'))
                : h(Btn, { variant: 'primary', onClick: () => onBoot?.(detail) },
                    t('instances.boot', '开机')),
              h(Btn, {
                variant: 'danger',
                onClick: () => confirm({
                  title: t('instances.destroy', '销毁') + ' · ' + detail.name,
                  body: '销毁后实例与其磁盘不可恢复。如果里面有环境，请先「存镜像」。',
                  expect: detail.name,
                  danger: true,
                  run: async () => {
                    const res = await act('instance.action', { id, action: 'destroy', confirmText: detail.name }, '已下发销毁')
                    if (res?.ok) onClose?.()
                  },
                }),
              }, t('instances.destroy', '销毁')))
          : null,
      },
      error ? h(Banner, { level: 'error' }, error.msg) : null,
      detail && detail.status?.key !== 'stopped'
        ? h('div', { style: { marginBottom: '10px' } },
            h(Banner, { level: 'warn' }, t('instances.saveNeedsShutdown', '实例需要先关机才能存镜像。')))
        : null,
      detail
        ? h('div', { style: { display: 'flex', flexDirection: 'column' } },
            row(t('instances.status', '状态'), h(Pill, { kind: STATUS_KIND[detail.status.key] ?? 'idle' }, detail.status.label)),
            row(t('instances.gpu', 'GPU'), `${detail.gpuModel} × ${detail.gpuUsed} · ${detail.cpuModel}/${detail.cpuCores} 核 · ${fmtBytes(detail.memorySize)}`),
            row(t('instances.price', '单价'), `${money(detail.pricePerHour)}/h（GPU ${money(detail.basePrice)} + 镜像 ${money(detail.imagePrice)}）`),
            row(t('instances.disk', '磁盘'), `系统盘 ${fmtBytes(detail.systemDiskSize)} · 数据盘 ${fmtBytes(detail.dataDiskSize)}`
              + (detail.retain ? ` · 保留 ${fmtBytes(detail.retainSize)} @ ${moneyFine(detail.retainPrice)}/h` : '')),
            row(t('instances.image', '镜像'), `${detail.image.id || '—'}（${detail.image.type || '—'}）`),
            row(t('instances.ssh', 'SSH'), `${detail.ssh.user}@${detail.ssh.host}:${detail.ssh.port}`),
            detail.ssh.hasPassword ? secretRow('SSH 密码', 'password') : null,
            detail.jupyter.url ? row(t('instances.jupyter', 'Jupyter'), h('a', {
              className: 'xgc-link', href: detail.jupyter.url, target: '_blank', rel: 'noreferrer',
            }, detail.jupyter.url)) : null,
            detail.jupyter.hasToken ? secretRow('Jupyter Token', 'jupyter_token') : null,
            detail.comfyUrl
              ? row('ComfyUI', h('span', {
                  style: { display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0, flexWrap: 'wrap' },
                },
                h('a', {
                  className: 'xgc-link',
                  href: detail.comfyUrl,
                  target: '_blank',
                  rel: 'noreferrer',
                  style: { wordBreak: 'break-all' },
                }, detail.comfyUrl),
                h(Btn, { size: 'sm', onClick: () => copyText(detail.comfyUrl) }, t('common.copy', '复制')),
                detail.status?.key === 'running'
                  ? null
                  : h('span', { style: { fontSize: '11px', color: T.muted } }, '需开机后可访问')))
              : null,
            detail.hasCosToken ? secretRow('COS Token', 'xgcos_token') : null,
            detail.createdAt ? row('创建时间', new Date(detail.createdAt).toLocaleString()) : null,
            detail.startedAt
              ? row('首次启动', new Date(detail.startedAt).toLocaleString()
                  + (detail.bootTimeKnown === false ? '（本次开机时间平台未回传，运行时长按时距上次关机估算）' : ''))
              : null,
            h('div', { style: { marginTop: '10px', fontSize: '11px', color: T.muted } },
              t('instances.saveHint', '把当前实例的系统盘保存成一个私有镜像。')))
        : h(Spinner, { label: t('common.loading', '加载中…') }))
    }

    function ImageDrawer({ id, t, act, confirm, onClose, onDeploy }) {
      const [detail, setDetail] = useState(null)
      const [error, setError] = useState(null)
      const [tags, setTags] = useState('')
      const [note, setNote] = useState('')
      const [keep, setKeep] = useState(false)
      const [saving, setSaving] = useState(false)

      useEffect(() => {
        let alive = true
        void (async () => {
          const res = await api('image.get', { id })
          if (!alive) return
          if (res.ok) {
            setDetail(res.data)
            setTags((res.data.annotation?.tags ?? []).join(', '))
            setNote(res.data.annotation?.note ?? '')
            setKeep(Boolean(res.data.annotation?.keep))
          } else setError(res.error)
        })()
        return () => { alive = false }
      }, [id])

      const save = async () => {
        setSaving(true)
        const res = await api('image.annotate', {
          id,
          patch: { tags: tags.split(',').map((s) => s.trim()).filter(Boolean), note, keep },
        })
        setSaving(false)
        if (res.ok) setDetail((prev) => ({ ...prev, annotation: res.data }))
        else setError(res.error)
      }

      return h(Modal, {
        open: true,
        onClose,
        width: 600,
        title: detail ? displayName(detail) : t('common.loading', '加载中…'),
        footer: detail
          ? h(React.Fragment, null,
              h(Btn, { onClick: () => onDeploy(detail) }, t('images.deploy', '部署')),
              h(Btn, {
                variant: 'danger',
                disabled: keep,
                title: keep ? t('images.keepOn', '已标记保留，先取消保留才能删除') : undefined,
                onClick: () => confirm({
                  title: t('common.delete', '删除') + ' · ' + displayName(detail),
                  body: '删除后不可恢复，且正在通过该镜像部署实例的操作会失败。',
                  expect: detail.name === id ? id.slice(0, 8) : detail.name,
                  danger: true,
                  run: async () => {
                    const confirmText = detail.name === id ? id.slice(0, 8) : detail.name
                    const res = await act('image.destroy', { id, confirmText }, '镜像已删除')
                    if (res?.ok) onClose?.()
                  },
                }),
              }, t('common.delete', '删除')))
          : null,
      },
      error ? h(Banner, { level: 'error' }, error.msg) : null,
      detail
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px', fontSize: '12px' } },
              h('div', null, `${t('images.size', '大小')}：${detail.sizeText}`),
              h('div', null, `${t('images.status', '状态')}：${detail.status.label}`),
              h('div', null, `${t('images.age', '年龄')}：${detail.ageDays ?? '—'} d`),
              h('div', null, `${t('images.cost', '估算存储')}：${money(detail.estStorageCostPerMonth)}/月`),
              h('div', null, `ID：${detail.id}`),
              h('div', null, `来源：${detail.originalImageName || '（自身）'}`)),
            detail.introduction ? h('div', { style: { fontSize: '12px', color: T.muted } }, detail.introduction) : null,
            h('hr', { style: { border: 'none', borderTop: `1px solid ${T.line}`, margin: '2px 0' } }),
            h(Field, { label: t('images.tagsField', '标签（逗号分隔，最多 8 个）') },
              h(TextInput, { value: tags, onChange: setTags, placeholder: 'cu128, 基线, 项目A' })),
            h(Field, { label: t('images.noteField', '备注') },
              h(TextArea, { value: note, onChange: setNote, rows: 2 })),
            h(Toggle, {
              checked: keep,
              onChange: setKeep,
              label: t('images.keepField', '保留白名单（禁止删除）'),
              hint: t('images.keepOn', '已标记保留，先取消保留才能删除'),
            }),
            h('div', { style: { display: 'flex', gap: '8px' } },
              h(Btn, { variant: 'primary', onClick: save, disabled: saving }, saving ? t('common.saving', '保存中…') : t('common.save', '保存')),
              h('span', { style: { fontSize: '11px', color: T.muted, alignSelf: 'center' } },
                '标签与备注只存在本地，不影响平台上的镜像')))
        : h(Spinner, { label: t('common.loading', '加载中…') }))
    }

    function DeployView({ snap, t, act, seed }) {
      const images = snap.images
      const [imageId, setImageId] = useState(seed?.id ?? images[0]?.id ?? '')
      const [manual, setManual] = useState(false)
      const [manualId, setManualId] = useState('')
      const [imageType, setImageType] = useState(images[0] ? 'private' : 'private')
      const [gpuModel, setGpuModel] = useState(snap.config?.gpuModels?.[1] ?? snap.config?.gpuModels?.[0] ?? '')
      const [gpuCount, setGpuCount] = useState(1)
      const [name, setName] = useState('')
      const [dataCenter, setDataCenter] = useState(String(snap.config?.dataCenterId ?? 1))
      const [storage, setStorage] = useState(false)
      const [busy, setBusy] = useState(false)
      const [result, setResult] = useState(null)

      useEffect(() => {
        if (!seed?.id) return
        setImageId(seed.id)
        setManual(false)
        setImageType('private')
      }, [seed])

      const submit = async () => {
        setBusy(true)
        setResult(null)
        const payload = {
          imageId: manual ? manualId.trim() : imageId,
          imageType,
          gpuModel,
          gpuCount: Number(gpuCount),
          name: name.trim() || undefined,
          dataCenterId: Number(dataCenter) || 1,
          storage,
        }
        const res = await act('deploy', payload, t('deploy.submitted', '已下发部署'))
        setBusy(false)
        if (res?.ok) setResult(res.data)
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '620px' } },
        h(Banner, { level: 'warn' }, t('deploy.hint', '部署是异步的：提交后会在「概览」显示进度。')),

        h(Field, { label: t('deploy.source', '来源镜像') },
          h('div', { style: { display: 'flex', gap: '8px' } },
            manual
              ? h(TextInput, { value: manualId, onChange: setManualId, placeholder: '镜像 ID', mono: true })
              : h(Sel, {
                  value: imageId,
                  onChange: setImageId,
                  options: images.length
                    ? images.map((image) => ({ value: image.id, label: `${displayName(image)} · ${image.sizeText}` }))
                    : [{ value: '', label: '（没有私有镜像，请手动输入 ID）' }],
                }),
            h(Btn, { size: 'sm', onClick: () => setManual((v) => !v) },
              manual ? '选列表' : t('deploy.manual', '手动输入')))),

        h('div', { className: 'xgc-stack', style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' } },
          h(Field, { label: t('deploy.imageType', '镜像类型') },
            h(Sel, {
              value: imageType,
              onChange: setImageType,
              options: [
                { value: 'private', label: 'private（私有镜像）' },
                { value: 'community', label: 'community（社区镜像）' },
                { value: 'public', label: 'public（公共镜像）' },
              ],
            })),
          h(Field, { label: t('deploy.dataCenter', '数据中心 ID') },
            h(TextInput, { value: dataCenter, onChange: setDataCenter, type: 'number' }))),

        h('div', { className: 'xgc-stack', style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' } },
          h(Field, { label: t('deploy.gpu', 'GPU 型号') },
            h(Sel, {
              value: gpuModel,
              onChange: setGpuModel,
              options: (snap.config?.gpuModels ?? []).map((model) => ({ value: model, label: model })),
            })),
          h(Field, { label: t('deploy.gpuCount', 'GPU 数量'), hint: '0–8' },
            h(TextInput, {
              value: gpuCount,
              onChange: (value) => setGpuCount(value),
              type: 'number',
            }))),

        h(Field, { label: t('deploy.name', '实例名') },
          h(TextInput, { value: name, onChange: setName, placeholder: 'train-01' })),

        h(Toggle, { checked: storage, onChange: setStorage, label: t('deploy.storage', '挂载云存储') }),

        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h(Btn, { variant: 'primary', onClick: submit, disabled: busy || (!manual && !imageId) || (manual && !manualId.trim()) },
            busy ? t('deploy.submitting', '部署中…') : t('deploy.submit', '部署')),
          h('span', { style: { fontSize: '12px', color: T.muted } },
            `${t('header.balance', '余额')} ${money(snap.account.balance)}`)),

        result
          ? h(Banner, { level: 'ok' },
              h('div', null,
                `${t('deploy.submitted', '已下发部署')}：${result.id}`,
                (result.warnings ?? []).length
                  ? h('ul', { style: { margin: '4px 0 0 16px', padding: 0 } },
                      result.warnings.map((w, i) => h('li', { key: i }, w)))
                  : null))
          : null)
    }

    function AccountView({ snap, t, act }) {
      const [amount, setAmount] = useState('50')
      const [payment, setPayment] = useState('alipay')
      const [order, setOrder] = useState(null)
      const [queryResult, setQueryResult] = useState(null)
      const [busy, setBusy] = useState(false)

      const create = async () => {
        setBusy(true)
        setQueryResult(null)
        const res = await act('recharge.create', { amount: Number(amount), payment }, '充值单已生成')
        setBusy(false)
        if (res?.ok) setOrder(res.data)
      }

      const query = async () => {
        if (!order?.trade_no) return
        const res = await api('recharge.query', { tradeNo: order.trade_no })
        setQueryResult(res.ok ? { ok: true, text: JSON.stringify(res.data) } : { ok: false, text: res.error?.msg })
      }

      const info = (label, value) => h('div', {
        style: { display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${T.line}`, fontSize: '13px' },
      },
      h('span', { style: { width: '110px', color: T.muted } }, label),
      h('span', { style: { flex: 1, wordBreak: 'break-all' } }, value))

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '620px' } },
        h('div', null,
          info(t('account.nickname', '昵称'), snap.account.nickname || '—'),
          info(t('account.phone', '手机'), snap.account.phone || '—'),
          info(t('account.uuid', '用户 ID'), snap.account.uuid || '—'),
          info(t('account.balance', '余额'), money(snap.account.balance))),

        h('section', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', { style: { fontWeight: 700, fontSize: '13px' } }, t('account.recharge', '充值')),
          h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' } },
            h('div', { style: { width: '140px' } },
              h(Field, { label: t('account.amount', '金额（元）') },
                h(TextInput, { value: amount, onChange: setAmount, type: 'number' }))),
            h('div', { style: { width: '140px' } },
              h(Field, { label: t('account.payment', '支付方式') },
                h(Sel, {
                  value: payment,
                  onChange: setPayment,
                  options: [
                    { value: 'alipay', label: t('account.alipay', '支付宝') },
                    { value: 'wechat', label: t('account.wechat', '微信') },
                  ],
                }))),
            h(Btn, { variant: 'primary', onClick: create, disabled: busy }, t('account.createOrder', '生成充值单'))),
          payment === 'wechat'
            ? h('div', { style: { fontSize: '11px', color: T.muted } }, t('account.wechatHint', '微信链接需要转成二维码后用微信 App 扫码。'))
            : null,
          order
            ? h('div', {
                style: {
                  display: 'flex', flexDirection: 'column', gap: '6px',
                  padding: '10px', border: `1px solid ${T.line2}`, borderRadius: '10px', fontSize: '12px',
                },
              },
              h('div', null, `${t('account.tradeNo', '订单号')}：${order.trade_no}`),
              h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                h('a', { className: 'xgc-btn', href: order.url, target: '_blank', rel: 'noreferrer' },
                  h(Icon, { name: 'external' }), t('account.open', '打开支付链接')),
                h(Btn, { size: 'sm', onClick: () => copyText(order.url) }, t('common.copy', '复制')),
                h(Btn, { size: 'sm', onClick: query }, t('account.query', '查询状态'))),
              queryResult
                ? h('div', { style: { color: queryResult.ok ? T.ok : T.danger, wordBreak: 'break-all' } }, queryResult.text)
                : null)
            : null))
    }

    function SettingsView({ snap, t, act, reload }) {
      const [token, setToken] = useState('')
      const [tokenBusy, setTokenBusy] = useState(false)
      const [tokenMsg, setTokenMsg] = useState(null)
      const [form, setForm] = useState(null)
      const [audit, setAudit] = useState(null)
      const [saving, setSaving] = useState(false)
      const [savedMsg, setSavedMsg] = useState('')

      // Initialise once: a periodic snapshot refresh must never overwrite what
      // the user is currently typing.
      useEffect(() => {
        if (form !== null) return
        setForm({
          refreshSeconds: String(snap.config?.refreshSeconds ?? 30),
          balanceWarnBelow: String(snap.config?.balanceWarnBelow ?? 20),
          longRunningWarnHours: String(snap.config?.longRunningWarnHours ?? 6),
          staleImageWarnDays: String(snap.config?.staleImageWarnDays ?? 90),
          gpuGrabMinutes: String(snap.config?.gpuGrabMinutes ?? 5),
          sidebarRefreshMinutes: String(snap.config?.sidebarRefreshMinutes ?? 10),
          storagePricePerGbHour: String(snap.config?.storagePricePerGbHour ?? 0.00003),
          gpuModels: (snap.config?.gpuModels ?? []).join('\n'),
          confirmDestructive: Boolean(snap.config?.confirmDestructive),
          localOnly: Boolean(snap.config?.localOnly),
        })
      }, [snap.config, form])

      useEffect(() => {
        let alive = true
        void (async () => {
          const res = await api('log', { n: 40 })
          if (alive && res.ok) setAudit(res.data.entries)
        })()
        return () => { alive = false }
      }, [snap.fetchedAt])

      const saveToken = async () => {
        setTokenBusy(true)
        setTokenMsg(null)
        const res = await api('token.set', { token })
        setTokenBusy(false)
        if (res.ok) {
          setTokenMsg({ ok: true, text: `${t('settings.tokenOk', '令牌有效')}：${res.data.nickname || ''} ${res.data.phone || ''}` })
          setToken('')
          await reload?.(true)
        } else {
          setTokenMsg({ ok: false, text: res.error?.msg ?? '保存失败' })
        }
      }

      const clearToken = async () => {
        setTokenBusy(true)
        const res = await api('token.clear')
        setTokenBusy(false)
        setTokenMsg(res.ok ? { ok: true, text: '已清除' } : { ok: false, text: res.error?.msg ?? '清除失败' })
        if (res.ok) await reload?.(true)
      }

      const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

      const saveConfig = async () => {
        setSaving(true)
        setSavedMsg('')
        const res = await api('config.set', { patch: form })
        setSaving(false)
        setSavedMsg(res.ok ? t('settings.saved', '设置已保存') : (res.error?.msg ?? '保存失败'))
        if (res.ok) await reload?.(true)
      }

      const configured = snap.account.tokenConfigured

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '680px' } },
        h('section', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', { style: { fontWeight: 700, fontSize: '13px' } }, t('settings.token', '访问令牌')),
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' } },
            h(Pill, { kind: configured ? 'ok' : 'danger' },
              configured
                ? `${t('settings.tokenConfigured', '已配置')} · ••••${snap.account.tokenTail || ''}`
                : t('settings.tokenMissing', '未配置')),
            h('span', { style: { color: T.muted } }, t('settings.tokenHint', ''))),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('div', { style: { flex: '1 1 280px' } },
              h(TextInput, {
                value: token,
                onChange: setToken,
                type: 'password',
                placeholder: 'Bearer token',
                mono: true,
              })),
            h(Btn, { variant: 'primary', onClick: saveToken, disabled: tokenBusy || !token.trim() },
              tokenBusy ? t('common.saving', '保存中…') : t('settings.tokenSave', '保存并校验')),
            configured ? h(Btn, { variant: 'danger', onClick: clearToken, disabled: tokenBusy },
              t('settings.tokenClear', '清除令牌')) : null),
          tokenMsg ? h('div', { style: { fontSize: '12px', color: tokenMsg.ok ? T.ok : T.danger } }, tokenMsg.text) : null),

        form
          ? h('section', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
              h('div', { style: { fontWeight: 700, fontSize: '13px' } }, t('settings.config', '插件设置')),
              h('div', { className: 'xgc-stack', style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' } },
                h(Field, { label: t('settings.refresh', '自动刷新间隔（秒）') },
                  h(TextInput, { value: form.refreshSeconds, onChange: (v) => set('refreshSeconds', v), type: 'number' })),
                h(Field, { label: t('settings.stale', '镜像超期阈值（天）') },
                  h(TextInput, { value: form.staleImageWarnDays, onChange: (v) => set('staleImageWarnDays', v), type: 'number' })),
                h(Field, { label: t('settings.balanceWarn', '余额告警阈值（元，0 关闭）') },
                  h(TextInput, { value: form.balanceWarnBelow, onChange: (v) => set('balanceWarnBelow', v), type: 'number' })),
                h(Field, { label: t('settings.longRun', '长时运行告警（小时，0 关闭）') },
                  h(TextInput, { value: form.longRunningWarnHours, onChange: (v) => set('longRunningWarnHours', v), type: 'number' })),
                h(Field, { label: '抢卡时长（分钟，0 关闭）', hint: '开机提示没有可用 GPU 时，每 1 秒重试多久' },
                  h(TextInput, { value: form.gpuGrabMinutes, onChange: (v) => set('gpuGrabMinutes', v), type: 'number' })),
                h(Field, {
                  label: '侧边栏兜底刷新（分钟）',
                  hint: '开机/关机/存镜像结束时立即刷新，不受此值限制',
                }, h(TextInput, {
                  value: form.sidebarRefreshMinutes,
                  onChange: (v) => set('sidebarRefreshMinutes', v),
                  type: 'number',
                })),
                h(Field, { label: t('settings.price', '存储单价（元/GB/小时，仅估算）') },
                  h(TextInput, { value: form.storagePricePerGbHour, onChange: (v) => set('storagePricePerGbHour', v), type: 'number' }))),
              h(Field, { label: t('settings.gpuModels', '可选 GPU 型号（每行一个）') },
                h(TextArea, { value: form.gpuModels, onChange: (v) => set('gpuModels', v), rows: 3 })),
              h(Toggle, {
                checked: form.confirmDestructive,
                onChange: (v) => set('confirmDestructive', v),
                label: t('settings.confirm', '危险操作需要手输目标名'),
              }),
              h(Toggle, {
                checked: form.localOnly,
                onChange: (v) => set('localOnly', v),
                label: t('settings.localOnly', '仅接受本机直连（LAN 网关转发不受此限制）'),
                hint: '经 LAN 网关登录的请求由网关从本机回环转发，插件无法与本地请求区分',
              }),
              h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                h(Btn, { variant: 'primary', onClick: saveConfig, disabled: saving },
                  saving ? t('common.saving', '保存中…') : t('common.save', '保存')),
                savedMsg ? h('span', { style: { fontSize: '12px', color: T.muted } }, savedMsg) : null))
          : null,

        snap.ui
          ? h('section', { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: T.muted } },
              h('div', { style: { fontWeight: 700, fontSize: '13px', color: T.text } }, t('settings.client', '客户端诊断')),
              h('div', null,
                '已挂载：' + (snap.ui.mounts.length
                  ? snap.ui.mounts.map((m) => `${m.mode} ${new Date(m.at).toLocaleTimeString()}${m.tab ? ` (${m.tab})` : ''}`).join(' · ')
                  : '（本进程还没有收到浏览器上报）')),
              snap.ui.lastError
                ? h('div', { style: { color: T.danger } },
                    `最近渲染错误 ${new Date(snap.ui.lastError.at).toLocaleString()}：${snap.ui.lastError.message}`)
                : h('div', null, '最近渲染错误：无'))
          : null,

        h('section', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          h('div', { style: { fontWeight: 700, fontSize: '13px' } }, t('settings.audit', '操作审计')),
          audit === null
            ? h(Spinner, { label: t('common.loading', '加载中…') })
            : audit.length === 0
              ? h('div', { style: { fontSize: '12px', color: T.muted } }, t('settings.noAudit', '还没有操作记录'))
              : h('div', {
                  style: {
                    maxHeight: '220px', overflow: 'auto', border: `1px solid ${T.line}`,
                    borderRadius: '10px', padding: '6px 10px', fontFamily: 'ui-monospace,monospace', fontSize: '11px',
                  },
                }, audit.map((entry, index) => h('div', {
                  key: index,
                  style: { padding: '2px 0', borderBottom: index === audit.length - 1 ? 'none' : `1px dashed ${T.line}` },
                }, `${new Date(entry.t).toLocaleString()}  ${entry.op}  ${entry.target ?? ''}  ${entry.result ?? ''}`)))))
    }

    // -------------------------------------------------------------- console
    class ConsoleBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        report('ui.error', {
          message: String(error?.message ?? error),
          componentStack: String(info?.componentStack ?? '').slice(0, 1200),
        })
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'xgc-root', style: { padding: '14px' } },
            h('style', null, CSS),
            h('div', {
              style: { border: `1px solid ${T.danger}`, borderRadius: '10px', padding: '12px', background: T.layer1 },
            },
            h('strong', { style: { fontSize: '13px' } }, '仙宫云镜像管家渲染出错'),
            h('div', { style: { fontSize: '12px', marginTop: '4px', wordBreak: 'break-all' } },
              String(this.state.error?.message ?? this.state.error)),
            h('div', { style: { fontSize: '11px', color: T.muted, marginTop: '6px' } },
              '错误已写入插件审计日志；刷新页面或切换到其它页可重试。')))
        }
        return this.props.children
      }
    }

    function Console({ mode, store, t, close, onRequestClose }) {
      const [tab, setTab] = useState('overview')
      const [drawer, setDrawer] = useState(null)
      const [deploySeed, setDeploySeed] = useState(null)
      const [bootTarget, setBootTarget] = useState(null)
      const [confirmState, setConfirmState] = useState(null)
      const [confirmText, setConfirmText] = useState('')
      const [confirmBusy, setConfirmBusy] = useState(false)
      const [toast, setToast] = useState(null)
      const { data: snap, error, loading, reload } = useSnapshot(t)
      const seenJobs = useRef(new Map())

      // A save finishes minutes after its dispatch; report it wherever the user is.
      useEffect(() => {
        if (!snap) return
        const live = new Set(snap.jobs.map((job) => job.id))
        for (const job of snap.jobs) {
          const before = seenJobs.current.get(job.id)
          if (before === 'running' && job.state !== 'running') {
            setToast({
              level: job.state === 'warn' || job.state === 'error' ? 'error' : 'ok',
              text: `${job.target}：${job.message}`,
            })
          }
          seenJobs.current.set(job.id, job.state)
        }
        for (const id of [...seenJobs.current.keys()]) if (!live.has(id)) seenJobs.current.delete(id)
      }, [snap])

      const overlay = mode === 'overlay'
      const closeSelf = () => {
        if (typeof onRequestClose === 'function') onRequestClose()
        else if (typeof close === 'function') close()
      }

      // Proof for the Host (and for a headless debugging session) that this seat
      // actually rendered in a browser, and which tab is showing.
      useEffect(() => {
        report('ui.mount', { mode, tab })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      useEffect(() => {
        report('ui.mount', { mode, tab })
      }, [mode, tab])

      useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 4200)
        return () => clearTimeout(timer)
      }, [toast])

      useEffect(() => {
        if (!overlay) return undefined
        const onKey = (e) => {
          if (e.key !== 'Escape') return
          const target = e.target
          // Typing a token or a filter: Esc belongs to the field, not the shell.
          if (target?.closest?.('input,textarea,select,[contenteditable="true"]')) return
          if (!confirmState && !drawer) closeSelf()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [overlay, confirmState, drawer, store])

      const act = useCallback(async (op, params, successText) => {
        const res = await api(op, params)
        if (!res.ok) {
          setToast({ level: 'error', text: res.error?.msg ?? '操作失败' })
          return res
        }
        if (successText) setToast({ level: 'ok', text: successText })
        await reload(true)
        return res
      }, [reload])

      const confirm = useCallback((state) => {
        setConfirmText('')
        setConfirmState(state)
      }, [])

      const runConfirmed = async () => {
        if (!confirmState) return
        setConfirmBusy(true)
        try {
          await confirmState.run()
        } finally {
          setConfirmBusy(false)
          setConfirmState(null)
          setConfirmText('')
        }
      }

      const tabs = [
        ['overview', t('nav.overview', '概览')],
        ['instances', t('nav.instances', '实例')],
        ['images', t('nav.images', '镜像')],
        ['deploy', t('nav.deploy', '部署')],
        ['account', t('nav.account', '账号')],
        ['settings', t('nav.settings', '设置')],
      ]

      const shellStyle = overlay
        ? {
            position: 'fixed', inset: 0, zIndex: 70,
            background: T.bg, display: 'flex', flexDirection: 'column',
            // shell.overlay is a click-through layer: opt back in explicitly.
            pointerEvents: 'auto',
            overscrollBehavior: 'contain',
          }
        : { display: 'flex', flexDirection: 'column', minHeight: '420px' }

      const closeButton = overlay
        ? h(Btn, { size: 'sm', onClick: closeSelf, title: 'Esc' }, h(Icon, { name: 'close' }))
        : (close ? h(Btn, { size: 'sm', onClick: close }, h(Icon, { name: 'close' })) : null)

      const body = loading && !snap
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 0' } },
            h(Spinner, { label: t('common.loading', '加载中…') }),
            [0, 1, 2, 3, 4].map((i) => h('div', {
              key: i,
              style: { height: '34px', borderRadius: '8px', background: T.layer1, opacity: 0.55 - i * 0.08 },
            })))
        : snap
          ? h(React.Fragment, null,
              error ? h(Banner, {
                level: 'error',
                action: h(Btn, { size: 'sm', onClick: () => reload(true) }, t('common.retry', '重试')),
              }, error.msg) : null,
              snap.offline ? h(Banner, { level: 'warn' }, '当前显示的是缓存快照（离线数据）') : null,
              !snap.account.tokenConfigured
                ? h('div', { style: { marginBottom: '10px' } },
                    h(Banner, {
                      level: 'error',
                      action: h(Btn, { size: 'sm', onClick: () => setTab('settings') }, t('nav.settings', '设置')),
                    }, '尚未配置访问令牌。到「设置」页填入后即可读取账号数据。'))
                : null,
              tab === 'overview' ? h(OverviewView, { snap, t, nav: setTab }) : null,
              tab === 'instances' ? h(InstancesView, {
                snap, t, act, confirm, openDrawer: setDrawer, onBoot: setBootTarget,
              }) : null,
              tab === 'images' ? h(ImagesView, { snap, t, act, confirm, openDrawer: setDrawer, onNav: setTab }) : null,
              tab === 'deploy' ? h(DeployView, { snap, t, act, seed: deploySeed }) : null,
              tab === 'account' ? h(AccountView, { snap, t, act }) : null,
              tab === 'settings' ? h(SettingsView, { snap, t, act, reload }) : null)
          : h(Banner, { level: 'error' }, error?.msg ?? '无法读取数据')

      return h('div', { className: 'xgc-root', style: shellStyle },
        h('style', null, CSS),

        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: overlay ? '12px 18px' : '4px 0 10px',
            borderBottom: overlay ? `1px solid ${T.line}` : 'none',
            flexWrap: 'wrap',
          },
        },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
          h('span', { style: { color: T.brand } }, h(Icon, { name: 'cloud', size: 18 })),
          h('strong', { style: { fontSize: '14px' } }, '仙宫云镜像管家')),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' } },
          snap ? h('span', { style: { fontSize: '12px', color: T.muted } },
            `${t('header.balance', '余额')} ${money(snap.account.balance)}`) : null,
          h(Btn, { size: 'sm', onClick: () => reload(true), title: t('common.refresh', '刷新') },
            h(Icon, { name: 'refresh' })),
          overlay ? null : null,
          closeButton)),

        h('div', {
          style: {
            display: 'flex', gap: '2px', padding: overlay ? '8px 14px 0' : '0 0 10px',
            borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap',
          },
        },
        tabs.map(([key, label]) => h('button', {
          key,
          className: 'xgc-nav',
          'data-active': tab === key ? '1' : '0',
          onClick: () => setTab(key),
        }, label))),

        h('div', {
          className: 'xgc-scroll',
          style: {
            padding: overlay ? '16px 18px 24px' : '12px 0 4px',
            overflow: 'auto',
            flex: overlay ? 1 : undefined,
          },
        }, body),

        toast
          ? h('div', {
              role: 'status',
              style: {
                position: 'fixed',
                bottom: '16px', left: '50%', transform: 'translateX(-50%)',
                zIndex: 95,
                pointerEvents: 'none',
                width: 'max-content', maxWidth: 'calc(100% - 24px)',
                padding: '8px 14px', borderRadius: '10px',
                border: `1px solid ${toast.level === 'error' ? T.danger : T.ok}`,
                background: T.overlay, color: T.text, fontSize: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: '90%',
              },
            }, toast.text)
          : null,

        drawer && drawer.kind === 'instance'
          ? h(InstanceDrawer, {
              id: drawer.id,
              t,
              act,
              confirm,
              onClose: () => setDrawer(null),
              onBoot: (target) => { setDrawer(null); setBootTarget(target) },
            })
          : null,
        drawer && drawer.kind === 'image'
          ? h(ImageDrawer, {
              id: drawer.id,
              t,
              act,
              confirm,
              onClose: () => setDrawer(null),
              onDeploy: (picked) => {
                setDeploySeed({ id: picked.id })
                setDrawer(null)
                setTab('deploy')
              },
            })
          : null,

        bootTarget
          ? h(BootDialog, {
              target: bootTarget,
              models: snap?.config?.gpuModels ?? [],
              grabMinutes: snap?.config?.gpuGrabMinutes ?? 0,
              t,
              act,
              onNotify: setToast,
              onClose: () => setBootTarget(null),
            })
          : null,

        h(Modal, {
          open: Boolean(confirmState),
          title: confirmState?.title ?? t('danger.title', '确认危险操作'),
          danger: true,
          onClose: () => { if (!confirmBusy) setConfirmState(null) },
          footer: h(React.Fragment, null,
            h(Btn, { onClick: () => setConfirmState(null), disabled: confirmBusy }, t('common.cancel', '取消')),
            h(Btn, {
              variant: 'danger',
              disabled: confirmBusy || (confirmState?.expect ? confirmText !== confirmState.expect : false),
              onClick: runConfirmed,
            }, confirmBusy ? t('danger.running', '执行中…') : t('common.confirm', '确认'))),
        },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
          h('div', { style: { fontSize: '13px' } }, confirmState?.body ?? ''),
          confirmState?.expect
            ? h(Field, {
                label: `${t('danger.typeToConfirm', '请输入')}「${confirmState.expect}」${t('danger.toContinue', '以继续')}`,
              }, h(TextInput, {
                value: confirmText,
                onChange: setConfirmText,
                autoFocus: true,
                mono: true,
              }))
            : null)))
    }


    // ------------------------------------------------------------- popup bits
    /** Pick the config GPU model that matches what the instance reports. */
    function preferredModel(models, current) {
      const list = Array.isArray(models) ? models : []
      if (list.length === 0) return ''
      const want = String(current ?? '').toLowerCase()
      if (!want) return list[0]
      return list.find((model) => String(model).toLowerCase().includes(want)) ?? list[0]
    }

    function BootDialog({ target, models, t, act, onClose, grabMinutes = 0, onNotify }) {
      const [model, setModel] = useState(() => preferredModel(models, target?.gpuModel))
      const [count, setCount] = useState(String(target?.gpuUsed || 1))
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')

      const submit = async () => {
        if (!model) {
          setError('没有可选的显卡型号，请到「设置」页配置 gpuModels')
          return
        }
        const n = Number(count)
        if (!Number.isInteger(n) || n < 0 || n > 8) {
          setError('显卡数量必须是 0–8 的整数')
          return
        }
        setBusy(true)
        const res = await act(
          'instance.action',
          { id: target.id, action: 'boot', gpuModel: model, gpuCount: n },
        )
        setBusy(false)
        if (!res?.ok) {
          setError(res?.error?.msg ?? '开机失败')
          return
        }
        if (res.data?.grabbing) {
          onNotify?.({ level: 'warn', text: res.data.message })
        } else {
          onNotify?.({ level: 'ok', text: '已下发开机' })
        }
        onClose?.()
      }

      return h(Modal, {
        open: true,
        width: 460,
        title: `开机 · ${target?.name ?? ''}`,
        onClose: () => { if (!busy) onClose?.() },
        footer: h(React.Fragment, null,
          h(Btn, { onClick: onClose, disabled: busy }, t('common.cancel', '取消')),
          h(Btn, { variant: 'primary', onClick: submit, disabled: busy || !model },
            busy ? '提交中…' : t('instances.boot', '开机'))),
      },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h(Field, { label: '显卡型号', hint: '开机后按小时计费；关机释放 GPU 才停止计费' },
          h(Sel, {
            value: model,
            ariaLabel: '显卡型号',
            onChange: setModel,
            options: (models ?? []).map((item) => ({ value: item, label: item })),
          })),
        h(Field, { label: '显卡数量', hint: '0–8' },
          h(TextInput, { value: count, onChange: setCount, type: 'number' })),
        model
          ? h('div', { style: { fontSize: '11px', color: T.muted } }, `将按 ${model} × ${count || 1} 开机`)
          : null,
        grabMinutes > 0
          ? h('div', { style: { fontSize: '11px', color: T.muted } },
              `若提示没有可用 GPU，会自动每 1 秒重试，最多 ${grabMinutes} 分钟（设置里可改）`)
          : null,
        error ? h('div', { style: { fontSize: '12px', color: T.danger } }, error) : null))
    }

    function InstanceCard({ item, t, act, onBoot, onDetail }) {
      const running = item.status.key === 'running'
      const busy = item.status.key === 'transition'
      return h('div', { className: 'xgc-card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
          h('span', {
            style: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, item.name),
          h('span', { style: { flex: 1 } }),
          h(Pill, { kind: STATUS_KIND[item.status.key] ?? 'idle' },
            busy ? `${item.status.label} ${item.progress ? pct(item.progress) : ''}`.trim() : item.status.label)),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: '11px', color: T.muted } },
          h('span', null, `${item.gpuModel} × ${item.gpuUsed}`),
          h('span', null, `${money(item.pricePerHour)}/h`),
          item.uptimeSeconds !== null && item.uptimeSeconds !== undefined
            ? h('span', { title: item.runningSinceEstimated ? '平台不回传本次开机时间，按时距上次关机估算' : undefined },
                `${item.runningSinceEstimated ? '≥ ' : ''}${fmtDuration(item.uptimeSeconds)}`)
            : null,
          item.retain ? h('span', null, `保留磁盘 ${moneyFine(item.retainPrice)}/h`) : null),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          running
            ? h(Btn, {
                size: 'sm',
                onClick: () => act('instance.action', { id: item.id, action: 'release' }, '已下发释放 GPU'),
              }, t('instances.release', '关机释放 GPU'))
            : null,
          !running && !busy
            ? h(Btn, { size: 'sm', variant: 'primary', onClick: () => onBoot(item) },
                t('instances.boot', '开机'))
            : null,
          item.status.key === 'stopped'
            ? h(Btn, {
                size: 'sm',
                onClick: () => act('instance.action', { id: item.id, action: 'saveImage' }, '已下发存镜像'),
              }, t('instances.save', '存镜像'))
            : null,
          h(Btn, { size: 'sm', onClick: () => onDetail(item) }, t('common.detail', '详情'))))
    }

    const POPUP_INTERVAL_KEY = 'xiangongyun:popup-interval'
    const POPUP_INTERVALS = [3000, 5000, 10_000]

    function readPopupInterval() {
      try {
        const value = Number(localStorage.getItem(POPUP_INTERVAL_KEY))
        return POPUP_INTERVALS.includes(value) ? value : 5000
      } catch {
        return 5000
      }
    }

    function PopupPanel({ t, store }) {
      const rootRef = useRef(null)
      const [intervalMs, setIntervalMs] = useState(readPopupInterval)
      const { data: snap, error, loading, reload } = useSnapshot(t, { intervalMs, force: true })
      const [detail, setDetail] = useState(null)
      const [bootTarget, setBootTarget] = useState(null)
      const [flash, setFlash] = useState(null)

      useEffect(() => {
        report('ui.mount', { mode: 'popup' })
      }, [])
      useEffect(() => {
        const onKey = (e) => {
          if (e.key !== 'Escape') return
          if (e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return
          if (detail || bootTarget) return
          store.setPopup(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [store, detail, bootTarget])
      // Click anywhere outside the panel (but not on the sidebar trigger) closes it.
      useEffect(() => {
        const onDown = (event) => {
          const root = rootRef.current
          if (!root) return
          const target = event.target
          if (root.contains(target)) return
          if (target?.closest?.('[data-xgc-trigger]')) return
          if (detail || bootTarget) return
          store.setPopup(false)
        }
        document.addEventListener('mousedown', onDown, true)
        return () => document.removeEventListener('mousedown', onDown, true)
      }, [store, detail, bootTarget])
      useEffect(() => {
        if (!flash) return undefined
        const timer = setTimeout(() => setFlash(null), 4200)
        return () => clearTimeout(timer)
      }, [flash])

      const act = useCallback(async (op, params, okText) => {
        const res = await api(op, params)
        if (!res.ok) {
          setFlash({ level: 'error', text: res.error?.msg ?? '操作失败' })
          return res
        }
        setFlash({ level: 'ok', text: okText ?? '完成' })
        await reload(true)
        return res
      }, [reload])

      const running = snap ? snap.instances.filter((item) => item.status.key === 'running').length : 0
      const imageBytes = snap ? snap.images.reduce((sum, image) => sum + image.size, 0) : 0
      const monthly = snap ? snap.images.reduce((sum, image) => sum + image.estStorageCostPerMonth, 0) : 0

      const stat = (label, value, sub) => h('div', { className: 'xgc-stat', key: label },
        h('span', { className: 'xgc-stat-value', title: typeof value === 'string' ? value : undefined }, value),
        h('span', { className: 'xgc-stat-label' }, sub ? `${label} · ${sub}` : label))

      return h(React.Fragment, null,
      h('div', {
        ref: rootRef, className: 'xgc-popup', role: 'dialog', 'aria-label': t('nav.title', '仙宫云'),
      },
        h('style', null, CSS),
        h('div', { className: 'xgc-popup-head' },
          h('span', { style: { color: T.brand, display: 'flex' } }, h(Icon, { name: 'cloud', size: 16 })),
          h('span', { className: 'xgc-popup-title', style: { flex: 1 } }, '仙宫云'),
          snap ? h('span', { style: { fontSize: '11px', color: T.muted } }, snap.account.nickname || '') : null,
          h('button', {
            type: 'button', className: 'xgc-icon-btn', title: t('common.refresh', '刷新'),
            'aria-label': t('common.refresh', '刷新'),
            onClick: () => { void reload(true) },
          }, h(Icon, { name: 'refresh' })),
          h('button', {
            type: 'button', className: 'xgc-icon-btn', title: '展开完整面板',
            'aria-label': '展开完整面板',
            onClick: () => store.setFull(true),
          }, h(Icon, { name: 'expand' })),
          h('button', {
            type: 'button', className: 'xgc-icon-btn', title: t('common.close', '关闭'),
            'aria-label': t('common.close', '关闭'), onClick: () => store.setPopup(false),
          }, h(Icon, { name: 'close' }))),

        h('div', { className: 'xgc-popup-body' },
          error ? h('div', { style: { marginTop: '10px' } }, h(Banner, { level: 'error' }, error.msg)) : null,
          loading && !snap
            ? h(Spinner, { label: t('common.loading', '加载中…') })
            : null,

          snap
            ? h(React.Fragment, null,
                h('div', {
                  style: {
                    display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
                    gap: '8px', marginTop: '10px',
                  },
                },
                stat('余额', money(snap.account.balance), 'CNY'),
                stat('运行中的实例', `${running} / ${snap.instances.length}`),
                stat('私有镜像', String(snap.images.length)),
                stat('镜像占用', fmtBytes(imageBytes), `${money(monthly)}/月`)),

                h('div', { className: 'xgc-sec-title' }, t('overview.alerts', '警告')),
                h(AlertStack, { alerts: snap.alerts, t }),

                h('div', { className: 'xgc-sec-title' }, t('overview.jobs', '进行中的任务')),
                h(JobList, { jobs: snap.jobs, t }),

                h('div', { className: 'xgc-sec-title' }, '实例'),
                snap.instances.length === 0
                  ? h('div', { style: { fontSize: '12px', color: T.muted } }, '还没有实例')
                  : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                      snap.instances.map((item) => h(InstanceCard, {
                        key: item.id,
                        item,
                        t,
                        act,
                        onBoot: setBootTarget,
                        onDetail: (target) => setDetail(target.id),
                      }))),

                snap.ui?.lastError
                  ? h('div', { style: { marginTop: '10px', fontSize: '11px', color: T.danger } },
                      `上次渲染错误：${snap.ui.lastError.message}`)
                  : null,

                h('div', { style: { marginTop: '12px', fontSize: '11px', color: T.muted } },
                  `今日估算 ${money(snap.cost.todayEstimate)}`))
            : null),

        flash
          ? h('div', {
              role: 'status',
              style: {
                margin: '0 14px 12px', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                border: `1px solid ${flash.level === 'error' ? T.danger : T.ok}`,
              },
            }, flash.text)
          : null,

        h('div', { className: 'xgc-popup-foot' },
          h('span', null, snap ? `刷新于 ${new Date(snap.fetchedAt).toLocaleTimeString()}` : '—'),
          h('span', { style: { flex: 1 } }),
          h('span', null, '自动刷新'),
          POPUP_INTERVALS.map((ms) => h('button', {
            key: ms,
            type: 'button',
            className: 'xgc-seg',
            'data-active': intervalMs === ms ? '1' : '0',
            'aria-pressed': intervalMs === ms ? 'true' : 'false',
            onClick: () => {
              setIntervalMs(ms)
              try { localStorage.setItem(POPUP_INTERVAL_KEY, String(ms)) } catch { /* private mode */ }
            },
          }, `${ms / 1000}s`)))),

      // Siblings of the panel: `.xgc-popup` has backdrop-filter, which makes it a
      // containing block for position:fixed descendants (the dialog would be
      // squeezed inside 440px otherwise).
      detail
        ? h(InstanceDrawer, {
            id: detail,
            t,
            act,
            confirm: () => {},
            readOnly: true,
            onBoot: (target) => { setDetail(null); setBootTarget(target) },
            onClose: () => setDetail(null),
          })
        : null,
      bootTarget
        ? h(BootDialog, {
            target: bootTarget,
            models: snap?.config?.gpuModels ?? [],
            grabMinutes: snap?.config?.gpuGrabMinutes ?? 0,
            t,
            act,
            onNotify: setFlash,
            onClose: () => setBootTarget(null),
          })
        : null)
    }

    // ------------------------------------------------------------- seats
    function createConsoleStore() {
      // Two seats share one store: the popup (default) and the full console.
      let popup = false
      let full = false
      const listeners = new Set()
      const notify = () => { for (const fn of listeners) fn() }
      return {
        snapshot: () => ({ popup, full }),
        setPopup(value) { popup = Boolean(value); if (popup) full = false; notify() },
        setFull(value) { full = Boolean(value); if (full) popup = false; notify() },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      }
    }

    function useStore(store) {
      const [value, setValue] = useState(store.snapshot())
      useEffect(() => store.subscribe(() => setValue(store.snapshot())), [store])
      return value
    }

    function SidebarButton({ store, t, wide }) {
      const { popup } = useStore(store)
      const rail = wide === false
      const [sum, setSum] = useState(null)

      // The sidebar seat is always mounted, so this is continuous proof that the
      // client half is running in the page (visible from `op=ui.state`).
      useEffect(() => {
        report('ui.mount', { mode: 'sidebar' })
      }, [])

      const sigRef = useRef('')
      const lastPullRef = useRef(0)
      const refreshMin = Number(sum?.sidebarRefreshMinutes) || 10

      useEffect(() => {
        let alive = true
        // fresh=true forces a rebuild; otherwise a very recent snapshot is reused
        // (the open popup already refreshes every few seconds).
        const pull = async (fresh) => {
          const res = await api('summary', fresh ? { force: true } : { maxAgeMs: 5_000 })
          if (alive && res.ok) {
            setSum(res.data)
            lastPullRef.current = Date.now()
          }
        }
        const tick = async () => {
          if (typeof document !== 'undefined' && document.hidden) return
          const rev = await api('revision')
          const sig = rev.ok ? `${rev.data.r}:${rev.data.j}` : ''
          if (!sig) return
          const overdue = lastPullRef.current > 0 && Date.now() - lastPullRef.current > refreshMin * 60_000
          const changed = sig !== sigRef.current
          if (!changed && !overdue) return
          sigRef.current = sig
          // A job settled (boot/shutdown/save) or a snapshot moved: refresh now.
          await pull(overdue)
        }
        void tick()
        const timer = setInterval(tick, 5_000)
        return () => { alive = false; clearInterval(timer) }
      }, [popup, refreshMin])

      const running = sum ? sum.running : null
      const hourly = sum ? sum.hourly : null
      const balance = sum ? sum.balance : null
      const dot = sum === null ? T.muted : (sum.running > 0 ? T.ok : T.idle)
      const pill = (text) => h('span', { className: 'xgc-pill' }, text)
      const retain = sum?.retainHourly ?? 0
      const title = sum
        ? `仙宫云 · 余额 ${money(balance)} · 运行中 ${sum.running} 台 ${money(hourly)}/h`
          + (retain > 0 ? `（另有保留磁盘 ${moneyFine(retain)}/h）` : '')
        : '仙宫云'

      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', {
          className: 'xgc-side',
          'data-xgc-trigger': '1',
          'data-active': popup ? '1' : '0',
          'data-rail': rail ? '1' : '0',
          type: 'button',
          title,
          'aria-label': title,
          'aria-expanded': popup ? 'true' : 'false',
          onClick: () => store.setPopup(!popup),
        },
        rail
          ? h(React.Fragment, null,
              h('span', { style: { color: T.brand, display: 'flex' } }, h(Icon, { name: 'cloud', size: 16 })),
              h('span', {
                style: {
                  fontSize: 'calc(var(--dsh-content-font-size,14px) * .679)',
                  fontFamily: 'var(--dsh-font-family-code,ui-monospace,monospace)',
                  color: T.muted,
                },
              }, running === null ? '—' : String(running)))
          : h(React.Fragment, null,
              h('span', { className: 'xgc-dot', style: { background: dot } }),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { className: 'xgc-side-title' }, t('nav.title', '仙宫云')),
                h('div', { className: 'xgc-pills' },
                  pill(running === null ? '—' : `${running} 运行`),
                  pill(hourly === null ? '—' : `${money(hourly)}/h`),
                  pill(balance === null ? '—' : money(balance)))))))

    }

    function PopupHost({ store, t }) {
      const { popup } = useStore(store)
      if (!popup) return null
      return h(PopupPanel, { t, store })
    }

    function ConsoleHost({ store, t }) {
      const { full } = useStore(store)
      if (!full) return null
      return h(Console, { mode: 'overlay', store, t, onRequestClose: () => store.setFull(false) })
    }

    function apply(ctx) {
      const t = makeT(ctx)
      const store = createConsoleStore()

      const seat = (props) => h(ConsoleBoundary, null, props)

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'xiangongyun',
        order: 55,
        label: () => t('nav.title', '仙宫云镜像'),
      }, (props) => seat(h(Console, { mode: 'section', store, t, close: props?.close }))))

      // order 4 places this row directly above 「服务器状态」(termux-state, order 5).
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'xiangongyun',
        order: 4,
        label: () => t('nav.title', '仙宫云镜像'),
      }, (props) => seat(h(SidebarButton, { store, t, wide: props?.wide }))))

      ctx.slots.inject('shell.overlay', () => {
        const disposePopup = ctx.slots.register({
          name: 'shell.overlay',
          id: 'xiangongyun-popup',
          order: 30,
        }, () => seat(h(PopupHost, { store, t })))
        const disposeConsole = ctx.slots.register({
          name: 'shell.overlay',
          id: 'xiangongyun-console',
          order: 31,
        }, () => seat(h(ConsoleHost, { store, t })))
        return () => {
          if (typeof disposePopup === 'function') disposePopup()
          if (typeof disposeConsole === 'function') disposeConsole()
        }
      })
    }

    return {
      name: 'dsh-xiangongyun',
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
