import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditorBridge } from '../contexts/EditorBridgeContext'

/* ==========================================================================
   PaperDetailDrawer — slide-in preview of a single corpus paper.
   Shared by /browse (catalogue rows + Scoot citation deep-links) and the
   ScootChat overlay (so users can preview a paper without leaving the page
   they're working on).
   ========================================================================== */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export interface PaperSummary {
  paper_id: string
  title: string
  authors?: string[]
  abstract?: string
  url?: string
  date?: string
}

interface PaperDetail extends PaperSummary {
  sections: Array<{ heading: string; text: string }>
  figures: Array<{ caption: string; image_path: string }>
}

interface Props {
  paperId: string
  summary: PaperSummary
  clusterColor?: string
  clusterLabel?: string
  onClose: () => void
}

export function PaperDetailDrawer({
  paperId, summary, clusterColor, clusterLabel, onClose,
}: Props) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const editorBridge = useEditorBridge()
  const color = clusterColor ?? '#7F9267'

  const [detail, setDetail] = useState<PaperDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [citeFlash, setCiteFlash] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    fetch(`${API_BASE}/api/papers/${encodeURIComponent(paperId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(json => { if (!cancelled) setDetail(json) })
      .catch(e => { if (!cancelled) setDetailError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [paperId])

  const paper = detail ?? summary
  const authors = paper.authors ?? []
  const sections = detail?.sections ?? []
  const figures = detail?.figures ?? []

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-forest/45 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={drawerRef}
        className="relative w-full max-w-xl bg-milk paper-grain shadow-[0_30px_80px_-30px_rgba(38,70,53,0.5)] overflow-y-auto animate-slide-in-right border-l border-forest/15"
      >
        <div className="h-[3px]" style={{ background: color, opacity: 0.6 }} />

        <div className="sticky top-0 z-10 bg-milk/95 backdrop-blur border-b border-forest/12 px-7 py-4 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.24em] uppercase text-forest/60">arxiv:{paperId}</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-forest/55 hover:text-forest hover:bg-sage/20 border border-forest/15 transition-colors"
            title="Close (esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-8 py-8">
          <div className="flex items-baseline gap-3 mb-5">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">now reading</span>
            <span className="h-px flex-1 bg-forest/12" />
          </div>

          <h2 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.1] text-forest font-light mb-4 tracking-[-0.01em]">
            {paper.title}
          </h2>
          {authors.length > 0 && (
            <div className="font-[family-name:var(--font-mono)] text-[12px] text-forest/65 mb-2">
              {authors.join(' · ')}
            </div>
          )}
          <div className="flex items-center gap-2.5 mb-7 flex-wrap">
            {clusterLabel && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-[family-name:var(--font-body)] text-[12.5px]"
                style={{ color, borderColor: `${color}55` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {clusterLabel}
              </span>
            )}
            {paper.date && (
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 tracking-[0.22em] uppercase">
                {paper.date}
              </span>
            )}
          </div>

          {paper.abstract && (
            <div className="mb-8 bg-parchment/40 border border-forest/10 rounded-2xl pl-5 pr-5 pt-4 pb-5 relative">
              <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-sage-deep/55" />
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-2">abstract</div>
              <p className="font-[family-name:var(--font-body)] text-[14.5px] text-forest/85 leading-[1.85] whitespace-pre-wrap">
                {paper.abstract}
              </p>
            </div>
          )}

          {detailLoading && (
            <div className="font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.24em] uppercase text-forest/45 mb-6">
              loading full paper…
            </div>
          )}
          {detailError && (
            <div className="mb-8 p-4 rounded-xl bg-parchment/40 border border-forest/10 font-[family-name:var(--font-body)] text-[13px] text-forest/70">
              couldn't load full paper detail ({detailError}).
            </div>
          )}

          {sections.length > 0 && (
            <div className="mb-8">
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-3">
                sections · {sections.length}
              </div>
              <div className="space-y-3">
                {sections.slice(0, 6).map((s, i) => (
                  <div key={i} className="bg-milk border border-forest/12 rounded-2xl px-5 py-4">
                    <div className="font-[family-name:var(--font-mono)] text-[10px] text-sage-deep tracking-[0.2em] uppercase mb-1.5">
                      § {s.heading || `section ${i + 1}`}
                    </div>
                    <p className="font-[family-name:var(--font-body)] text-[13.5px] text-forest/80 leading-[1.7] line-clamp-4 whitespace-pre-wrap">
                      {s.text}
                    </p>
                  </div>
                ))}
                {sections.length > 6 && (
                  <div className="font-[family-name:var(--font-mono)] text-[10px] text-forest/45 tracking-widest uppercase">
                    + {sections.length - 6} more sections
                  </div>
                )}
              </div>
            </div>
          )}

          {figures.length > 0 && (
            <div className="mb-8">
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-3">
                figures · {figures.length}
              </div>
              <div className="space-y-3">
                {figures.slice(0, 4).map((f, i) => (
                  <figure key={i} className="border border-forest/15 rounded-2xl bg-milk overflow-hidden">
                    {f.image_path ? (
                      <img src={f.image_path} alt={f.caption || `figure ${i + 1}`} className="block w-full h-auto bg-parchment/40" />
                    ) : (
                      <div className="h-32 bg-parchment/40 flex items-center justify-center font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase text-forest/40">
                        caption only
                      </div>
                    )}
                    <figcaption className="px-5 py-3 border-t border-forest/12 font-[family-name:var(--font-body)] text-[12.5px] text-forest/70 leading-snug">
                      <span className="font-[family-name:var(--font-mono)] text-[9.5px] tracking-[0.22em] uppercase mr-2 text-sage-deep">figure {i + 1}.</span>
                      {f.caption}
                    </figcaption>
                  </figure>
                ))}
                {figures.length > 4 && (
                  <div className="font-[family-name:var(--font-mono)] text-[10px] text-forest/45 tracking-widest uppercase">
                    + {figures.length - 4} more figures
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const meta = { title: paper.title, authors: paper.authors }
                if (editorBridge.isEditorActive && editorBridge.insertCitation(paperId, meta)) {
                  setCiteFlash('cited in paper')
                  setTimeout(() => setCiteFlash(null), 1800)
                  return
                }
                // No editor mounted — fall back to opening the scratch draft.
                // The user can hit "cite in paper" again once the editor is ready.
                navigate('/editor/scratch')
                onClose()
              }}
              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 h-11 rounded-full bg-forest text-parchment hover:bg-forest-ink transition-colors font-[family-name:var(--font-body)] text-[14px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {citeFlash ?? 'cite in paper'}
            </button>
            <a
              href={paper.url || `https://arxiv.org/abs/${paperId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-milk border border-forest/20 hover:bg-sage/15 hover:border-forest/40 transition-colors font-[family-name:var(--font-body)] text-[14px] text-forest/75 hover:text-forest"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              open on arXiv
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
