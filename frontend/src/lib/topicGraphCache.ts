// Module-level + localStorage stale-while-revalidate cache for /api/topic-map (~6.8MB raw).

const STORAGE_KEY = 'topic-graph-cache:v1'
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000

interface StoredEntry {
  ts: number
  data: unknown
}

let memCache: unknown | null = null
let inflight: Promise<unknown> | null = null

function readStorage(): unknown | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredEntry
    if (!parsed?.ts || !parsed?.data) return null
    if (Date.now() - parsed.ts > STORAGE_MAX_AGE_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeStorage(data: unknown): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: StoredEntry = { ts: Date.now(), data }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota exceeded / private mode — silently degrade to memory-only.
  }
}

/** Sync read for seeding React state. Hydrates memCache from localStorage on first hit. */
export function getCachedTopicGraphSync<T = unknown>(): T | null {
  if (memCache) return memCache as T
  const stored = readStorage()
  if (stored) {
    memCache = stored
    return stored as T
  }
  return null
}

export function getTopicGraph<T = unknown>(apiBase: string): Promise<T> {
  if (memCache) {
    void refreshInBackground(apiBase)
    return Promise.resolve(memCache as T)
  }

  const stored = readStorage()
  if (stored) {
    memCache = stored
    void refreshInBackground(apiBase)
    return Promise.resolve(stored as T)
  }

  if (inflight) return inflight as Promise<T>
  inflight = fetch(`${apiBase}/api/topic-map`)
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
      return r.json()
    })
    .then((data: unknown) => {
      memCache = data
      writeStorage(data)
      inflight = null
      return data
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight as Promise<T>
}

let refreshing = false
function refreshInBackground(apiBase: string): Promise<void> {
  if (refreshing) return Promise.resolve()
  refreshing = true
  return fetch(`${apiBase}/api/topic-map`)
    .then(async (r) => (r.ok ? r.json() : null))
    .then((data: unknown) => {
      if (data) {
        memCache = data
        writeStorage(data)
      }
      refreshing = false
    })
    .catch(() => {
      refreshing = false
    })
}

export function prefetchTopicGraph(apiBase: string): void {
  void getTopicGraph(apiBase).catch(() => {})
}
