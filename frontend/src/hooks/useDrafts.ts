import { useCallback, useEffect, useState } from 'react'

/*
 * useDrafts — localStorage-backed list of papers the user is writing.
 *
 * Two layers of storage:
 *   folio_drafts_v1           — Record<id, DraftMeta>  (small, read eagerly)
 *   folio_draft_src_v1:<id>   — LaTeX source string     (large, read on demand)
 *
 * The split keeps the index cheap to enumerate (Library lists titles + times)
 * while large source blobs stay behind a direct key lookup.
 */

export type DraftMeta = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

const INDEX_KEY = 'folio_drafts_v1'
const SOURCE_PREFIX = 'folio_draft_src_v1:'
const LEGACY_SCRATCH_KEY = 'paper-editor:draft'
export const SCRATCH_ID = 'scratch'

function sourceKey(id: string): string {
  return `${SOURCE_PREFIX}${id}`
}

// ── Index read/write ──────────────────────────────────────────────────────
function readIndex(): Record<string, DraftMeta> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(INDEX_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, DraftMeta>
  } catch {
    return {}
  }
}

function writeIndex(index: Record<string, DraftMeta>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // quota exceeded — drop silently
  }
}

// ── Source read/write (exposed for the editor) ────────────────────────────
export function readDraftSource(id: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(sourceKey(id))
  } catch {
    return null
  }
}

export function writeDraftSource(id: string, text: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(sourceKey(id), text)
  } catch {
    // quota exceeded
  }
}

function deleteDraftSource(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(sourceKey(id))
  } catch {
    // noop
  }
}

// One-shot migration: first time we see the scratch draft, pull whatever
// was in the old single-slot key into the new per-id storage so existing
// users don't lose their draft.
function migrateLegacyScratch(): void {
  if (typeof window === 'undefined') return
  try {
    if (window.localStorage.getItem(sourceKey(SCRATCH_ID)) !== null) return
    const legacy = window.localStorage.getItem(LEGACY_SCRATCH_KEY)
    if (legacy != null) {
      window.localStorage.setItem(sourceKey(SCRATCH_ID), legacy)
    }
  } catch {
    // noop
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useDrafts() {
  const [index, setIndex] = useState<Record<string, DraftMeta>>(() => {
    migrateLegacyScratch()
    return readIndex()
  })

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === INDEX_KEY) setIndex(readIndex())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const drafts = Object.values(index).sort((a, b) => b.updatedAt - a.updatedAt)

  // Create a new draft with a fresh UUID. Returns the new id so callers can navigate.
  const createDraft = useCallback((title = 'untitled scholar'): string => {
    const id =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const meta: DraftMeta = { id, title, createdAt: now, updatedAt: now }
    setIndex(prev => {
      const next = { ...prev, [id]: meta }
      writeIndex(next)
      return next
    })
    writeDraftSource(id, '')
    return id
  }, [])

  // Upsert meta (used by the editor on every debounced save).
  const touchDraft = useCallback((id: string, title?: string) => {
    setIndex(prev => {
      const existing = prev[id]
      const now = Date.now()
      const next: DraftMeta = existing
        ? { ...existing, title: title ?? existing.title, updatedAt: now }
        : { id, title: title ?? 'untitled scholar', createdAt: now, updatedAt: now }
      if (
        existing &&
        existing.title === next.title &&
        now - existing.updatedAt < 1000
      ) {
        // skip the write — no visible change and very recent
        return prev
      }
      const merged = { ...prev, [id]: next }
      writeIndex(merged)
      return merged
    })
  }, [])

  const renameDraft = useCallback((id: string, title: string) => {
    setIndex(prev => {
      if (!prev[id]) return prev
      const merged = {
        ...prev,
        [id]: { ...prev[id], title, updatedAt: Date.now() },
      }
      writeIndex(merged)
      return merged
    })
  }, [])

  const deleteDraft = useCallback((id: string) => {
    setIndex(prev => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      writeIndex(next)
      return next
    })
    deleteDraftSource(id)
  }, [])

  return {
    drafts,
    createDraft,
    touchDraft,
    renameDraft,
    deleteDraft,
    count: drafts.length,
  }
}
