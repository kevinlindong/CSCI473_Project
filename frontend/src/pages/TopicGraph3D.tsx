import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import { useClusterLabels, type ClusterInfo } from '../hooks/useClusterLabels'

interface GraphNode {
  paper_id: string
  title: string
  cluster: number
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

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

function clusterColor(id: number, total: number): string {
  const hue = Math.round((id * 360) / Math.max(total, 1))
  return `hsl(${hue} 70% 55%)`
}

export default function TopicGraph3D() {
  const [data, setData] = useState<TopicGraph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    fetch(`${API_BASE}/api/topic-map`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
        return r.json()
      })
      .then(setData)
      .catch(e => setError(String(e)))
  }, [])

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

  const { labels, setLabel, resetLabel, hasOverride } = useClusterLabels(data?.clusters)

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] }
    const nodes = data.nodes.map(n => ({
      ...n,
      id: n.paper_id,
      color: clusterColor(n.cluster, data.clusters.length),
    }))
    const links = data.edges.map(e => ({
      source: data.nodes[e.source]?.paper_id,
      target: data.nodes[e.target]?.paper_id,
      weight: e.weight,
    })).filter(l => l.source && l.target)
    return { nodes, links }
  }, [data])

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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-neutral-900 text-neutral-100">
      <div ref={containerRef} className="flex-1 relative min-h-[60vh]">
        <ForceGraph3D
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#0b0f14"
          nodeColor={(n: any) => n.color}
          nodeRelSize={4}
          nodeLabel={(n: any) => {
            const label = labels[n.cluster] ?? `Cluster ${n.cluster}`
            return `${n.title}\n— ${label}`
          }}
          linkOpacity={0.18}
          linkWidth={(l: any) => Math.max(0.25, (l.weight ?? 0) * 0.8)}
          onNodeClick={(n: any) => setSelected(n as GraphNode)}
          enableNodeDrag={false}
        />
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-md bg-neutral-950/90 backdrop-blur border border-white/10 rounded-xl p-4 shadow-xl">
            <div className="text-[10px] tracking-widest uppercase opacity-60 mb-1">
              arxiv:{selected.paper_id}
            </div>
            <div className="text-sm font-medium mb-1">{selected.title}</div>
            <div className="text-xs opacity-70">
              {labels[selected.cluster] ?? `Cluster ${selected.cluster}`}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="absolute top-2 right-3 text-xs opacity-50 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <aside className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-white/10 bg-neutral-950 p-4 overflow-y-auto">
        <div className="text-[10px] tracking-widest uppercase opacity-60 mb-3">
          clusters
        </div>
        <ul className="space-y-2">
          {data.clusters.map(c => (
            <LegendRow
              key={c.id}
              cluster={c}
              label={labels[c.id] ?? c.label}
              isOverride={hasOverride(c.id)}
              color={clusterColor(c.id, data.clusters.length)}
              onEdit={v => setLabel(c.id, v)}
              onReset={() => resetLabel(c.id)}
            />
          ))}
        </ul>
        <div className="mt-6 text-[11px] opacity-55 leading-relaxed">
          Click a label to rename. Edits save to this browser only.
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

function LegendRow({
  cluster, label, isOverride, color, onEdit, onReset,
}: {
  cluster: ClusterInfo
  label: string
  isOverride: boolean
  color: string
  onEdit: (v: string) => void
  onReset: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)

  const commit = () => {
    onEdit(draft)
    setEditing(false)
  }

  return (
    <li className="flex items-start gap-2 text-sm">
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
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setDraft(label); setEditing(false) }
            }}
            className="w-full border border-white/20 rounded px-2 py-1 text-sm bg-neutral-900 text-neutral-100 focus:outline-none focus:border-white/40"
          />
        ) : (
          <button
            onClick={() => { setDraft(label); setEditing(true) }}
            className="text-left w-full truncate hover:underline decoration-dotted"
            title={label}
          >
            {label}
          </button>
        )}
        <div className="text-[10px] opacity-55 flex gap-2 mt-0.5">
          <span>{cluster.size} papers</span>
          {isOverride && (
            <button
              onClick={onReset}
              className="hover:opacity-100 opacity-70 underline"
            >
              reset
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
