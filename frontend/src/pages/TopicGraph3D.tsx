import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import { useClusterLabels, type ClusterInfo } from '../hooks/useClusterLabels'
import { useAmbientDrift } from '../hooks/useAmbientDrift'

// ─── Types from the backend ─────────────────────────────────────────────────
interface GraphNode {
  paper_id: string
  title: string
  cluster: number
  // UMAP-precomputed 3D coordinates (added by scripts/compute_topic_graph.py).
  // Optional for back-compat with older topic_graph.json.
  x?: number
  y?: number
  z?: number
}

interface GraphEdge {
  source: number
  target: number
  weight: number
}

interface TopicGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: ClusterInfo[]
  meta?: Record<string, unknown>
}

interface QueryNeighbor {
  paper_id: string
  similarity: number
}

interface QueryProjection {
  query: string
  neighbors: QueryNeighbor[]
  top_cluster: number | null
}

interface PaperDetail {
  paper_id: string
  title: string
  authors: string[]
  abstract: string
  date: string
  url: string
  sections: Array<{ heading: string; text: string }>
  figures: Array<{ caption: string; image_path: string }>
}

// Runtime node shape after we enrich with rendering metadata.
type VizNode = GraphNode & {
  id: string          // react-force-graph requires string/number id
  color: string
  isQuery?: boolean
  queryScore?: number // for the virtual query node neighbors
}

type VizLink = {
  source: string      // paper_id (or '__query__')
  target: string
  weight: number
  isQueryEdge?: boolean
}

// ─── Config ─────────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const QUERY_NODE_ID = '__query__'
const QUERY_DEBOUNCE_MS = 350
const QUERY_NEIGHBORS = 8

// Query node is rendered sage-green so it pops against cluster hues.
const QUERY_COLOR = '#a3d977'

function clusterColor(id: number, total: number): string {
  if (id < 0) return QUERY_COLOR
  const hue = Math.round((id * 360) / Math.max(total, 1))
  return `hsl(${hue} 70% 55%)`
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function TopicGraph3D() {
  const [data, setData] = useState<TopicGraph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<VizNode | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<PaperDetail | null>(null)
  const [hovered, setHovered] = useState<VizNode | null>(null)
  // Multi-select: when the set is empty, the whole field is visible. Adding a
  // cluster isolates it alongside any already-isolated ones, so users can pull
  // several constellations into the same view.
  const [isolatedClusters, setIsolatedClusters] = useState<Set<number>>(new Set())
  const isolationActive = isolatedClusters.size > 0
  const toggleIsolateCluster = useCallback((id: number) => {
    setIsolatedClusters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [projection, setProjection] = useState<QueryProjection | null>(null)
  const [projectionLoading, setProjectionLoading] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)
  const [size, setSize] = useState({ w: 800, h: 600 })

  // ── Fetch topic map on mount ──
  useEffect(() => {
    fetch(`${API_BASE}/api/topic-map`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
        return r.json()
      })
      .then(setData)
      .catch(e => setError(String(e)))
  }, [])

  // ── Track container size ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [data])

  // ── Debounce the query before hitting the backend ──
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query.trim()), QUERY_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [query])

  // ── Project query into the corpus ──
  useEffect(() => {
    if (!debouncedQuery) {
      setProjection(null)
      return
    }
    const controller = new AbortController()
    setProjectionLoading(true)
    const url = `${API_BASE}/api/query-projection?q=${encodeURIComponent(debouncedQuery)}&k=${QUERY_NEIGHBORS}`
    fetch(url, { signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
        return r.json() as Promise<QueryProjection>
      })
      .then(p => {
        setProjection(p)
        setProjectionLoading(false)
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setProjection(null)
          setProjectionLoading(false)
        }
      })
    return () => controller.abort()
  }, [debouncedQuery])

  const { labels, setLabel, resetLabel, hasOverride } = useClusterLabels(data?.clusters)

  // ── Build the graph data consumed by ForceGraph3D ──
  // Injects the virtual query node + its edges when projection is available.
  //
  // UMAP gives coordinates with span ~7–8 units. Node spheres render at
  // radius ≈ nodeRelSize·√nodeVal ≈ 5 units, so at native scale every node
  // overlaps every other node. Multiply by COORD_SCALE so the layout extent
  // matches what nodeRelSize expects (and so the ambient-drift amplitude,
  // 0.5% of span, becomes a visible fraction of a node radius).
  const COORD_SCALE = 100
  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as VizNode[], links: [] as VizLink[] }

    const nodes: VizNode[] = data.nodes.map(n => ({
      ...n,
      id: n.paper_id,
      color: clusterColor(n.cluster, data.clusters.length),
      x: n.x !== undefined ? n.x * COORD_SCALE : undefined,
      y: n.y !== undefined ? n.y * COORD_SCALE : undefined,
      z: n.z !== undefined ? n.z * COORD_SCALE : undefined,
    }))

    const links: VizLink[] = data.edges
      .map(e => {
        const src = data.nodes[e.source]?.paper_id
        const tgt = data.nodes[e.target]?.paper_id
        if (!src || !tgt) return null
        return { source: src, target: tgt, weight: e.weight }
      })
      .filter((l): l is VizLink => l !== null)

    if (projection && projection.neighbors.length > 0) {
      nodes.push({
        paper_id: QUERY_NODE_ID,
        id: QUERY_NODE_ID,
        title: projection.query,
        cluster: -1,
        color: QUERY_COLOR,
        isQuery: true,
      })
      for (const nb of projection.neighbors) {
        links.push({
          source: QUERY_NODE_ID,
          target: nb.paper_id,
          weight: nb.similarity,
          isQueryEdge: true,
        })
      }
    }

    return { nodes, links }
  }, [data, projection])

  // ── Ambient sine-wave drift on top of UMAP positions ─────────────────────
  // O(N) per frame, ~0.5% bbox amplitude, ~6s period. Safe at 10k nodes.
  useAmbientDrift(fgRef as React.MutableRefObject<ForceGraphMethods | undefined>, graphData)

  // ── Adjacency map for fast hover highlighting ──
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of graphData.links) {
      if (!map.has(l.source)) map.set(l.source, new Set())
      if (!map.has(l.target)) map.set(l.target, new Set())
      map.get(l.source)!.add(l.target)
      map.get(l.target)!.add(l.source)
    }
    return map
  }, [graphData.links])

  // ── Click handler: fetch full paper detail for the drawer ──
  const handleNodeClick = useCallback((n: object) => {
    const node = n as VizNode
    setSelected(node)
    if (node.isQuery || !node.paper_id || node.paper_id === QUERY_NODE_ID) {
      setSelectedDetail(null)
      return
    }
    setSelectedDetail(null)
    fetch(`${API_BASE}/api/papers/${encodeURIComponent(node.paper_id)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<PaperDetail>
      })
      .then(setSelectedDetail)
      .catch(() => setSelectedDetail(null))
  }, [])

  // ── Focus the camera on the query node when it first appears ──
  useEffect(() => {
    if (!projection || !fgRef.current) return
    const fg = fgRef.current
    const timeout = setTimeout(() => {
      const nodeObj = (fg as any).graphData()?.nodes.find(
        (n: VizNode) => n.id === QUERY_NODE_ID,
      )
      if (nodeObj && typeof nodeObj.x === 'number') {
        const distance = 180
        const dist = Math.hypot(nodeObj.x, nodeObj.y, nodeObj.z) || 1
        fg.cameraPosition(
          {
            x: (nodeObj.x * (dist + distance)) / dist,
            y: (nodeObj.y * (dist + distance)) / dist,
            z: (nodeObj.z * (dist + distance)) / dist,
          },
          nodeObj,
          1200,
        )
      }
    }, 900) // wait for the simulation to settle the new node
    return () => clearTimeout(timeout)
  }, [projection])

  // ── Guards ──
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-neutral-900 text-neutral-100">
        <div className="max-w-lg text-center">
          <h1 className="text-xl font-semibold mb-3">Topic graph unavailable</h1>
          <p className="text-sm opacity-70 mb-4">{error}</p>
          <code className="block bg-black/40 rounded px-3 py-2 text-xs">
            python scripts/compute_topic_graph.py
          </code>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100">
        <div className="text-sm opacity-60">Loading topic graph…</div>
      </div>
    )
  }

  const neighborsOfHovered = hovered ? adjacency.get(hovered.id) : null

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-neutral-900 text-neutral-100">
      {/* ── Graph viewport ──────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 relative min-h-[60vh]">
        {/* Search bar overlay (top) */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-3 pointer-events-none">
          <div className="flex-1 max-w-2xl pointer-events-auto">
            <div className="flex items-center bg-neutral-950/80 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-lg">
              <div className="pl-3 pr-2 opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="M21 21l-4.5-4.5" />
                </svg>
              </div>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ask a question — a query point will appear in the graph"
                className="flex-1 h-11 bg-transparent text-sm placeholder-white/35 focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setProjection(null) }}
                  className="px-3 text-xs opacity-50 hover:opacity-100"
                  title="Clear"
                >
                  ✕
                </button>
              )}
              {projectionLoading && (
                <div className="pr-3">
                  <svg className="w-4 h-4 animate-spin opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
                  </svg>
                </div>
              )}
            </div>
            {projection && (
              <div className="mt-2 text-[11px] opacity-60 flex items-center gap-3 pointer-events-auto">
                <span>
                  query sits near{' '}
                  <span className="opacity-90">{projection.neighbors.length}</span> papers
                </span>
                {projection.top_cluster != null && (
                  <span>
                    · closest to{' '}
                    <span style={{ color: clusterColor(projection.top_cluster, data.clusters.length) }}>
                      {labels[projection.top_cluster] ?? `cluster ${projection.top_cluster}`}
                    </span>
                  </span>
                )}
                <span className="ml-auto opacity-50">drag a paper · scroll to zoom · right-click to pan</span>
              </div>
            )}
          </div>
        </div>

        <ForceGraph3D
          ref={fgRef as any}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#0b0f14"
          // ── Node appearance ──
          nodeRelSize={4}
          nodeVal={(n: object) => {
            const nn = n as VizNode
            if (nn.isQuery) return 12
            if (selected && nn.id === selected.id) return 4
            if (hovered && nn.id === hovered.id) return 3
            return 1.5
          }}
          nodeColor={(n: object) => {
            const nn = n as VizNode
            const color = nn.color
            if (!isolationActive) return color
            if (nn.isQuery) return color
            return isolatedClusters.has(nn.cluster) ? color : '#2a2f36'
          }}
          nodeOpacity={0.92}
          nodeLabel={(n: object) => {
            const nn = n as VizNode
            if (nn.isQuery) return `your query — “${nn.title}”`
            const label = labels[nn.cluster] ?? `Cluster ${nn.cluster}`
            return `${nn.title}\n— ${label}`
          }}
          // ── Link appearance ──
          linkColor={(l: object) => {
            const ll = l as VizLink
            if (ll.isQueryEdge) return QUERY_COLOR
            // Brighten links adjacent to the hovered node.
            if (hovered) {
              const s = typeof ll.source === 'object' ? (ll.source as VizNode).id : ll.source
              const t = typeof ll.target === 'object' ? (ll.target as VizNode).id : ll.target
              if (s === hovered.id || t === hovered.id) return '#ffffff'
            }
            return '#8ea7c4'
          }}
          linkOpacity={0.22}
          linkWidth={(l: object) => {
            const ll = l as VizLink
            if (ll.isQueryEdge) return 1.6
            if (hovered) {
              const s = typeof ll.source === 'object' ? (ll.source as VizNode).id : ll.source
              const t = typeof ll.target === 'object' ? (ll.target as VizNode).id : ll.target
              if (s === hovered.id || t === hovered.id) return 1.2
            }
            return Math.max(0.25, (ll.weight ?? 0) * 0.8)
          }}
          linkDirectionalParticles={(l: object) =>
            (l as VizLink).isQueryEdge ? 2 : 0
          }
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.6}
          // ── Layout: UMAP-precomputed positions, no client-side simulation.
          //    Ambient sine drift via useAmbientDrift below gives the "living" feel.
          cooldownTicks={0}
          warmupTicks={0}
          // ── Interaction ──
          enableNodeDrag={false}
          onNodeClick={handleNodeClick}
          onNodeHover={(n: object | null) => setHovered(n as VizNode | null)}
          onBackgroundClick={() => { setSelected(null); setSelectedDetail(null) }}
          // Dim non-isolated nodes via opacity filter when any cluster is pinned.
          nodeVisibility={(n: object) => {
            const nn = n as VizNode
            if (!isolationActive) return true
            return nn.isQuery || isolatedClusters.has(nn.cluster)
          }}
          linkVisibility={(l: object) => {
            if (!isolationActive) return true
            const ll = l as VizLink
            if (ll.isQueryEdge) return true
            // Resolve endpoint ids whether force-graph has mutated them or not
            const s = typeof ll.source === 'object' ? (ll.source as VizNode).id : ll.source
            const t = typeof ll.target === 'object' ? (ll.target as VizNode).id : ll.target
            const srcNode = graphData.nodes.find(n => n.id === s)
            const tgtNode = graphData.nodes.find(n => n.id === t)
            return (
              srcNode != null && tgtNode != null &&
              isolatedClusters.has(srcNode.cluster) &&
              isolatedClusters.has(tgtNode.cluster)
            )
          }}
        />

        {/* Neighbor-count hint when hovering */}
        {hovered && !hovered.isQuery && neighborsOfHovered && (
          <div className="absolute top-24 right-6 bg-neutral-950/80 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-[11px] opacity-80 pointer-events-none">
            {neighborsOfHovered.size} neighbor{neighborsOfHovered.size === 1 ? '' : 's'}
          </div>
        )}

        {/* Drawer with paper detail */}
        {selected && !selected.isQuery && (
          <PaperDrawer
            node={selected}
            detail={selectedDetail}
            clusterLabel={labels[selected.cluster] ?? `Cluster ${selected.cluster}`}
            clusterColor={clusterColor(selected.cluster, data.clusters.length)}
            onClose={() => { setSelected(null); setSelectedDetail(null) }}
          />
        )}
      </div>

      {/* ── Sidebar: cluster legend with filter + rename ──────────── */}
      <aside className="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-white/10 bg-neutral-950 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] tracking-widest uppercase opacity-60">
            clusters
            {isolationActive && (
              <span className="ml-2 opacity-70 tabular-nums">· {isolatedClusters.size} pinned</span>
            )}
          </div>
          {isolationActive && (
            <button
              onClick={() => setIsolatedClusters(new Set())}
              className="text-[10px] tracking-wider uppercase opacity-60 hover:opacity-100 underline"
            >
              show all
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {data.clusters.map(c => (
            <LegendRow
              key={c.id}
              cluster={c}
              label={labels[c.id] ?? c.label}
              isOverride={hasOverride(c.id)}
              color={clusterColor(c.id, data.clusters.length)}
              isIsolated={isolatedClusters.has(c.id)}
              isDimmed={isolationActive && !isolatedClusters.has(c.id)}
              onEditSave={v => setLabel(c.id, v)}
              onResetLabel={() => resetLabel(c.id)}
              onToggleIsolate={() => toggleIsolateCluster(c.id)}
            />
          ))}
        </ul>
        <div className="mt-6 text-[11px] opacity-55 leading-relaxed">
          Click a row to pin that cluster; click more to layer constellations
          together. Double-click a label to rename — edits save to this
          browser only.
        </div>
        {data.meta && (
          <div className="mt-6 text-[10px] opacity-40 font-mono leading-relaxed">
            k={String(data.meta.k ?? '?')} · k_nn={String(data.meta.k_neighbors ?? '?')} · seed={String(data.meta.seed ?? '?')}
          </div>
        )}
      </aside>
    </div>
  )
}

// ─── Legend row ─────────────────────────────────────────────────────────────
function LegendRow({
  cluster, label, isOverride, color, isIsolated, isDimmed,
  onEditSave, onResetLabel, onToggleIsolate,
}: {
  cluster: ClusterInfo
  label: string
  isOverride: boolean
  color: string
  isIsolated: boolean
  isDimmed: boolean
  onEditSave: (v: string) => void
  onResetLabel: () => void
  onToggleIsolate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)

  const commit = () => {
    onEditSave(draft)
    setEditing(false)
  }

  return (
    <li
      onClick={editing ? undefined : onToggleIsolate}
      className={`group flex items-start gap-2 text-sm px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        isIsolated
          ? 'bg-white/10'
          : isDimmed
            ? 'opacity-45 hover:opacity-70'
            : 'hover:bg-white/5'
      }`}
    >
      <span
        className="w-3 h-3 rounded-full mt-1.5 shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setDraft(label); setEditing(false) }
            }}
            className="w-full border border-white/20 rounded px-2 py-0.5 text-sm bg-neutral-900 text-neutral-100 focus:outline-none focus:border-white/40"
          />
        ) : (
          <div
            onDoubleClick={e => {
              e.stopPropagation()
              setDraft(label); setEditing(true)
            }}
            className="truncate"
            title={label}
          >
            {label}
          </div>
        )}
        <div className="text-[10px] opacity-55 flex gap-2 mt-0.5">
          <span>{cluster.size} papers</span>
          {isIsolated && <span className="opacity-70">· isolated</span>}
          {isOverride && (
            <button
              onClick={e => { e.stopPropagation(); onResetLabel() }}
              className="opacity-70 hover:opacity-100 underline"
            >
              reset
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

// ─── Paper detail drawer ────────────────────────────────────────────────────
function PaperDrawer({
  node, detail, clusterLabel, clusterColor, onClose,
}: {
  node: VizNode
  detail: PaperDetail | null
  clusterLabel: string
  clusterColor: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute top-0 right-0 bottom-0 w-full md:w-[30rem] bg-neutral-950/95 backdrop-blur border-l border-white/10 shadow-2xl overflow-y-auto z-20">
      <div className="sticky top-0 bg-neutral-950/95 backdrop-blur border-b border-white/10 px-5 py-3 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: clusterColor }} />
        <span className="text-[10px] tracking-widest uppercase opacity-60">
          arxiv:{node.paper_id}
        </span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-white/5"
          title="Close (esc)"
        >
          ✕
        </button>
      </div>

      <div className="px-5 py-5">
        <h2 className="text-lg font-semibold leading-snug mb-2">{node.title}</h2>
        <div className="text-[11px] opacity-60 mb-4">
          <span style={{ color: clusterColor }}>{clusterLabel}</span>
        </div>

        {detail === null ? (
          <div className="text-sm opacity-60">Loading paper detail…</div>
        ) : (
          <>
            {detail.authors.length > 0 && (
              <div className="text-[12px] opacity-75 mb-4">
                {detail.authors.join(' · ')}
              </div>
            )}

            <div className="mb-5">
              <div className="text-[10px] tracking-widest uppercase opacity-55 mb-1.5">abstract</div>
              <p className="text-[13.5px] leading-relaxed opacity-90">
                {detail.abstract}
              </p>
            </div>

            {detail.sections.length > 0 && (
              <div className="mb-5">
                <div className="text-[10px] tracking-widest uppercase opacity-55 mb-2">
                  sections · {detail.sections.length}
                </div>
                <ul className="space-y-1 text-[12.5px]">
                  {detail.sections.slice(0, 12).map((s, i) => (
                    <li key={i} className="flex gap-2 opacity-85">
                      <span className="opacity-50 tabular-nums text-[11px] mt-0.5 w-5 shrink-0">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                      <span className="truncate">{s.heading}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.figures.length > 0 && (
              <div className="mb-5">
                <div className="text-[10px] tracking-widest uppercase opacity-55 mb-2">
                  figures · {detail.figures.length}
                </div>
                <ul className="space-y-1.5 text-[12px] opacity-85">
                  {detail.figures.slice(0, 4).map((f, i) => (
                    <li key={i} className="leading-snug">
                      <span className="opacity-55 mr-1">fig {i + 1}.</span>
                      {f.caption.slice(0, 180)}{f.caption.length > 180 ? '…' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.url && (
              <a
                href={detail.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] bg-white/8 hover:bg-white/15 rounded-md px-3 py-1.5 transition-colors"
              >
                open on arXiv ↗
              </a>
            )}
          </>
        )}
      </div>
    </div>
  )
}
