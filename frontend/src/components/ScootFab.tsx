import { useState, useEffect } from 'react'
import { ScootChat } from './ScootChat'

/* ------------------------------------------------------------------ */
/* ScootFab                                                            */
/* Bottom-right circular button. Click or ⌘K opens the scoot chat.    */
/* Position is fixed across all pages — never shifts.                  */
/* ------------------------------------------------------------------ */

export function ScootFab() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <ScootChat open={open} onClose={() => setOpen(false)} />

      <div className="fixed bottom-6 right-6 z-50 group">
        <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2.5 pointer-events-none
          opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0
          transition-all duration-150">
          <span className="font-mono text-[9px] text-parchment/80 bg-forest-deep/90 backdrop-blur-sm px-2.5 py-1 rounded-md whitespace-nowrap shadow-sm">
            scoot · ⌘K
          </span>
        </div>

        <button
          onClick={() => setOpen(o => !o)}
          className="w-12 h-12 rounded-full bg-forest flex items-center justify-center
            shadow-[0_4px_20px_-4px_rgba(26,47,38,0.45)]
            hover:scale-110 hover:shadow-[0_6px_28px_-4px_rgba(26,47,38,0.6)]
            transition-all duration-200 cursor-pointer"
          aria-label="Open scoot (⌘K)"
        >
          {/* Stylized 's' for scoot */}
          <span className="font-[family-name:var(--font-display)] text-parchment text-[22px] leading-none translate-y-[1px]">
            s
          </span>
        </button>
      </div>
    </>
  )
}
