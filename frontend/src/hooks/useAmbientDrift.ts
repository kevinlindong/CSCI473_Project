import { useEffect } from 'react'
import type { ForceGraphMethods } from 'react-force-graph-3d'

/* ============================================================================
   useAmbientDrift — gentle, deterministic per-node sine-wave motion on top of
   precomputed UMAP coordinates.

   Why: the topic graph ships with static x/y/z from UMAP so we can render
   instantly without running d3-force in the browser. To preserve the "living"
   feel of the older force-directed layout, this hook adds a small per-node
   offset on every animation frame:

       node.x = baseX + AMP·sin(ω·t + phase_x)
       node.y = baseY + AMP·sin(ω·t + phase_y)
       node.z = baseZ + AMP·sin(ω·t + phase_z)

   AMP defaults to 0.5% of the largest UMAP-bbox dimension; phases are random
   per node so the cloud "breathes" rather than pulses in lockstep. Cost is
   O(N) per frame plus one `fgRef.refresh()` to push positions into the
   underlying Three.js InstancedMesh.
   ============================================================================ */

export interface DriftableNode {
  x?: number
  y?: number
  z?: number
}

interface GraphData<N extends DriftableNode> {
  nodes: N[]
}

export function useAmbientDrift<N extends DriftableNode>(
  fgRef: React.MutableRefObject<ForceGraphMethods | undefined>,
  graphData: GraphData<N>,
  amplitudeFraction: number = 0.005,
  periodMs: number = 6000,
) {
  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return

    // Compute amplitude from the UMAP bounding-box span. If no node has
    // coordinates (back-compat with old topic_graph.json), bail.
    let xMin = Infinity, xMax = -Infinity
    let yMin = Infinity, yMax = -Infinity
    let zMin = Infinity, zMax = -Infinity
    let anyCoord = false
    for (const n of graphData.nodes) {
      if (n.x === undefined || n.y === undefined || n.z === undefined) continue
      anyCoord = true
      if (n.x < xMin) xMin = n.x; if (n.x > xMax) xMax = n.x
      if (n.y < yMin) yMin = n.y; if (n.y > yMax) yMax = n.y
      if (n.z < zMin) zMin = n.z; if (n.z > zMax) zMax = n.z
    }
    if (!anyCoord) return

    const span = Math.max(xMax - xMin, yMax - yMin, zMax - zMin)
    if (!isFinite(span) || span === 0) return

    const AMP = span * amplitudeFraction
    const OMEGA = (2 * Math.PI) / periodMs

    // Stable phases + bases per node, captured for the lifetime of this graphData.
    const N = graphData.nodes.length
    const phases = new Float32Array(N * 3)
    const bases  = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      phases[i * 3 + 0] = Math.random() * 2 * Math.PI
      phases[i * 3 + 1] = Math.random() * 2 * Math.PI
      phases[i * 3 + 2] = Math.random() * 2 * Math.PI
      bases[i * 3 + 0]  = graphData.nodes[i].x ?? 0
      bases[i * 3 + 1]  = graphData.nodes[i].y ?? 0
      bases[i * 3 + 2]  = graphData.nodes[i].z ?? 0
    }

    let rafId = 0
    const start = performance.now()

    const tick = (now: number) => {
      const t = now - start
      const nodes = graphData.nodes
      for (let i = 0; i < N; i++) {
        const n = nodes[i]
        n.x = bases[i * 3 + 0] + AMP * Math.sin(OMEGA * t + phases[i * 3 + 0])
        n.y = bases[i * 3 + 1] + AMP * Math.sin(OMEGA * t + phases[i * 3 + 1])
        n.z = bases[i * 3 + 2] + AMP * Math.sin(OMEGA * t + phases[i * 3 + 2])
      }
      // Push positions into the underlying Three.js InstancedMesh.
      // refresh() is one batched call (not per-node), so this stays O(1) at
      // the library boundary regardless of N.
      const fg = fgRef.current as unknown as { refresh?: () => void } | undefined
      fg?.refresh?.()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [fgRef, graphData, amplitudeFraction, periodMs])
}
