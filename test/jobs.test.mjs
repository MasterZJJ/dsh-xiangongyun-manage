/**
 * Offline state-machine test for jobs.js — no account calls, no money.
 * Stubs the XGC client with scripted responses and watches each job settle.
 */
import { createJobs } from '../jobs.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function stubXgc({ instance, images }) {
  let i = 0
  return {
    async instance() {
      const entry = instance[Math.min(i, instance.length - 1)]
      if (typeof entry === 'function') return entry()
      return entry
    },
    async images() {
      return images
    },
    advance() { i += 1 },
  }
}

async function settle(jobs, id, limitMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < limitMs) {
    const job = jobs.list().find((j) => j.id === id)
    if (job && job.state !== 'running') return job
    await sleep(300)
  }
  return jobs.list().find((j) => j.id === id)
}

const ok = (data) => ({ ok: true, data })
const gone = { ok: false, error: { code: 1000, msg: '' } }

const results = []

// A. save: one poll in `saving`, then the interval ends and a new image appears.
{
  let call = 0
  const xgc = {
    async instance() {
      call += 1
      return call === 1 ? ok({ status: 'saving', progress: 40 }) : ok({ status: 'shutdown', progress: 0 })
    },
    async images() {
      return ok({ list: [{ id: 'old-image', name: 'old' }, { id: 'new-image', name: 'fresh' }] })
    },
  }
  const jobs = createJobs({ xgc, logger: undefined })
  const started = jobs.startSave('inst-1', { target: 'train-01', imageIdsBefore: ['old-image'] })
  const done = await settle(jobs, started.id)
  results.push(['save', done.state, done.message, done.imageId ?? null])
  jobs.dispose()
}

// B. deploy: deploying → running.
{
  let call = 0
  const xgc = {
    async instance() {
      call += 1
      return call === 1
        ? ok({ status: 'deploying', progress: 55, name: 'new-box' })
        : ok({ status: 'running', progress: 100, name: 'new-box' })
    },
    async images() { return ok({ list: [] }) },
  }
  const jobs = createJobs({ xgc, logger: undefined })
  const started = jobs.startDeploy('inst-2', { target: 'new-box' })
  const done = await settle(jobs, started.id)
  results.push(['deploy', done.state, done.message, null])
  jobs.dispose()
}

// C. shutdown: running → shutdown.
{
  let call = 0
  const xgc = {
    async instance() {
      call += 1
      return call === 1 ? ok({ status: 'running', progress: 0 }) : ok({ status: 'shutdown' })
    },
    async images() { return ok({ list: [] }) },
  }
  const jobs = createJobs({ xgc, logger: undefined })
  const started = jobs.startStop('inst-3', { target: 'old-box' })
  const done = await settle(jobs, started.id)
  results.push(['stop', done.state, done.message, null])
  jobs.dispose()
}

// D. destroy: the instance disappears (code 1000 with an empty message).
{
  const xgc = {
    async instance() { return gone },
    async images() { return ok({ list: [] }) },
  }
  const jobs = createJobs({ xgc, logger: undefined })
  const started = jobs.startDestroy('inst-4', { target: 'dead-box' })
  const done = await settle(jobs, started.id)
  results.push(['destroy', done.state, done.message, null])
  jobs.dispose()
}

// F. GPU grab: shortage twice, then the boot is accepted.
{
  let calls = 0
  const xgc = {
    async boot() {
      calls += 1
      return calls <= 2
        ? { ok: false, error: { code: 1000, msg: '没有可用的GPU，请稍后再试' } }
        : { ok: true, data: { id: 'inst-6' } }
    },
    async instance() { return ok({ status: 'running', name: 'grabbed' }) },
    async images() { return ok({ list: [] }) },
  }
  const jobs = createJobs({ xgc, logger: undefined })
  const started = jobs.startGrab('inst-6', {
    target: 'grabbed',
    bootBody: { id: 'inst-6', gpu_model: 'NVIDIA GeForce RTX 4090 D', gpu_count: 1 },
    deadlineMs: Date.now() + 60_000,
  })
  const done = await settle(jobs, started.id, 20000)
  results.push(['grab', done.state, `${done.message} (boot calls=${calls})`, null])
  jobs.dispose()
}

// G. grab gives up at the deadline instead of looping forever.
{
  const xgc = {
    async boot() { return { ok: false, error: { code: 1000, msg: '暂无可用 GPU' } } },
    async instance() { return ok({ status: 'shutdown' }) },
    async images() { return ok({ list: [] }) },
  }
  const jobs = createJobs({ xgc, logger: undefined })
  const started = jobs.startGrab('inst-7', {
    target: 'never', bootBody: { id: 'inst-7' }, deadlineMs: Date.now() + 2500,
  })
  const done = await settle(jobs, started.id, 20000)
  results.push(['grab-timeout', done.state, done.message, null])
  jobs.dispose()
}

// E. never-finishing save: while the platform keeps reporting `saving`, the job
// must stay running — it must never claim the image exists.
{
  const xgc = {
    async instance() { return ok({ status: 'saving', progress: 10 }) },
    async images() { return ok({ list: [] }) },
  }
  const jobs = createJobs({ xgc, logger: undefined })
  const started = jobs.startSave('inst-5', { target: 'stuck-box', imageIdsBefore: [] })
  await sleep(3700)
  const after = jobs.list().find((j) => j.id === started.id)
  results.push(['still-saving', after.state, after.message, null])
  jobs.dispose()
}

for (const [name, state, message, imageId] of results) {
  console.log(`${name.padEnd(30)} → ${state.padEnd(5)} ${message}${imageId ? ` [image=${imageId}]` : ''}`)
}

const bad = results.filter(([name, state]) => {
  if (name === 'still-saving') return state !== 'running'
  if (name === 'grab-timeout') return state !== 'warn'
  return state !== 'done'
})
console.log(bad.length === 0 ? 'ALL JOB TRANSITIONS OK' : `FAILED: ${JSON.stringify(bad)}`)
process.exit(bad.length === 0 ? 0 : 1)
