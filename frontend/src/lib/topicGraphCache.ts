/* ============================================================================
   topicGraphCache — module-level + localStorage cache for /api/topic-map.

   Why: the artifact is ~6.8 MB raw / ~1 MB gzipped. Even with the gzip-fast
   backend it's ~0.5–1 s on a fresh fetch, and at least 4 frontend pages
   (Home, Library, PaperBrowse, TopicGraph3D) currently fire their own
   independent fetches. With this cache:

     • In-session navigation (any page → any page) is instant. First fetch
       wins, all later callers reuse it.
     • Returning sessions hydrate from localStorage synchronously (~10-50 ms
       JSON.parse). The page renders with last-seen data while a background
       refresh checks for a newer version. Classic stale-while-revalidate.
     • localStorage entry expires after STORAGE_MAX_AGE_MS so users don't
       see months-old layouts.

   Caveats:
     • localStorage has a ~5 MB cap on most browsers. Our 6.8 MB raw JSON
       can be over that limit. We check for failure on write and silently
       fall back to memory-only — degrading gracefully.
     • Prefer using `getCachedTopicGraphSync()` to seed initial state so
       the first paint already has data.
   ============================================================================ */

const STORAGE_KEY = 'topic-graph-cache:v1'
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000   // 24h freshness window

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
    // Quota exceeded, private mode, etc. — silently degrade to memory-only.
  }
}

/**
 * Synchronous read for seeding initial React state.
 * Returns memCache if present, else attempts a localStorage hydrate, else null.
 * Side effect: populates memCache on a localStorage hit so subsequent calls
 * skip the JSON.parse.
 */
export function getCachedTopicGraphSync<T = unknown>(): T | null {
  if (memCache) return memCache as T
  const stored = readStorage()
  if (stored) {
    memCache = stored
    return stored as T
  }
  return null
}

/**
 * Async getter: returns cached data immediately if available, otherwise
 * fetches /api/topic-map. Always triggers a background refresh after a
 * stale hit so the cache stays warm.
 */
export function getTopicGraph<T = unknown>(apiBase: string): Promise<T> {
  // Mem hit — instant.
  if (memCache) {
    void refreshInBackground(apiBase)
    return Promise.resolve(memCache as T)
  }

  // Storage hit — return immediately, refresh in BG.
  const stored = readStorage()
  if (stored) {
    memCache = stored
    void refreshInBackground(apiBase)
    return Promise.resolve(stored as T)
  }

  // Cold path — fetch + share inflight.
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

/**
 * Fire-and-forget prefetch for the cache. Cheap to call repeatedly — the
 * inflight-promise dedup means at most one network request runs at a time.
 * Call from `App` boot so any later navigation already has data.
 */
export function prefetchTopicGraph(apiBase: string): void {
  void getTopicGraph(apiBase).catch(() => {})
}
