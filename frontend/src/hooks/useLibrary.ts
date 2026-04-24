import { useCallback, useEffect, useState } from 'react'

/*
 * useLibrary — localStorage-backed "papers I'm working on" set.
 * Persists a list of arXiv paper IDs per browser. Mirrors across tabs via the
 * StorageEvent so a save in one tab shows up in an open Library tab immediately.
 */

const STORAGE_KEY = 'folio_library_v1'

function readIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function writeIds(ids: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // quota exceeded or disabled — silently drop
  }
}

export function useLibrary() {
  const [ids, setIds] = useState<string[]>(readIds)

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIds(readIds())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const has = useCallback((id: string) => ids.includes(id), [ids])

  const add = useCallback((id: string) => {
    setIds(prev => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      writeIds(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setIds(prev => {
      if (!prev.includes(id)) return prev
      const next = prev.filter(x => x !== id)
      writeIds(next)
      return next
    })
  }, [])

  const toggle = useCallback((id: string) => {
    setIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      writeIds(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setIds([])
    writeIds([])
  }, [])

  return { ids, has, add, remove, toggle, clear, count: ids.length }
}
