import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { useLibrary } from '../hooks/useLibrary'
import CorpusGraph3D from '../components/CorpusGraph3D'

/* ==========================================================================
   Paper Browse — "the reading room". Live data from the FastAPI backend:
     /api/papers           — corpus summaries
     /api/topic-map        — cluster assignments + labels
     /api/query-projection — nearest-neighbour ranking for a query
     /api/query            — full RAG: retrieve → rerank → LLM synthesis
     /api/papers/{id}      — full paper detail (sections + figures)
   Users can save papers to a localStorage-backed Library (see /library).
   ========================================================================== */

// ─── Types mirroring the backend response shapes ───────────────────────────
interface Paper {
  paper_id: string
  title: string
  authors: string[]
  abstract: string
  url: string
  date: string
}

interface Cluster {
  id: number
  label: string
  size: number
  color: string
}

interface Neighbor {
  paper_id: string
  similarity: number
}

interface Citation {
  paper_id: string
  title: string
  url: string
  passage: string
  heading: string
  score: number
}

interface QueryResult {
  answer: string
  answer_generated: boolean
  reranked: boolean
  citations: Citation[]
}

interface PaperDetail extends Paper {
  sections: Array<{ heading: string; text: string }>
  figures: Array<{ caption: string; image_path: string }>
}

// ─── Config ────────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const DEBOUNCE_MS = 300
const PROJECTION_K = 24
const PAGE_SIZE = 12

// FastAPI HTTPException responses are `{"detail": "..."}` — pull that out so
// we don't show users curly braces. Falls through to raw body, then HTTP code.
async function extractErrorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `HTTP ${res.status}`
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed?.detail === 'string') return parsed.detail
  } catch { /* not JSON, fall through */ }
  return text.length > 280 ? `${text.slice(0, 280)}…` : text
}

const ARTIFACT_HINT = /embedding artifacts|topic graph not computed|scripts\/build_embeddings|scripts\/compute_topic_graph/i

// Stable cluster palette: hue derived from id so refreshes keep the same colors.
function clusterColor(id: number): string {
  if (id < 0) return '#7F9267'
  const palette = [
    '#7F9267', '#2C4B70', '#4A6741', '#E0B13A', '#8B6E4E',
    '#A3B18A', '#264635', '#C85544', '#6E7CB9', '#B99155',
    '#8A6D9B', '#4F7F82', '#9B6E5C',
  ]
  return palette[id % palette.length]
}

const SAMPLE_QUERIES = [
  'efficient attention long context',
  'retrieval augmented language models',
  'contrastive visual representation',
  'denoising diffusion image synthesis',
]

// ─── Component ─────────────────────────────────────────────────────────────
export default function PaperBrowse() {
  // corpus state
  const [papers, setPapers] = useState<Paper[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [clusterById, setClusterById] = useState<Record<string, number>>({})
  const [graphNodes, setGraphNodes] = useState<Array<{ paper_id: string; title: string; cluster: number }>>([])
  const [graphEdges, setGraphEdges] = useState<Array<{ source: number; target: number; weight: number }>>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // search + projection
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [neighbors, setNeighbors] = useState<Neighbor[] | null>(null)
  const [searching, setSearching] = useState(false)

  // synthesized answer via /api/query (LLM-gated on the backend)
  const [answer, setAnswer] = useState<QueryResult | null>(null)
  const [answering, setAnswering] = useState(false)
  const [answerError, setAnswerError] = useState<string | null>(null)

  // filters / selection
  // Multi-select cluster filter. Empty set = "all". Clicking a chip toggles it.
  const [activeClusters, setActiveClusters] = useState<Set<number>>(new Set())
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const toggleCluster = useCallback((id: number) => {
    setActiveClusters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const constellationPanelRef = useRef<HTMLElement | null>(null)
  const fieldSurveyHeaderRef = useRef<HTMLDivElement | null>(null)
  const [graphHeight, setGraphHeight] = useState(520)

  // ── Initial load: papers + topic map ────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [papersRes, topicRes] = await Promise.all([
          fetch(`${API_BASE}/api/papers`),
          fetch(`${API_BASE}/api/topic-map`),
        ])
        if (!papersRes.ok) throw new Error(await extractErrorDetail(papersRes))
        const papersJson = (await papersRes.json()) as Paper[]

        let clusterList: Cluster[] = []
        let byId: Record<string, number> = {}
        let gNodes: Array<{ paper_id: string; title: string; cluster: number }> = []
        let gEdges: Array<{ source: number; target: number; weight: number }> = []
        if (topicRes.ok) {
          const topic = await topicRes.json()
          clusterList = (topic.clusters ?? []).map((c: { id: number; label: string; size: number }) => ({
            id: c.id,
            label: c.label || `cluster ${c.id}`,
            size: c.size,
            color: clusterColor(c.id),
          }))
          gNodes = (topic.nodes ?? []) as Array<{ paper_id: string; title: string; cluster: number }>
          gEdges = (topic.edges ?? []) as Array<{ source: number; target: number; weight: number }>
          byId = Object.fromEntries(gNodes.map(n => [n.paper_id, n.cluster]))
        }

        if (cancelled) return
        setPapers(papersJson)
        setClusters(clusterList)
        setClusterById(byId)
        setGraphNodes(gNodes)
        setGraphEdges(gEdges)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Debounce query input ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // Keep the field-survey panel close in height to the constellation list.
  useEffect(() => {
    if (typeof window === 'undefined' || graphNodes.length === 0) return
    const asideEl = constellationPanelRef.current
    const headerEl = fieldSurveyHeaderRef.current
    if (!asideEl || !headerEl) return

    const recompute = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setGraphHeight(prev => (prev === 520 ? prev : 520))
        return
      }
      const asideH = asideEl.getBoundingClientRect().height
      const headerH = headerEl.getBoundingClientRect().height
      const next = Math.round(Math.max(520, Math.min(900, asideH - headerH - 16)))
      setGraphHeight(prev => (Math.abs(prev - next) > 1 ? next : prev))
    }

    const ro = new ResizeObserver(recompute)
    ro.observe(asideEl)
    ro.observe(headerEl)
    window.addEventListener('resize', recompute)
    recompute()

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [graphNodes.length])

  // ── Projection (fast ranking) whenever debounced query changes ──────────
  useEffect(() => {
    const q = debouncedQuery.trim()
    if (!q) {
      setNeighbors(null)
      return
    }
    let cancelled = false
    setSearching(true)
    const url = `${API_BASE}/api/query-projection?q=${encodeURIComponent(q)}&k=${PROJECTION_K}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`projection ${r.status}`))))
      .then(json => {
        if (cancelled) return
        setNeighbors(json.neighbors ?? [])
      })
      .catch(() => {
        if (cancelled) return
        setNeighbors([])
      })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => { cancelled = true }
  }, [debouncedQuery])

  // ── Paper lookup + ranked view ──────────────────────────────────────────
  const paperById = useMemo(() => {
    const m = new Map<string, Paper>()
    for (const p of papers) m.set(p.paper_id, p)
    return m
  }, [papers])

  const selectedPaper = selectedPaperId ? paperById.get(selectedPaperId) : undefined

  const rankedPapers = useMemo(() => {
    const hasQuery = !!neighbors && debouncedQuery.trim().length > 0
    let base: Array<{ paper: Paper; score: number }>
    if (hasQuery) {
      base = neighbors!
        .map(n => {
          const p = paperById.get(n.paper_id)
          return p ? { paper: p, score: n.similarity } : null
        })
        .filter((x): x is { paper: Paper; score: number } => x !== null)
    } else {
      base = papers.map(p => ({ paper: p, score: 0 }))
    }
    if (activeClusters.size > 0) {
      base = base.filter(s => activeClusters.has(clusterById[s.paper.paper_id]))
    }
    return base
  }, [neighbors, debouncedQuery, papers, paperById, clusterById, activeClusters])

  // Reset to the first page whenever the filter/query shifts, so users don't
  // land on a page that no longer exists for the narrower result set.
  useEffect(() => { setPage(0) }, [debouncedQuery, activeClusters])

  const pageCount = Math.max(1, Math.ceil(rankedPapers.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageStart = clampedPage * PAGE_SIZE
  const pagedResults = rankedPapers.slice(pageStart, pageStart + PAGE_SIZE)

  // ── "Synthesise" → /api/query (LLM answer + citations) ─────────────────
  const handleSynthesize = useCallback(async () => {
    const q = debouncedQuery.trim()
    if (!q) return
    setAnswering(true)
    setAnswer(null)
    setAnswerError(null)
    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error(await extractErrorDetail(res))
      const json = (await res.json()) as QueryResult
      setAnswer(json)
    } catch (e) {
      setAnswerError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnswering(false)
    }
  }, [debouncedQuery])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-cream relative">
      <Navbar variant="light" />
      <Masthead papers={papers.length} clusters={clusters.length} />

      {/* Loading / error banner */}
      {(loading || loadError) && (
        <section className="max-w-6xl mx-auto px-8 pt-6">
          {loading && (
            <div className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] uppercase text-forest/55">
              loading corpus…
            </div>
          )}
          {loadError && (ARTIFACT_HINT.test(loadError) ? (
            <SetupNotice message={loadError} />
          ) : (
            <div className="mt-2 p-5 rounded-2xl bg-milk border border-forest/15 font-[family-name:var(--font-body)] text-[14px] text-forest/75 leading-relaxed">
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-[#C85544] mb-2">
                couldn't reach the backend
              </div>
              <div>{loadError}</div>
              <div className="mt-2 text-forest/55">
                Is the API running? Check <code className="font-[family-name:var(--font-mono)]">start.sh</code>.
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Search */}
      <section className="max-w-6xl mx-auto px-8 pt-10">
        <div className="flex items-baseline gap-3 mb-4">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
            ask the library
          </span>
          <span className="h-px flex-1 bg-forest/15" />
          <span className="font-[family-name:var(--font-body)] text-[15px] text-forest/55">
            what are we looking for today?
          </span>
        </div>

        <div className="flex items-stretch gap-0 bg-milk border border-forest/15 rounded-3xl shadow-[0_18px_36px_-22px_rgba(38,70,53,0.22)] overflow-hidden">
          <div className="flex items-center justify-center w-14 shrink-0 text-forest/55">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M21 21l-4.5-4.5" />
            </svg>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSynthesize()}
            placeholder="What methods have been proposed for efficient attention in long-context transformers?"
            className="flex-1 h-14 px-2 bg-transparent font-[family-name:var(--font-body)] text-[15px] text-forest placeholder-forest/35 focus:outline-none"
          />
          <button
            onClick={handleSynthesize}
            disabled={!debouncedQuery.trim() || answering}
            className={`h-14 px-6 my-1 mr-1 rounded-full font-[family-name:var(--font-body)] text-[12px] tracking-[0.16em] transition-all flex items-center gap-2 shrink-0 ${
              debouncedQuery.trim() && !answering
                ? 'bg-forest text-parchment hover:bg-forest-ink'
                : 'bg-forest/10 text-forest/35 cursor-not-allowed'
            }`}
          >
            {answering ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            <span>synthesise</span>
          </button>
        </div>

        {!query.trim() && (
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <span className="font-[family-name:var(--font-body)] text-[14px] text-forest/55 mr-1">try asking —</span>
            {SAMPLE_QUERIES.map(q => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="px-3.5 py-1.5 rounded-full border border-forest/15 bg-milk hover:bg-sage/15 hover:border-forest/30 transition-colors font-[family-name:var(--font-body)] text-[13px] text-forest/70 hover:text-forest"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Cluster chips */}
        {clusters.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 items-center">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mr-2">
              topics
            </span>
            <button
              onClick={() => setActiveClusters(new Set())}
              className={`h-9 px-4 rounded-full font-[family-name:var(--font-body)] text-[13px] transition-all border ${
                activeClusters.size === 0
                  ? 'bg-forest text-parchment border-forest'
                  : 'border-forest/15 text-forest/60 hover:border-forest/35 hover:text-forest bg-milk'
              }`}
            >
              all · <span className="tabular-nums">{papers.length}</span>
            </button>
            {clusters.map(c => {
              const active = activeClusters.has(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCluster(c.id)}
                  className={`h-9 pl-3 pr-3.5 rounded-full flex items-center gap-2 font-[family-name:var(--font-body)] text-[13px] transition-all border ${
                    active
                      ? 'bg-milk border-forest/35 text-forest'
                      : 'text-forest/65 hover:text-forest bg-milk border-forest/15 hover:border-forest/35'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: c.color, opacity: active ? 1 : 0.7 }}
                  />
                  <span>{c.label}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[9px] opacity-55 tabular-nums">· {c.size}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Synthesized answer */}
      {(answer || answering || answerError) && (
        <section className="max-w-6xl mx-auto px-8 pt-8 animate-fade-up">
          <div className="relative bg-milk border border-forest/15 rounded-3xl p-8 shadow-[0_18px_36px_-22px_rgba(38,70,53,0.18)] overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-sage-deep via-sage to-transparent opacity-70 absolute top-0 left-0 right-0" />
            <div className="flex items-start gap-7">
              <div className="shrink-0 w-12 h-12 rounded-full bg-sage/25 ring-1 ring-sage-deep/35 flex items-center justify-center font-[family-name:var(--font-display)] text-[22px] text-forest">
                A
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
                    synthesised response
                  </span>
                  {answer && (
                    <span className="font-[family-name:var(--font-body)] text-[14px] text-forest/55">
                      — {answer.citations.length} citations
                      {answer.reranked && <> · reranked</>}
                      {answer.answer_generated ? <> · llm</> : <> · retrieval only</>}
                    </span>
                  )}
                </div>
                {answering ? (
                  <div className="space-y-2 animate-pulse mt-5">
                    <div className="h-3 rounded-full bg-forest/10 w-11/12" />
                    <div className="h-3 rounded-full bg-forest/10 w-10/12" />
                    <div className="h-3 rounded-full bg-forest/10 w-9/12" />
                  </div>
                ) : answerError ? (
                  ARTIFACT_HINT.test(answerError) ? (
                    <div className="mt-3">
                      <SetupNotice message={answerError} inline />
                    </div>
                  ) : (
                    <p className="font-[family-name:var(--font-body)] text-[15px] text-[#C85544] mt-3">
                      {answerError}
                    </p>
                  )
                ) : answer ? (
                  <>
                    <p className="font-[family-name:var(--font-body)] text-[16px] leading-[1.85] text-forest/90 mt-2 whitespace-pre-wrap">
                      {renderAnswerWithCitations(answer.answer)}
                    </p>
                    {answer.citations.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-forest/15 flex flex-wrap gap-2">
                        {answer.citations.map((c, i) => (
                          <button
                            key={`${c.paper_id}-${i}`}
                            onClick={() => setSelectedPaperId(c.paper_id)}
                            className="inline-flex items-center gap-2 bg-parchment/40 border border-forest/15 rounded-full px-3.5 py-1.5 font-[family-name:var(--font-body)] text-[12.5px] text-forest hover:bg-sage/15 hover:border-forest/30 transition-colors text-left"
                          >
                            <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/70 bg-milk border border-forest/20 rounded-full px-1.5 py-[1px]">{i + 1}</span>
                            <span className="line-clamp-1 max-w-[18rem]">{c.title || c.paper_id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Top row — constellations (left) + 3D field survey (right) */}
      {graphNodes.length > 0 && (
        <section className="max-w-6xl mx-auto px-8 pt-12 grid grid-cols-12 gap-8">
          <aside ref={constellationPanelRef} className="col-span-12 lg:col-span-4">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-1">
                  figure I · constellations
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-[28px] text-forest leading-none">
                  the field, charted.
                </h3>
              </div>
            </div>
            <p className="font-[family-name:var(--font-body)] text-[14px] text-forest/65 leading-[1.7] mb-5 max-w-[36ch]">
              {clusters.length
                ? `${clusters.length} topic constellations, drawn from the abstract space. Toggle any to combine.`
                : 'loading constellations…'}
            </p>

            <ClusterLegend
              clusters={clusters}
              active={activeClusters}
              onPick={toggleCluster}
            />

            <p className="mt-5 font-[family-name:var(--font-body)] text-[13px] text-forest/55 leading-[1.7] max-w-[36ch]">
              {activeClusters.size === 0
                ? 'toggle any constellation to narrow the field survey — stack multiple to keep them all in view.'
                : activeClusters.size === 1
                  ? 'one constellation pinned. click it again to release, or add more to widen the survey.'
                  : `${activeClusters.size} constellations pinned. click any to release, or press “all” above to reset.`}
            </p>
          </aside>

          <div className="col-span-12 lg:col-span-8">
            <div ref={fieldSurveyHeaderRef} className="flex items-baseline gap-3 mb-4">
              <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
                figure · field survey
              </span>
              <span className="h-px flex-1 bg-forest/15" />
              <span className="font-[family-name:var(--font-body)] text-[14px] text-forest/55">
                {debouncedQuery.trim() ? 'where your question falls' : 'every paper, spatially arranged'}
              </span>
            </div>
            <CorpusGraph3D
              nodes={graphNodes}
              edges={graphEdges}
              clusters={clusters}
              activeClusters={activeClusters}
              selectedPaperId={selectedPaperId}
              queryText={debouncedQuery}
              queryNeighbors={neighbors}
              clusterColor={clusterColor}
              clusterLabel={id => clusters.find(c => c.id === id)?.label ?? ''}
              onSelectPaper={setSelectedPaperId}
              height={graphHeight}
            />
          </div>
        </section>
      )}

      {/* Catalogue — full width, below the map */}
      <section className="max-w-6xl mx-auto px-8 py-14">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-1">
              plate II · catalogue
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-[32px] text-forest leading-none">
              {debouncedQuery.trim() ? 'nearest neighbours.' : 'the catalogue.'}
            </h3>
          </div>
          <div className="text-right">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.24em] uppercase text-forest/50 tabular-nums">
              {rankedPapers.length === 0
                ? '0 / 0'
                : `${pageStart + 1}–${pageStart + pagedResults.length} / ${rankedPapers.length}`}
            </div>
            <div className="font-[family-name:var(--font-body)] text-[14px] text-forest/55 mt-1">
              {searching ? 'ranking…' : 'click any to open ↓'}
            </div>
          </div>
        </div>

        {pagedResults.length === 0 ? (
          <div className="bg-milk border border-forest/15 border-dashed rounded-2xl py-16 px-8 text-center">
            <div className="font-[family-name:var(--font-display)] text-[26px] text-forest/55 mb-2">
              {loading ? 'loading…' : 'nothing in the stacks matched that.'}
            </div>
            {!loading && (
              <div className="font-[family-name:var(--font-body)] text-[13.5px] text-forest/50">
                try a broader query, or clear the active topic filter.
              </div>
            )}
          </div>
        ) : (
          <>
            <ol className="space-y-4">
              {pagedResults.map((s, idx) => (
                <CatalogueCard
                  key={s.paper.paper_id}
                  rank={pageStart + idx + 1}
                  paper={s.paper}
                  similarity={debouncedQuery.trim() ? s.score : null}
                  clusterId={clusterById[s.paper.paper_id]}
                  clusterLabel={clusters.find(c => c.id === clusterById[s.paper.paper_id])?.label ?? ''}
                  query={debouncedQuery}
                  isSelected={selectedPaperId === s.paper.paper_id}
                  onSelect={() => setSelectedPaperId(s.paper.paper_id)}
                />
              ))}
            </ol>

            {pageCount > 1 && (
              <Pagination
                page={clampedPage}
                pageCount={pageCount}
                onPick={p => {
                  setPage(p)
                  if (typeof window !== 'undefined') {
                    window.scrollTo({ top: window.scrollY, behavior: 'auto' })
                  }
                }}
              />
            )}
          </>
        )}
      </section>

      {selectedPaper && (
        <DetailDrawer
          paperId={selectedPaper.paper_id}
          summary={selectedPaper}
          clusterId={clusterById[selectedPaper.paper_id]}
          clusterLabel={clusters.find(c => c.id === clusterById[selectedPaper.paper_id])?.label ?? ''}
          onClose={() => setSelectedPaperId(null)}
        />
      )}
    </div>
  )
}

// ─── Setup notice — shown when the backend is up but missing precomputed
// artifacts (embeddings / topic graph). Extracts the suggested command from
// the detail string so the user can copy-run it directly.
function SetupNotice({ message, inline = false }: { message: string; inline?: boolean }) {
  const cmdMatch = message.match(/python\s+scripts\/[\w.-]+\.py(?:\s+--\S+)*/)
  const cmd = cmdMatch?.[0] ?? 'python scripts/build_embeddings.py'
  const [copied, setCopied] = useState(false)

  const missingMatch = message.match(/\[([^\]]+)\]/)
  const missing = missingMatch?.[1]

  const handleCopy = () => {
    navigator.clipboard?.writeText(cmd).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => { /* ignore */ },
    )
  }

  return (
    <div className={`${inline ? '' : 'mt-2'} p-6 rounded-2xl bg-parchment/50 border border-sage-deep/30 relative overflow-hidden`}>
      <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-sage-deep/60" />
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-sage-deep">
          setup required
        </span>
        <span className="font-[family-name:var(--font-body)] text-[13px] text-forest/55">
          — the backend is running, but one step is missing
        </span>
      </div>
      <p className="font-[family-name:var(--font-body)] text-[14.5px] text-forest/85 leading-[1.7] mb-4">
        The corpus needs its embeddings built before search will work.
        {missing && (
          <> Missing: <span className="font-[family-name:var(--font-mono)] text-[12.5px] text-forest">{missing}</span>.</>
        )}
      </p>
      <div className="flex items-center gap-0 bg-[#0E1F18] border border-forest/20 rounded-xl overflow-hidden">
        <span className="font-[family-name:var(--font-mono)] text-sage px-4 text-[11px]">$</span>
        <code className="flex-1 py-3 font-[family-name:var(--font-mono)] text-[13px] text-parchment whitespace-nowrap overflow-x-auto">
          {cmd}
        </code>
        <button
          onClick={handleCopy}
          className="px-4 h-full py-3 text-parchment/70 hover:text-parchment border-l border-white/10 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase"
          title="Copy command"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <p className="mt-4 font-[family-name:var(--font-body)] text-[13px] text-forest/55 leading-[1.7]">
        Runs from the project root. The first pass downloads the encoder and takes a few minutes; subsequent runs are incremental.
      </p>
    </div>
  )
}

// ─── Masthead ──────────────────────────────────────────────────────────────
function Masthead({ papers, clusters }: { papers: number; clusters: number }) {
  return (
    <header className="relative border-b border-forest/12 overflow-hidden bg-cream">
      <div className="absolute inset-0 pointer-events-none -z-0">
        <div className="absolute -top-20 right-[8%] w-[420px] h-[420px] rounded-full bg-sage/20 blur-3xl" />
        <div className="absolute top-12 right-[42%] w-[260px] h-[260px] rounded-full bg-bau-yellow/10 blur-3xl" />
        <div className="absolute -bottom-10 left-[8%] w-[300px] h-[300px] rounded-full bg-sage-deep/12 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-8 pt-16 pb-12">
        <div className="flex items-baseline gap-4 mb-4">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">
            volume I · no. 04
          </span>
          <div className="flex-1 h-px bg-forest/15" />
          <span className="font-[family-name:var(--font-display)] text-[16px] text-forest/55">anno MMXXVI</span>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-forest leading-[0.94] font-light">
          <span className="block text-[72px] md:text-[112px]">the corpus<span className="text-sage-deep">.</span></span>
          <span className="block text-[20px] md:text-[26px] text-forest/60 mt-3 max-w-[60ch]">
            — a topographical index of current literature, settled into a quiet shelf.
          </span>
        </h1>

        <div className="mt-9 flex items-baseline gap-6 flex-wrap">
          <p className="font-[family-name:var(--font-body)] text-[15px] leading-[1.8] text-forest/75 max-w-[58ch]">
            Pose a question in natural language. We search{' '}
            <span className="text-forest font-medium tabular-nums">{papers.toLocaleString()}</span> curated arXiv preprints
            across <span className="text-forest font-medium tabular-nums">{clusters}</span> topic constellations and return
            synthesised answers — every claim pinned to the passage that taught it.
          </p>
          <div className="ml-auto shrink-0">
            <Link
              to="/editor/scratch"
              className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-forest text-parchment hover:bg-forest-ink transition-colors font-[family-name:var(--font-body)] text-[14px]"
            >
              begin a manuscript
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

// ─── Cluster legend (replaces the scatter map) ────────────────────────────
function ClusterLegend({
  clusters, active, onPick,
}: {
  clusters: Cluster[]
  active: Set<number>
  onPick: (id: number) => void
}) {
  const max = Math.max(1, ...clusters.map(c => c.size))
  const anyActive = active.size > 0
  return (
    <div className="border border-forest/15 rounded-2xl bg-milk overflow-hidden">
      {clusters.length === 0 ? (
        <div className="px-5 py-6 font-[family-name:var(--font-body)] text-[13px] text-forest/55">
          cluster assignments not yet computed.
          <div className="mt-2 font-[family-name:var(--font-mono)] text-[10.5px]">
            run python scripts/compute_topic_graph.py
          </div>
        </div>
      ) : (
        clusters.map(c => {
          const isActive = active.has(c.id)
          const dim = anyActive && !isActive
          const pct = (c.size / max) * 100
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              aria-pressed={isActive}
              className={`w-full text-left px-5 py-3 flex items-center gap-3 border-b border-forest/10 last:border-b-0 hover:bg-sage/10 transition-colors ${
                dim ? 'opacity-50' : ''
              } ${isActive ? 'bg-sage/15' : ''}`}
            >
              <span
                className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center border transition-colors ${
                  isActive ? 'border-forest/40' : 'border-forest/15'
                }`}
                style={{ background: isActive ? c.color : 'transparent' }}
              >
                {!isActive && (
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                )}
                {isActive && (
                  <svg className="w-2.5 h-2.5 text-parchment" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-[family-name:var(--font-body)] text-[13.5px] text-forest leading-snug truncate">
                  {c.label}
                </div>
                <div className="mt-1 h-[3px] rounded-full bg-forest/10 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: c.color, opacity: 0.7 }} />
                </div>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tabular-nums shrink-0">
                {c.size}
              </span>
            </button>
          )
        })
      )}
    </div>
  )
}

// ─── Inline citation markers inside the synthesised answer ─────────────────
function renderAnswerWithCitations(text: string) {
  const parts = text.split(/(\[\d+\])/)
  return parts.map((p, i) => {
    const m = p.match(/\[(\d+)\]/)
    if (m) return (
      <sup
        key={i}
        className="inline-flex items-baseline font-[family-name:var(--font-mono)] text-[10px] text-forest bg-sage/30 border border-sage-deep/40 rounded-full px-1.5 py-[1px] mx-[2px] align-super"
      >
        {m[1]}
      </sup>
    )
    return <span key={i}>{p}</span>
  })
}

// ─── Catalogue row ─────────────────────────────────────────────────────────
function CatalogueCard({
  rank, paper, similarity, clusterId, clusterLabel, query, isSelected, onSelect,
}: {
  rank: number
  paper: Paper
  similarity: number | null
  clusterId: number | undefined
  clusterLabel: string
  query: string
  isSelected: boolean
  onSelect: () => void
}) {
  const color = clusterColor(clusterId ?? -1)
  const hasQuery = query.trim().length > 0
  const { has, toggle } = useLibrary()
  const saved = has(paper.paper_id)

  return (
    <li
      onClick={onSelect}
      className={`relative bg-milk border border-forest/15 rounded-2xl pl-7 pr-6 py-5 cursor-pointer transition-all duration-200 group ${
        isSelected
          ? 'shadow-[0_18px_36px_-18px_rgba(38,70,53,0.28)] -translate-y-0.5'
          : 'hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(38,70,53,0.22)]'
      }`}
    >
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
        {hasQuery && similarity !== null && (
          <span className="ml-auto flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] text-forest/55">
            <span>cos ≈</span>
            <span className="text-forest font-medium tabular-nums">{similarity.toFixed(3)}</span>
            <SimilarityBar value={similarity} color={color} />
          </span>
        )}
      </div>

      <h4 className="font-[family-name:var(--font-display)] text-[22px] text-forest leading-[1.22] mb-1.5 tracking-[-0.005em]">
        {hasQuery ? highlightQuery(paper.title, query) : paper.title}
      </h4>

      {paper.authors.length > 0 && (
        <div className="font-[family-name:var(--font-mono)] text-[11px] text-forest/55 mb-3 tracking-tight line-clamp-1">
          {paper.authors.join(' · ')}
        </div>
      )}

      {paper.abstract && (
        <p className="font-[family-name:var(--font-body)] text-[14px] text-forest/75 leading-[1.75] line-clamp-3">
          {hasQuery ? highlightQuery(paper.abstract, query) : paper.abstract}
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-forest/12 flex items-center gap-5 font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tracking-wider">
        <button
          onClick={e => { e.stopPropagation(); toggle(paper.paper_id) }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${
            saved
              ? 'bg-sage/25 border-sage-deep/50 text-forest'
              : 'bg-milk border-forest/20 text-forest/65 hover:text-forest hover:border-forest/40 hover:bg-sage/10'
          }`}
          title={saved ? 'remove from library' : 'save to library'}
        >
          <svg className="w-3 h-3" fill={saved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5v14l7-5 7 5V5a2 2 0 00-2-2H7a2 2 0 00-2 2z" />
          </svg>
          <span>{saved ? 'saved' : 'save'}</span>
        </button>
        <a
          href={paper.url || `https://arxiv.org/abs/${paper.paper_id}`}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 hover:text-forest transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span>arXiv</span>
        </a>
        <span className="ml-auto font-[family-name:var(--font-body)] text-[14px] text-forest/65 group-hover:text-forest transition-colors">
          open it ↗
        </span>
      </div>
    </li>
  )
}

// ─── Pagination — minimal prev/next with a windowed page cluster ───────────
// Keeps the catalogue navigable when the full corpus runs into the hundreds.
function Pagination({
  page, pageCount, onPick,
}: {
  page: number
  pageCount: number
  onPick: (p: number) => void
}) {
  // Windowed page numbers: always show first, last, the active page and its
  // neighbours. Collapsed gaps become "…".
  const pages = useMemo(() => {
    const set = new Set<number>([0, pageCount - 1, page, page - 1, page + 1])
    const raw = [...set].filter(p => p >= 0 && p < pageCount).sort((a, b) => a - b)
    const out: Array<number | 'gap'> = []
    for (let i = 0; i < raw.length; i++) {
      if (i > 0 && raw[i] - raw[i - 1] > 1) out.push('gap')
      out.push(raw[i])
    }
    return out
  }, [page, pageCount])

  const btn = 'h-9 min-w-9 px-3 rounded-full border font-[family-name:var(--font-body)] text-[13px] tabular-nums transition-colors'

  return (
    <nav className="mt-10 flex items-center justify-center gap-2 flex-wrap">
      <button
        disabled={page === 0}
        onClick={() => onPick(page - 1)}
        className={`${btn} ${page === 0
          ? 'border-forest/10 text-forest/30 cursor-not-allowed bg-milk'
          : 'border-forest/15 text-forest/70 hover:text-forest hover:border-forest/35 bg-milk'}`}
      >
        ← prev
      </button>

      {pages.map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 font-[family-name:var(--font-mono)] text-[12px] text-forest/40">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPick(p)}
            className={`${btn} ${p === page
              ? 'bg-forest text-parchment border-forest'
              : 'border-forest/15 text-forest/65 hover:text-forest hover:border-forest/35 bg-milk'}`}
          >
            {p + 1}
          </button>
        )
      )}

      <button
        disabled={page >= pageCount - 1}
        onClick={() => onPick(page + 1)}
        className={`${btn} ${page >= pageCount - 1
          ? 'border-forest/10 text-forest/30 cursor-not-allowed bg-milk'
          : 'border-forest/15 text-forest/70 hover:text-forest hover:border-forest/35 bg-milk'}`}
      >
        next →
      </button>
    </nav>
  )
}

function SimilarityBar({ value, color }: { value: number; color: string }) {
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <span className="relative inline-block w-20 h-[4px] rounded-full bg-forest/10 overflow-hidden">
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamped * 100}%`, background: color }} />
    </span>
  )
}

function highlightQuery(text: string, query: string) {
  const toks = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  if (toks.length === 0) return text
  const re = new RegExp(`(${toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((p, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-sage/30 text-forest px-0.5 rounded-sm">{p}</mark>
      : p
  )
}

// ─── Detail drawer ─────────────────────────────────────────────────────────
function DetailDrawer({
  paperId, summary, clusterId, clusterLabel, onClose,
}: {
  paperId: string
  summary: Paper
  clusterId: number | undefined
  clusterLabel: string
  onClose: () => void
}) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const color = clusterColor(clusterId ?? -1)
  const { has, toggle } = useLibrary()
  const saved = has(paperId)

  const [detail, setDetail] = useState<PaperDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState<string | null>(null)

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
  const sections = detail?.sections ?? []
  const figures = detail?.figures ?? []

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
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
            onClick={() => toggle(paperId)}
            className={`h-9 px-3 rounded-full flex items-center gap-2 font-[family-name:var(--font-body)] text-[12.5px] border transition-colors ${
              saved
                ? 'bg-sage/25 border-sage-deep/50 text-forest'
                : 'bg-milk border-forest/20 text-forest/70 hover:text-forest hover:bg-sage/10 hover:border-forest/40'
            }`}
            title={saved ? 'remove from library' : 'save to library'}
          >
            <svg className="w-3.5 h-3.5" fill={saved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5v14l7-5 7 5V5a2 2 0 00-2-2H7a2 2 0 00-2 2z" />
            </svg>
            {saved ? 'in library' : 'save'}
          </button>
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
          {paper.authors.length > 0 && (
            <div className="font-[family-name:var(--font-mono)] text-[12px] text-forest/65 mb-2">
              {paper.authors.join(' · ')}
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

          {/* Abstract */}
          {paper.abstract && (
            <div className="mb-8 bg-parchment/40 border border-forest/10 rounded-2xl pl-5 pr-5 pt-4 pb-5 relative">
              <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-sage-deep/55" />
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-2">abstract</div>
              <p className="font-[family-name:var(--font-body)] text-[14.5px] text-forest/85 leading-[1.85] whitespace-pre-wrap">
                {paper.abstract}
              </p>
            </div>
          )}

          {/* Detail load states */}
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

          {/* Sections */}
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

          {/* Figures */}
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
            <Link
              to="/editor/scratch"
              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 h-11 rounded-full bg-forest text-parchment hover:bg-forest-ink transition-colors font-[family-name:var(--font-body)] text-[14px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              cite in manuscript
            </Link>
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
