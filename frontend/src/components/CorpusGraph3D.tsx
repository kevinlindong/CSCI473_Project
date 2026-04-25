import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import { useAmbientDrift } from '../hooks/useAmbientDrift'

/* ==========================================================================
   CorpusGraph3D — themed botanical 3D topic graph for the corpus page.
   Palette matches the site (cream canvas, forest ink, sage query marker).
   Takes nodes+edges already resolved to paper_id strings, plus the active
   cluster filter and projection neighbours from the parent page.
   ========================================================================== */

// ─── Types ──────────────────────────────────────────────────────────────────
export interface CorpusGraphNode {
  paper_id: string
  title: string
  cluster: number
  // UMAP-precomputed 3D coordinates (added by scripts/compute_topic_graph.py).
  // Optional for back-compat with older topic_graph.json.
  x?: number
  y?: number
  z?: number
}

export interface CorpusGraphEdge {
  source: number
  target: number
  weight: number
}

export interface CorpusCluster {
  id: number
  label: string
  size: number
}

export interface CorpusGraphNeighbor {
  paper_id: string
  similarity: number
}

// Internal runtime shape for the force graph.
type VizNode = CorpusGraphNode & {
  id: string
  color: string
  isQuery?: boolean
}

type VizLink = {
  source: string
  target: string
  weight: number
  isQueryEdge?: boolean
}

// ─── Theme tokens ───────────────────────────────────────────────────────────
const BG_COLOR = '#ede5cf'          // deeper cream — gives the graph quiet contrast
const EDGE_COLOR = '#264635'        // forest
const EDGE_HOVER = '#1a2f26'        // forest-ink
const QUERY_COLOR = '#7F9267'       // sage-deep
const QUERY_GLOW = '#A3B18A'        // sage
const DIM_NODE = '#c4bda8'          // muted parchment for cluster-isolate dim
const QUERY_NODE_ID = '__query__'

// ─── Component ──────────────────────────────────────────────────────────────
export default function CorpusGraph3D({
  nodes,
  edges,
  activeClusters,
  selectedPaperId,
  queryText,
  queryNeighbors,
  clusterColor,
  clusterLabel,
  onSelectPaper,
  height = 440,
}: {
  nodes: CorpusGraphNode[]
  edges: CorpusGraphEdge[]
  clusters: CorpusCluster[]
  activeClusters: Set<number>
  selectedPaperId: string | null
  queryText: string
  queryNeighbors: CorpusGraphNeighbor[] | null
  clusterColor: (id: number) => string
  clusterLabel: (id: number) => string
  onSelectPaper: (paperId: string) => void
  height?: number
}) {
  const isolationActive = activeClusters.size > 0
  const soloCluster = activeClusters.size === 1
    ? (activeClusters.values().next().value as number)
    : null
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)
  const [size, setSize] = useState({ w: 800, h: height })
  const [hovered, setHovered] = useState<VizNode | null>(null)

  // ── Track container size ─────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // ── Build graph data ─────────────────────────────────────────────────────
  // UMAP coords land in a ~7–8 unit span; node spheres render at radius ~5,
  // so without scaling every node overlaps every other. Multiply by
  // COORD_SCALE to match the extent d3-force-3d would produce naturally for
  // 10k nodes (~hundreds of units), and so ambient-drift amplitude (0.5% of
  // span) becomes a visible fraction of a node radius.
  const COORD_SCALE = 100
  const graphData = useMemo(() => {
    const vizNodes: VizNode[] = nodes.map(n => ({
      ...n,
      id: n.paper_id,
      color: clusterColor(n.cluster),
      x: n.x !== undefined ? n.x * COORD_SCALE : undefined,
      y: n.y !== undefined ? n.y * COORD_SCALE : undefined,
      z: n.z !== undefined ? n.z * COORD_SCALE : undefined,
    }))

    const vizLinks: VizLink[] = edges
      .map(e => {
        const src = nodes[e.source]?.paper_id
        const tgt = nodes[e.target]?.paper_id
        if (!src || !tgt) return null
        return { source: src, target: tgt, weight: e.weight }
      })
      .filter((l): l is VizLink => l !== null)

    const hasQuery = queryText.trim().length > 0 && queryNeighbors && queryNeighbors.length > 0
    if (hasQuery) {
      vizNodes.push({
        paper_id: QUERY_NODE_ID,
        id: QUERY_NODE_ID,
        title: queryText,
        cluster: -1,
        color: QUERY_COLOR,
        isQuery: true,
      })
      for (const nb of queryNeighbors!) {
        vizLinks.push({
          source: QUERY_NODE_ID,
          target: nb.paper_id,
          weight: nb.similarity,
          isQueryEdge: true,
        })
      }
    }

    return { nodes: vizNodes, links: vizLinks }
  }, [nodes, edges, queryText, queryNeighbors, clusterColor])

  // ── Ambient sine-wave drift over UMAP positions (no client-side sim) ─────
  useAmbientDrift(fgRef as React.MutableRefObject<ForceGraphMethods | undefined>, graphData)

  // ── Adjacency for hover highlights ──────────────────────────────────────
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const l of graphData.links) {
      if (!m.has(l.source)) m.set(l.source, new Set())
      if (!m.has(l.target)) m.set(l.target, new Set())
      m.get(l.source)!.add(l.target)
      m.get(l.target)!.add(l.source)
    }
    return m
  }, [graphData.links])

  // ── Focus the camera on the query node when it first appears ───────────
  useEffect(() => {
    if (!queryNeighbors || queryNeighbors.length === 0 || !fgRef.current) return
    const fg = fgRef.current
    const t = setTimeout(() => {
      const nodeObj = (fg as unknown as { graphData: () => { nodes: Array<VizNode & { x?: number; y?: number; z?: number }> } })
        .graphData()
        ?.nodes.find(n => n.id === QUERY_NODE_ID)
      if (nodeObj && typeof nodeObj.x === 'number') {
        const distance = 180
        const dist = Math.hypot(nodeObj.x, nodeObj.y!, nodeObj.z!) || 1
        fg.cameraPosition(
          {
            x: (nodeObj.x * (dist + distance)) / dist,
            y: (nodeObj.y! * (dist + distance)) / dist,
            z: (nodeObj.z! * (dist + distance)) / dist,
          },
          nodeObj as unknown as { x: number; y: number; z: number },
          1200,
        )
      }
    }, 900)
    return () => clearTimeout(t)
  }, [queryNeighbors])

  // ── Click handler ────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((n: object) => {
    const node = n as VizNode
    if (node.isQuery) return
    onSelectPaper(node.paper_id)
  }, [onSelectPaper])

  const neighborsOfHovered = hovered && !hovered.isQuery ? adjacency.get(hovered.id) : null

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl overflow-hidden border border-forest/15 bg-milk shadow-[0_18px_36px_-22px_rgba(38,70,53,0.20)]"
      style={{ height }}
    >
      {/* Top overlay — query pin badge */}
      {queryNeighbors && queryNeighbors.length > 0 && (
        <div className="absolute top-4 left-4 z-10 pointer-events-none flex items-center gap-2 bg-milk/90 backdrop-blur border border-forest/15 rounded-full px-3.5 py-1.5 shadow-[0_6px_18px_-10px_rgba(38,70,53,0.28)]">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: QUERY_COLOR, boxShadow: `0 0 8px ${QUERY_GLOW}` }}
          />
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-forest/65">
            query pinned · {queryNeighbors.length} neighbours
          </span>
        </div>
      )}

      {/* Top-right — cluster isolate state */}
      {isolationActive && (
        <div className="absolute top-4 right-4 z-10 pointer-events-none flex items-center gap-2 bg-milk/90 backdrop-blur border border-forest/15 rounded-full px-3.5 py-1.5">
          {soloCluster !== null ? (
            <>
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: clusterColor(soloCluster) }}
              />
              <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-forest/65">
                {clusterLabel(soloCluster) || `cluster ${soloCluster}`}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center -space-x-1">
                {[...activeClusters].slice(0, 4).map(id => (
                  <span
                    key={id}
                    className="w-2 h-2 rounded-full ring-1 ring-milk"
                    style={{ background: clusterColor(id) }}
                  />
                ))}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-forest/65 tabular-nums">
                {activeClusters.size} constellations
              </span>
            </>
          )}
        </div>
      )}

      {/* Graph */}
      {graphData.nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.28em] uppercase text-forest/50">
            composing the graph…
          </div>
        </div>
      ) : (
        <ForceGraph3D
          ref={fgRef as unknown as React.MutableRefObject<ForceGraphMethods | undefined>}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor={BG_COLOR}
          showNavInfo={false}
          // ── Node appearance ──
          nodeRelSize={3.6}
          nodeVal={(n: object) => {
            const nn = n as VizNode
            if (nn.isQuery) return 14
            if (selectedPaperId && nn.id === selectedPaperId) return 4.5
            if (hovered && nn.id === hovered.id) return 3.2
            return 1.6
          }}
          nodeColor={(n: object) => {
            const nn = n as VizNode
            if (nn.isQuery) return nn.color
            if (!isolationActive) return nn.color
            return activeClusters.has(nn.cluster) ? nn.color : DIM_NODE
          }}
          nodeOpacity={0.95}
          nodeLabel={(n: object) => {
            const nn = n as VizNode
            if (nn.isQuery) return `your query — "${nn.title}"`
            return `${nn.title}\n— ${clusterLabel(nn.cluster) || `cluster ${nn.cluster}`}`
          }}
          // ── Link appearance ──
          linkColor={(l: object) => {
            const ll = l as VizLink
            if (ll.isQueryEdge) return QUERY_COLOR
            if (hovered) {
              const s = typeof ll.source === 'object' ? (ll.source as VizNode).id : ll.source
              const t = typeof ll.target === 'object' ? (ll.target as VizNode).id : ll.target
              if (s === hovered.id || t === hovered.id) return EDGE_HOVER
            }
            return EDGE_COLOR
          }}
          linkOpacity={0.18}
          linkWidth={(l: object) => {
            const ll = l as VizLink
            if (ll.isQueryEdge) return 1.8
            if (hovered) {
              const s = typeof ll.source === 'object' ? (ll.source as VizNode).id : ll.source
              const t = typeof ll.target === 'object' ? (ll.target as VizNode).id : ll.target
              if (s === hovered.id || t === hovered.id) return 1.1
            }
            return Math.max(0.25, (ll.weight ?? 0) * 0.7)
          }}
          linkDirectionalParticles={(l: object) => ((l as VizLink).isQueryEdge ? 2 : 0)}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleColor={() => QUERY_GLOW}
          // ── Layout: UMAP-precomputed positions, no client-side simulation.
          //    Ambient sine drift via useAmbientDrift gives the "living" feel.
          cooldownTicks={0}
          warmupTicks={0}
          // ── Interaction ──
          enableNodeDrag={false}
          onNodeClick={handleNodeClick}
          onNodeHover={(n: object | null) => setHovered(n as VizNode | null)}
          nodeVisibility={(n: object) => {
            const nn = n as VizNode
            if (!isolationActive) return true
            return nn.isQuery || activeClusters.has(nn.cluster)
          }}
          linkVisibility={(l: object) => {
            if (!isolationActive) return true
            const ll = l as VizLink
            if (ll.isQueryEdge) return true
            const s = typeof ll.source === 'object' ? (ll.source as VizNode).id : ll.source
            const t = typeof ll.target === 'object' ? (ll.target as VizNode).id : ll.target
            const sNode = graphData.nodes.find(nn => nn.id === s)
            const tNode = graphData.nodes.find(nn => nn.id === t)
            return !!sNode && !!tNode
              && activeClusters.has(sNode.cluster)
              && activeClusters.has(tNode.cluster)
          }}
        />
      )}

      {/* Hovered neighbour count */}
      {hovered && neighborsOfHovered && (
        <div className="absolute top-16 right-4 z-10 pointer-events-none bg-milk/90 backdrop-blur border border-forest/15 rounded-lg px-3 py-1.5">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] uppercase text-forest/70 tabular-nums">
            {neighborsOfHovered.size} neighbour{neighborsOfHovered.size === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Bottom hint */}
      <div className="absolute bottom-3 left-4 right-4 z-10 pointer-events-none flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
        <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/45">
          figure · the corpus, in three dimensions
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.2em] uppercase text-forest/45 text-right">
          drag · scroll to zoom · right-click to pan
        </span>
      </div>
    </div>
  )
}
