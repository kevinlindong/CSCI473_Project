import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { useLibrary } from '../hooks/useLibrary'
import { useDrafts, writeDraftSource, type DraftMeta } from '../hooks/useDrafts'
import { extractMeta } from '../lib/latex'

/* ==========================================================================
   Library — "papers you're working on". localStorage-backed, so each browser
   keeps its own shelf. Fetches /api/papers once and renders the subset whose
   paper_id is in the saved list. /api/topic-map enriches each card with a
   cluster label and accent color.
   ========================================================================== */

interface PaperSummary {
  paper_id: string
  title: string
  authors: string[]
  abstract: string
  url: string
  date: string
}

interface TopicMap {
  nodes: Array<{ paper_id: string; cluster: number }>
  clusters: Array<{ id: number; label: string; size: number }>
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

const PALETTE = [
  '#7F9267', '#2C4B70', '#4A6741', '#E0B13A', '#8B6E4E',
  '#A3B18A', '#264635', '#C85544', '#6E7CB9', '#B99155',
  '#8A6D9B', '#4F7F82', '#9B6E5C',
]
const colorFor = (id: number | undefined) =>
  id === undefined || id < 0 ? '#7F9267' : PALETTE[id % PALETTE.length]

export default function Library() {
  const navigate = useNavigate()
  const { ids, remove, clear, count } = useLibrary()
  const { drafts, createDraft, deleteDraft, count: draftCount } = useDrafts()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [importingTex, setImportingTex] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const handleNewPaper = useCallback(() => {
    const id = createDraft()
    navigate(`/editor/${id}`)
  }, [createDraft, navigate])

  const handleDeleteDraft = useCallback((id: string, title: string) => {
    if (typeof window === 'undefined') return
    const ok = window.confirm(`Discard "${title || 'untitled scholar'}"? This cannot be undone.`)
    if (ok) deleteDraft(id)
  }, [deleteDraft])

  const handleImportTexClick = useCallback(() => {
    setImportError(null)
    importInputRef.current?.click()
  }, [])

  const handleImportTex = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.tex$/i.test(file.name)) {
      setImportError('Please choose a .tex file.')
      return
    }

    setImportingTex(true)
    setImportError(null)
    try {
      const source = await file.text()
      const parsedTitle = extractMeta(source).meta.title?.replace(/\\\\/g, ' ').trim()
      const filenameTitle = file.name.replace(/\.tex$/i, '').replace(/[_-]+/g, ' ').trim()
      const title = parsedTitle || filenameTitle || 'untitled scholar'
      const id = createDraft(title)
      writeDraftSource(id, source)
      navigate(`/editor/${id}`)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to import this .tex file.')
    } finally {
      setImportingTex(false)
    }
  }, [createDraft, navigate])

  const [papers, setPapers] = useState<PaperSummary[]>([])
  const [clusterById, setClusterById] = useState<Record<string, number>>({})
  const [clusterLabels, setClusterLabels] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [papersRes, topicRes] = await Promise.all([
          fetch(`${API_BASE}/api/papers`),
          fetch(`${API_BASE}/api/topic-map`),
        ])
        if (!papersRes.ok) throw new Error(`/api/papers ${papersRes.status}`)
        const papersJson = (await papersRes.json()) as PaperSummary[]

        let byId: Record<string, number> = {}
        let labels: Record<number, string> = {}
        if (topicRes.ok) {
          const topic = (await topicRes.json()) as TopicMap
          byId = Object.fromEntries(topic.nodes.map(n => [n.paper_id, n.cluster]))
          labels = Object.fromEntries(topic.clusters.map(c => [c.id, c.label || `cluster ${c.id}`]))
        }

        if (cancelled) return
        setPapers(papersJson)
        setClusterById(byId)
        setClusterLabels(labels)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const paperById = useMemo(() => {
    const m = new Map<string, PaperSummary>()
    for (const p of papers) m.set(p.paper_id, p)
    return m
  }, [papers])

  // Preserve user's save order (most-recently-saved last). Drop IDs that
  // no longer exist in the corpus (e.g., backend was rebuilt).
  const savedPapers = useMemo(
    () => ids.map(id => paperById.get(id)).filter((p): p is PaperSummary => !!p),
    [ids, paperById],
  )
  const missingCount = ids.length - savedPapers.length

  const handleClear = useCallback(() => {
    if (typeof window === 'undefined') return
    const confirmed = window.confirm(`Remove all ${count} papers from your library?`)
    if (confirmed) clear()
  }, [clear, count])

  return (
    <div className="min-h-screen bg-cream text-forest">
      <Navbar variant="light" />

      {/* Masthead */}
      <header className="relative border-b border-forest/12 overflow-hidden bg-cream">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 right-[10%] w-[360px] h-[360px] rounded-full bg-sage/20 blur-3xl" />
          <div className="absolute -bottom-10 left-[8%] w-[280px] h-[280px] rounded-full bg-sage-deep/12 blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-8 pt-16 pb-10">
          <div className="flex items-baseline gap-4 mb-4">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">
              your shelf
            </span>
            <div className="flex-1 h-px bg-forest/15" />
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/55 tabular-nums">
              {count} saved
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-forest leading-[0.94] font-light">
            <span className="block text-[72px] md:text-[104px]">the library<span className="text-sage-deep">.</span></span>
            <span className="block text-[18px] md:text-[22px] text-forest/60 mt-3 max-w-[58ch]">
              — your drafts and the papers set aside for closer reading.
            </span>
          </h1>
          <div className="mt-8 flex items-start gap-6 flex-wrap">
            <p className="font-[family-name:var(--font-body)] text-[15px] leading-[1.8] text-forest/75 max-w-[54ch]">
              Drafts live alongside arXiv saves from <Link to="/browse" className="underline decoration-forest/25 underline-offset-4 hover:decoration-forest/60">the corpus</Link>.
              Everything is browser-local — no account, no sync.
            </p>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <input
                ref={importInputRef}
                type="file"
                accept=".tex,text/x-tex,application/x-tex,text/plain"
                className="hidden"
                onChange={handleImportTex}
              />
              <button
                onClick={handleImportTexClick}
                disabled={importingTex}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-forest/20 bg-milk text-forest/80 hover:bg-sage/15 hover:text-forest transition-colors font-[family-name:var(--font-body)] text-[14px] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v11m0 0l-4-4m4 4l4-4" />
                </svg>
                {importingTex ? 'importing…' : 'import .tex'}
              </button>
              <button
                onClick={handleNewPaper}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-forest text-parchment hover:bg-forest-ink transition-colors font-[family-name:var(--font-body)] text-[14px]"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                new paper
              </button>
            </div>
          </div>
          {importError && (
            <p className="mt-3 font-[family-name:var(--font-body)] text-[13.5px] text-[#C85544]">
              {importError}
            </p>
          )}
        </div>
      </header>

      {/* Content */}
      <section className="max-w-6xl mx-auto px-8 py-14 space-y-14">
        {error && (
          <div className="p-5 rounded-2xl bg-milk border border-forest/15 font-[family-name:var(--font-body)] text-[14px] text-forest/75 leading-relaxed">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-[#C85544] mb-2">
              couldn't reach the backend
            </div>
            <div>{error}</div>
          </div>
        )}

        {/* Drafts — always visible when any exist */}
        {drafts.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-1">
                  plate I · your drafts
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-[32px] text-forest leading-none">
                  in the workshop.
                </h2>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 tracking-widest uppercase tabular-nums">
                {draftCount} scholar{draftCount === 1 ? '' : 's'}
              </span>
            </div>
            <ol className="space-y-4">
              {drafts.map((d, idx) => (
                <DraftCard
                  key={d.id}
                  rank={idx + 1}
                  draft={d}
                  onOpen={() => navigate(`/editor/${d.id}`)}
                  onDelete={() => handleDeleteDraft(d.id, d.title)}
                />
              ))}
            </ol>
          </div>
        )}

        {/* arXiv saved papers */}
        {loading ? (
          <div className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] uppercase text-forest/55">
            loading corpus…
          </div>
        ) : count === 0 && drafts.length === 0 ? (
          <EmptyState onNew={handleNewPaper} />
        ) : count > 0 ? (
          <div>
            <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-1">
                  plate {drafts.length > 0 ? 'II' : 'I'} · currently reading
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-[32px] text-forest leading-none">
                  on the desk.
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {missingCount > 0 && (
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 tracking-widest uppercase">
                    {missingCount} unresolved
                  </span>
                )}
                <button
                  onClick={handleClear}
                  className="px-4 h-9 rounded-full border border-forest/15 bg-milk hover:bg-[#C85544]/10 hover:border-[#C85544]/40 text-forest/65 hover:text-[#C85544] transition-colors font-[family-name:var(--font-body)] text-[13px]"
                >
                  clear shelf
                </button>
              </div>
            </div>
            <ol className="space-y-4">
              {savedPapers.map((p, idx) => (
                <LibraryCard
                  key={p.paper_id}
                  rank={idx + 1}
                  paper={p}
                  clusterId={clusterById[p.paper_id]}
                  clusterLabel={clusterLabels[clusterById[p.paper_id]] ?? ''}
                  onRemove={() => remove(p.paper_id)}
                />
              ))}
            </ol>
          </div>
        ) : null}
      </section>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="bg-milk border border-dashed border-forest/15 rounded-3xl py-20 px-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-sage/20 ring-1 ring-sage-deep/30 flex items-center justify-center mb-5">
        <svg className="w-5 h-5 text-sage-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5v14l7-5 7 5V5a2 2 0 00-2-2H7a2 2 0 00-2 2z" />
        </svg>
      </div>
      <div className="font-[family-name:var(--font-display)] text-[30px] text-forest/70 leading-tight mb-2">
        nothing on the shelf yet.
      </div>
      <p className="font-[family-name:var(--font-body)] text-[14px] text-forest/55 max-w-[42ch] mx-auto leading-relaxed">
        Start a new paper, or open one from <Link to="/browse" className="text-forest underline decoration-forest/25 underline-offset-4 hover:decoration-forest/60">the corpus</Link> and tap <span className="text-forest">save</span>.
      </p>
      <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-forest text-parchment hover:bg-forest-ink transition-colors font-[family-name:var(--font-body)] text-[14px]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          new paper
        </button>
        <Link
          to="/browse"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-forest/20 bg-milk hover:bg-sage/15 hover:border-forest/40 text-forest/75 hover:text-forest transition-colors font-[family-name:var(--font-body)] text-[14px]"
        >
          browse the corpus
          <span>→</span>
        </Link>
      </div>
    </div>
  )
}

// ─── Draft card ────────────────────────────────────────────────────────────
function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

function DraftCard({
  rank, draft, onOpen, onDelete,
}: {
  rank: number
  draft: DraftMeta
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <li
      onClick={onOpen}
      className="relative bg-milk border border-forest/15 rounded-2xl pl-7 pr-6 py-5 cursor-pointer group hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(38,70,53,0.22)] transition-all duration-200"
    >
      <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-forest opacity-80" />
      <div className="absolute -left-3 -top-3 w-7 h-7 rounded-full bg-cream border border-forest/15 flex items-center justify-center font-[family-name:var(--font-body)] text-[12px] text-forest/70 tabular-nums">
        {rank}
      </div>

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-forest/60">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 113 3L12 17l-4 1 1-4 9.5-9.5z" />
          </svg>
          draft
        </span>
        <span className="text-forest/20">·</span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 uppercase tracking-wider">
          updated {formatRelative(draft.updatedAt)}
        </span>
      </div>

      <h4 className="font-[family-name:var(--font-display)] text-[22px] text-forest leading-[1.22] mb-1.5 tracking-[-0.005em]">
        {draft.title || 'untitled scholar'}
      </h4>

      <div className="mt-4 pt-3 border-t border-forest/12 flex items-center gap-4 flex-wrap font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tracking-wider">
        <span className="inline-flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          open in editor
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.18em] uppercase text-forest/55 hover:text-[#C85544] hover:bg-[#C85544]/10 border border-forest/15 hover:border-[#C85544]/30 transition-colors"
          title="discard draft"
        >
          discard
        </button>
        <span className="font-[family-name:var(--font-body)] text-[14px] text-forest/65 group-hover:text-forest transition-colors">
          resume writing ↗
        </span>
      </div>
    </li>
  )
}

// ─── Library card ──────────────────────────────────────────────────────────
function LibraryCard({
  rank, paper, clusterId, clusterLabel, onRemove,
}: {
  rank: number
  paper: PaperSummary
  clusterId: number | undefined
  clusterLabel: string
  onRemove: () => void
}) {
  const color = colorFor(clusterId)
  return (
    <li className="relative bg-milk border border-forest/15 rounded-2xl pl-7 pr-6 py-5 group hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(38,70,53,0.22)] transition-all duration-200">
      <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: color, opacity: 0.7 }} />
      <div className="absolute -left-3 -top-3 w-7 h-7 rounded-full bg-cream border border-forest/15 flex items-center justify-center font-[family-name:var(--font-body)] text-[12px] text-forest/70 tabular-nums">
        {rank}
      </div>

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] text-forest/55">arXiv:{paper.paper_id}</span>
        {paper.date && (
          <>
            <span className="text-forest/20">·</span>
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 uppercase tracking-wider">{paper.date}</span>
          </>
        )}
        {clusterLabel && (
          <>
            <span className="text-forest/20">·</span>
            <span className="flex items-center gap-1.5 font-[family-name:var(--font-body)] text-[12.5px]" style={{ color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {clusterLabel}
            </span>
          </>
        )}
      </div>

      <h4 className="font-[family-name:var(--font-display)] text-[22px] text-forest leading-[1.22] mb-1.5 tracking-[-0.005em]">
        {paper.title}
      </h4>
      {paper.authors.length > 0 && (
        <div className="font-[family-name:var(--font-mono)] text-[11px] text-forest/55 mb-3 tracking-tight line-clamp-1">
          {paper.authors.join(' · ')}
        </div>
      )}
      {paper.abstract && (
        <p className="font-[family-name:var(--font-body)] text-[14px] text-forest/75 leading-[1.75] line-clamp-3">
          {paper.abstract}
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-forest/12 flex items-center gap-4 flex-wrap">
        <Link
          to={`/browse?paper=${encodeURIComponent(paper.paper_id)}`}
          className="inline-flex items-center gap-1.5 font-[family-name:var(--font-body)] text-[13px] text-forest/75 hover:text-forest"
        >
          open in corpus
          <span>↗</span>
        </Link>
        <a
          href={paper.url || `https://arxiv.org/abs/${paper.paper_id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px] tracking-widest uppercase text-forest/55 hover:text-forest"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          arXiv
        </a>
        <button
          onClick={onRemove}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.18em] uppercase text-forest/55 hover:text-[#C85544] hover:bg-[#C85544]/10 border border-forest/15 hover:border-[#C85544]/30 transition-colors"
          title="remove from library"
        >
          remove
        </button>
      </div>
    </li>
  )
}
