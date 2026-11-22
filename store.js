/**
 * Local state for the XGC plugin: annotations the platform does not store,
 * an hourly cost ledger, an operation audit trail, and the last snapshot
 * (used as an offline fallback when the API cannot be reached).
 *
 * Everything here is a derived cache except `annotations.json` and the two
 * append-only logs; deleting the directory loses no account state.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const ANNOTATION_LIMIT = 500

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback
    const text = readFileSync(path, 'utf8')
    if (!text.trim()) return fallback
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
}

function readJsonl(path, limit) {
  try {
    if (!existsSync(path)) return []
    const lines = readFileSync(path, 'utf8').split('\n')
    const out = []
    for (const line of lines) {
      const text = line.trim()
      if (!text) continue
      try {
        out.push(JSON.parse(text))
      } catch {
        /* skip a torn line */
      }
    }
    return limit ? out.slice(-limit) : out
  } catch {
    return []
  }
}

export function localDayKey(ms = Date.now()) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function createStore({ dir, logger }) {
  const paths = {
    annotations: join(dir, 'annotations.json'),
    cost: join(dir, 'cost-log.jsonl'),
    audit: join(dir, 'audit.jsonl'),
    cache: join(dir, 'cache.json'),
  }

  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  } catch (error) {
    logger?.warn?.(`xgc store: cannot create ${dir} — ${String(error?.message ?? error)}`)
  }

  let annotations = readJson(paths.annotations, {})
  let lastCostSampleAt = 0

  function persistAnnotations() {
    try {
      writeJsonAtomic(paths.annotations, annotations)
    } catch (error) {
      logger?.warn?.(`xgc store: annotation write failed — ${String(error?.message ?? error)}`)
    }
  }

  return {
    dir,
    annotationsFor(id) {
      const hit = annotations[id]
      if (!hit) return null
      return {
        tags: Array.isArray(hit.tags) ? hit.tags : [],
        note: String(hit.note ?? ''),
        keep: Boolean(hit.keep),
        updatedAt: hit.updatedAt ?? null,
      }
    },
    setAnnotation(id, patch) {
      const current = annotations[id] ?? { tags: [], note: '', keep: false }
      const next = {
        tags: 'tags' in patch
          ? [...new Set((Array.isArray(patch.tags) ? patch.tags : [])
              .map((t) => String(t).trim())
              .filter(Boolean))].slice(0, 8)
          : current.tags ?? [],
        note: 'note' in patch ? String(patch.note ?? '').slice(0, ANNOTATION_LIMIT) : current.note ?? '',
        keep: 'keep' in patch ? Boolean(patch.keep) : Boolean(current.keep),
        updatedAt: new Date().toISOString(),
      }
      if (next.tags.length === 0 && next.note === '' && !next.keep) delete annotations[id]
      else annotations[id] = next
      persistAnnotations()
      return next
    },
    allAnnotations() {
      return annotations
    },

    audit(entry) {
      try {
        appendFileSync(paths.audit, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`)
      } catch (error) {
        logger?.warn?.(`xgc store: audit write failed — ${String(error?.message ?? error)}`)
      }
    },
    readAudit(limit = 50) {
      return readJsonl(paths.audit, limit).reverse()
    },

    /** Sample at most once every `minIntervalMs`; returns the appended entry or null. */
    sampleCost(entry, minIntervalMs = 10 * 60_000) {
      const now = Date.now()
      if (now - lastCostSampleAt < minIntervalMs) return null
      lastCostSampleAt = now
      const row = { t: new Date(now).toISOString(), day: localDayKey(now), ...entry }
      try {
        appendFileSync(paths.cost, `${JSON.stringify(row)}\n`)
      } catch (error) {
        logger?.warn?.(`xgc store: cost write failed — ${String(error?.message ?? error)}`)
      }
      return row
    },
    costForDay(day = localDayKey()) {
      const rows = readJsonl(paths.cost).filter((row) => row.day === day)
      return rows
    },

    writeCache(value) {
      try {
        writeJsonAtomic(paths.cache, value)
      } catch {
        /* a cache miss is never fatal */
      }
    },
    readCache() {
      return readJson(paths.cache, null)
    },
  }
}
