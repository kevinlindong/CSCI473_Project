import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { useLibrary } from '../hooks/useLibrary'
import { useDrafts, writeDraftSource, readDraftSource, type DraftMeta } from '../hooks/useDrafts'
import { extractMeta } from '../lib/latex'
import { SAMPLE_PAPERS } from '../sample-papers'

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

  // Seed the workshop with example papers on first visit. Flag is set
  // immediately to keep StrictMode's double-invocation from double-seeding,
  // and so a user who deletes them later doesn't get them back.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SEED_KEY = 'folio_samples_seeded_v1'
    if (window.localStorage.getItem(SEED_KEY)) return
    window.localStorage.setItem(SEED_KEY, '1')
    for (const sample of SAMPLE_PAPERS) {
      const id = createDraft(sample.title)
      writeDraftSource(id, sample.source)
    }
  }, [createDraft])

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
            <span className="block text-[18px] md:text-[22px] text-forest/65 mt-3 max-w-[58ch]">
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

        {/* Drafts */}
        {drafts.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-1">
                  plate I · your drafts
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-[32px] text-forest leading-none">
                  in the workshop.
                </h2>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tracking-widest uppercase tabular-nums">
                {draftCount} scholar{draftCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7">
              {drafts.map(d => (
                <DraftTile
                  key={d.id}
                  draft={d}
                  onOpen={() => navigate(`/editor/${d.id}`)}
                  onDelete={() => handleDeleteDraft(d.id, d.title)}
                />
              ))}
            </div>
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
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-1">
                  plate {drafts.length > 0 ? 'II' : 'I'} · currently reading
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-[32px] text-forest leading-none">
                  on the desk.
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {missingCount > 0 && (
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tracking-widest uppercase">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7">
              {savedPapers.map(p => (
                <PaperTile
                  key={p.paper_id}
                  paper={p}
                  clusterId={clusterById[p.paper_id]}
                  clusterLabel={clusterLabels[clusterById[p.paper_id]] ?? ''}
                  onRemove={() => remove(p.paper_id)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

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
      <p className="font-[family-name:var(--font-body)] text-[14px] text-forest/65 max-w-[42ch] mx-auto leading-relaxed">
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

// Pull a few short paragraph snippets out of a LaTeX source so the thumbnail
// shows real content rather than placeholder lorem. Strips commands, math,
// and braces — close enough to plain text for a tiny preview.
function extractBodyLines(source: string, max = 8): string[] {
  let body = source
  const beginIdx = body.search(/\\begin\{document\}/)
  if (beginIdx !== -1) body = body.slice(beginIdx + '\\begin{document}'.length)
  const endIdx = body.search(/\\end\{document\}/)
  if (endIdx !== -1) body = body.slice(0, endIdx)

  body = body
    .replace(/(^|[^\\])%[^\n]*/g, '$1')
    .replace(/\\begin\{(equation|align|gather|multline|displaymath|eqnarray|abstract|figure|table|verbatim|lstlisting)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\(cite|citep|citet|ref|eqref|label|includegraphics|input|include|usepackage|documentclass|maketitle|today|tableofcontents)\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/\\(begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')

  return body
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, max)
}

function PaperThumbnail({
  title,
  lines,
  hasFormula = false,
  hasFigure = false,
  accent = '#264635',
}: {
  title: string
  lines: string[]
  hasFormula?: boolean
  hasFigure?: boolean
  accent?: string
}) {
  return (
    <div className="relative aspect-[8.5/11] w-full bg-milk border border-forest/15 rounded-md overflow-hidden shadow-[0_2px_10px_-4px_rgba(38,70,53,0.18)]">
      {/* margin column accent */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent, opacity: 0.55 }} />

      <div className="absolute inset-0 px-3 pt-3 pb-2 font-[family-name:var(--font-cm)] text-forest leading-[1.18]">
        {/* Mini paper title */}
        <div className="text-[6.5px] font-medium text-center text-forest/85 line-clamp-2 mb-1.5 leading-snug">
          {title || 'untitled'}
        </div>

        {/* Author / abstract divider rule */}
        <div className="h-px bg-forest/15 my-1" />

        {/* Body lines — real text scaled tiny */}
        <div className="text-[4px] text-forest/65 leading-[1.45] space-y-[1px]">
          {lines.length === 0 ? (
            // Placeholder: 6 dashed lines so empty drafts don't look broken
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[2px] rounded-sm bg-forest/12"
                style={{ width: `${65 + ((i * 13) % 32)}%` }}
              />
            ))
          ) : (
            lines.slice(0, 4).map((l, i) => (
              <p key={i} className="line-clamp-2 break-words">
                {l}
              </p>
            ))
          )}
        </div>

        {hasFormula && (
          <div className="my-1.5 flex items-center justify-center">
            <span className="font-[family-name:var(--font-cm)] italic text-[7px] text-forest/70">
              ∫ ∂x · f(x) dx = ∑ aᵢ
            </span>
          </div>
        )}

        {/* More body */}
        <div className="text-[4px] text-forest/55 leading-[1.45] space-y-[1px] mt-1">
          {lines.slice(4, 8).length > 0 ? (
            lines.slice(4, 8).map((l, i) => (
              <p key={i} className="line-clamp-2 break-words">
                {l}
              </p>
            ))
          ) : (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[2px] rounded-sm bg-forest/10"
                style={{ width: `${55 + ((i * 17) % 38)}%` }}
              />
            ))
          )}
        </div>

        {hasFigure && (
          <div className="absolute bottom-3 left-3 right-3 h-7 rounded-sm border border-forest/15 bg-sage/10 flex items-center justify-center">
            <span className="font-[family-name:var(--font-mono)] text-[5px] text-forest/40 tracking-widest uppercase">fig 1</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DraftTile({
  draft, onOpen, onDelete,
}: {
  draft: DraftMeta
  onOpen: () => void
  onDelete: () => void
}) {
  const source = useMemo(() => readDraftSource(draft.id) ?? '', [draft.id, draft.updatedAt])
  const lines = useMemo(() => extractBodyLines(source), [source])
  const hasFormula = useMemo(() => /\\begin\{(equation|align|displaymath)\}|\\\[|\$\$/.test(source), [source])
  const hasFigure = useMemo(() => /\\begin\{figure\}|\\includegraphics/.test(source), [source])

  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className="block w-full text-left cursor-pointer focus:outline-none"
        aria-label={`Open ${draft.title || 'untitled scholar'}`}
      >
        <div className="transition-transform duration-200 group-hover:-translate-y-0.5">
          <PaperThumbnail
            title={draft.title}
            lines={lines}
            hasFormula={hasFormula}
            hasFigure={hasFigure}
            accent="#264635"
          />
        </div>

        <div className="mt-3 px-1">
          <h4 className="font-[family-name:var(--font-body)] text-[14px] text-forest leading-snug truncate">
            {draft.title || 'untitled scholar'}
          </h4>
          <div className="mt-1 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tracking-wider">
            <span className="inline-flex items-center gap-1">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 113 3L12 17l-4 1 1-4 9.5-9.5z" />
              </svg>
              draft
            </span>
            <span className="text-forest/25">·</span>
            <span>{formatRelative(draft.updatedAt)}</span>
          </div>
        </div>
      </button>

      {/* Hover-only discard pill, placed top-right of the thumbnail */}
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                   px-2 h-6 rounded-full font-[family-name:var(--font-mono)] text-[9px] tracking-[0.18em] uppercase
                   bg-cream/95 backdrop-blur text-forest/65 hover:text-[#C85544] border border-forest/15 hover:border-[#C85544]/40"
        title="discard draft"
      >
        discard
      </button>
    </div>
  )
}

function PaperTile({
  paper, clusterId, clusterLabel, onRemove,
}: {
  paper: PaperSummary
  clusterId: number | undefined
  clusterLabel: string
  onRemove: () => void
}) {
  const color = colorFor(clusterId)
  const lines = useMemo(() => {
    if (!paper.abstract) return []
    return paper.abstract.split(/(?<=[.!?])\s+/).slice(0, 6)
  }, [paper.abstract])

  return (
    <div className="group relative">
      <Link
        to={`/browse?paper=${encodeURIComponent(paper.paper_id)}`}
        className="block focus:outline-none"
        aria-label={`Open ${paper.title} in corpus`}
      >
        <div className="transition-transform duration-200 group-hover:-translate-y-0.5">
          <PaperThumbnail
            title={paper.title}
            lines={lines}
            hasFormula
            accent={color}
          />
        </div>

        <div className="mt-3 px-1">
          <h4 className="font-[family-name:var(--font-body)] text-[14px] text-forest leading-snug line-clamp-2">
            {paper.title}
          </h4>
          <div className="mt-1 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tracking-wider flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {clusterLabel || `arXiv:${paper.paper_id}`}
            </span>
            {paper.date && (
              <>
                <span className="text-forest/25">·</span>
                <span>{paper.date}</span>
              </>
            )}
          </div>
        </div>
      </Link>

      <button
        onClick={(e) => { e.preventDefault(); onRemove() }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                   px-2 h-6 rounded-full font-[family-name:var(--font-mono)] text-[9px] tracking-[0.18em] uppercase
                   bg-cream/95 backdrop-blur text-forest/65 hover:text-[#C85544] border border-forest/15 hover:border-[#C85544]/40"
        title="remove from library"
      >
        remove
      </button>
    </div>
  )
}
