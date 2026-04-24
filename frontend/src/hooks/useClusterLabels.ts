import { useEffect, useMemo, useState, useCallback } from 'react'

export interface ClusterInfo {
  id: number
  label: string
  size: number
}

const STORAGE_KEY = 'cluster_labels_v1'

function readOverrides(): Record<number, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Keys come back as strings after JSON.parse; coerce to numbers.
      const out: Record<number, string> = {}
      for (const k of Object.keys(parsed)) {
        const n = Number(k)
        if (!Number.isNaN(n) && typeof parsed[k] === 'string') out[n] = parsed[k]
      }
      return out
    }
    return {}
  } catch {
    return {}
  }
}

function writeOverrides(overrides: Record<number, string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // localStorage may be disabled (private mode, quota exceeded) — silently drop.
  }
}

/**
 * Merge server-provided cluster labels with per-browser user overrides stored
 * in localStorage. `setLabel` persists immediately; `resetLabel` clears a
 * single override so the server value shows through again.
 */
export function useClusterLabels(serverClusters: ClusterInfo[] | undefined) {
  const [overrides, setOverrides] = useState<Record<number, string>>(readOverrides)

  // Listen for changes made in other tabs/windows so edits stay in sync.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setOverrides(readOverrides())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const labels = useMemo(() => {
    const out: Record<number, string> = {}
    for (const c of serverClusters ?? []) {
      out[c.id] = overrides[c.id] ?? c.label
    }
    return out
  }, [serverClusters, overrides])

  const setLabel = useCallback((id: number, value: string) => {
    const trimmed = value.trim()
    setOverrides(prev => {
      const next = { ...prev }
      if (trimmed.length === 0) {
        delete next[id]
      } else {
        next[id] = trimmed
      }
      writeOverrides(next)
      return next
    })
  }, [])

  const resetLabel = useCallback((id: number) => {
    setOverrides(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      writeOverrides(next)
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setOverrides({})
    writeOverrides({})
  }, [])

  return { labels, setLabel, resetLabel, resetAll, hasOverride: (id: number) => id in overrides }
}
