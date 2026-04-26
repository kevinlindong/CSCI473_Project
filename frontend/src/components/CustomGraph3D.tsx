import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
  type Ref,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/* ============================================================================
   CustomGraph3D — direct Three.js renderer for the topic graph.

   Replaces react-force-graph-3d, which was emitting one individual Mesh per
   node and per edge (~33,000 draw calls per frame at 10k+20k). This rewrite
   collapses the scene to ~3 draw calls:

     1. InstancedMesh of low-poly spheres for ALL nodes.
     2. LineSegments for ALL edges (vertex-colored so hover-adjacent edges
        can flash white without touching geometry).
     3. (When a query is active) a separate LineSegments for query edges +
        a small InstancedMesh of tiny spheres animated along them.

   Step-change in interaction performance: rotate/zoom can stay smooth at
   60fps even on weak integrated GPUs without hiding edges during drag.

   Prop signature mimics ForceGraph3D for the subset we use, so the call
   sites in TopicGraph3D.tsx and CorpusGraph3D.tsx need only an import +
   tag swap.
   ============================================================================ */

// ─── Public types ──────────────────────────────────────────────────────────

export interface BaseNode {
  id: string
  x?: number
  y?: number
  z?: number
  isQuery?: boolean
}

export interface BaseLink {
  source: string
  target: string
  weight?: number
  isQueryEdge?: boolean
}

export interface CustomGraphMethods {
  scene: () => THREE.Scene
  camera: () => THREE.PerspectiveCamera
  renderer: () => THREE.WebGLRenderer
  controls: () => OrbitControls
  /**
   * Animate the camera to `target` over `durationMs` (default 1000), focusing
   * on `lookAt` if provided. Matches ForceGraphMethods.cameraPosition signature.
   */
  cameraPosition: (
    target: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    durationMs?: number,
  ) => void
  /** Returns { nodes, links } (mostly for compatibility with old camera-pan code). */
  graphData: () => { nodes: BaseNode[]; links: BaseLink[] }
}

export interface CustomGraph3DProps<N extends BaseNode, L extends BaseLink> {
  graphData: { nodes: N[]; links: L[] }
  width: number
  height: number
  backgroundColor?: string
  // ─── Node appearance ─────────────────────────────────────────────────────
  /** Multiplier on the per-instance scale. Default 4 (matches ForceGraph3D's nodeRelSize). */
  nodeRelSize?: number
  /** Per-node opacity. Default 0.92. */
  nodeOpacity?: number
  nodeColor?: (n: object) => string
  /** Returns a "size factor" — final radius is nodeRelSize * sqrt(nodeVal). Default 1. */
  nodeVal?: (n: object) => number
  nodeLabel?: (n: object) => string
  nodeVisibility?: (n: object) => boolean
  // ─── Link appearance ─────────────────────────────────────────────────────
  /** Per-link opacity. Default 0.22. */
  linkOpacity?: number
  linkColor?: (l: object) => string
  linkWidth?: (l: object) => number
  linkVisibility?: (l: object) => boolean
  linkDirectionalParticles?: (l: object) => number
  linkDirectionalParticleSpeed?: number
  linkDirectionalParticleWidth?: number
  linkDirectionalParticleColor?: () => string
  // ─── Interaction ─────────────────────────────────────────────────────────
  onNodeClick?: (n: object) => void
  onNodeHover?: (n: object | null) => void
  onBackgroundClick?: () => void
}

// ─── Internal helpers ──────────────────────────────────────────────────────

const TOOLTIP_OFFSET = 12
const CLICK_DRAG_THRESHOLD_PX_SQ = 25  // 5px movement = "drag", not "click"
const WHEEL_IDLE_MS = 220
const MAX_PARTICLES = 96  // 16 query edges × 6 particles, max headroom

// ─── Component ─────────────────────────────────────────────────────────────

function CustomGraph3DInner<N extends BaseNode, L extends BaseLink>(
  props: CustomGraph3DProps<N, L>,
  ref: Ref<CustomGraphMethods>,
) {
  const {
    graphData,
    width,
    height,
    backgroundColor = '#000000',
    nodeRelSize = 4,
    nodeOpacity = 0.92,
    nodeColor = () => '#ffffff',
    nodeVal = () => 1,
    nodeLabel = () => '',
    nodeVisibility = () => true,
    linkOpacity = 0.22,
    linkColor = () => '#8ea7c4',
    // linkWidth: accepted in props for ForceGraph3D parity but unused —
    // WebGL caps `gl.LINES` width at 1px in most browsers. Honoring the
    // callback would require LineMaterial from three's examples/jsm/lines.
    linkVisibility = () => true,
    linkDirectionalParticles = () => 0,
    linkDirectionalParticleSpeed = 0.006,
    linkDirectionalParticleWidth = 1.6,
    linkDirectionalParticleColor,
    onNodeClick,
    onNodeHover,
    onBackgroundClick,
  } = props

  // Container DOM
  const containerRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef   = useRef<HTMLDivElement | null>(null)

  // Three.js objects (created once, persist for the component's lifetime)
  const sceneRef       = useRef<THREE.Scene | null>(null)
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef    = useRef<OrbitControls | null>(null)
  const nodeMeshRef    = useRef<THREE.InstancedMesh | null>(null)
  const edgeLinesRef   = useRef<THREE.LineSegments | null>(null)
  const queryLinesRef  = useRef<THREE.LineSegments | null>(null)
  const particleMeshRef = useRef<THREE.InstancedMesh | null>(null)

  // Index data — kept in sync with current graphData
  const nodesRef        = useRef<BaseNode[]>([])
  const linksRef        = useRef<BaseLink[]>([])  // non-query edges only, in geometry order
  const queryLinksRef   = useRef<BaseLink[]>([])
  const nodeIdToIndex   = useRef<Map<string, number>>(new Map())

  // Interaction state
  const hoveredIndexRef         = useRef<number>(-1)
  const interactingRef          = useRef<boolean>(false)
  const pointerDownOnCanvasRef  = useRef<boolean>(false)
  const dragStartRef            = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false })
  // Track whether the camera has been framed against the graph yet. Without
  // this, every rebuild (query insertion, isolation toggle) would yank the
  // camera back to the default — destroying the user's current view.
  const cameraFramedRef         = useRef<boolean>(false)

  // Camera-tween state
  const tweenRef = useRef<{
    startTime: number
    duration: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    active: boolean
  }>({
    startTime: 0, duration: 0,
    fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(),
    active: false,
  })

  // Memoize callback refs so listeners always read the latest functions
  // without resubscribing. Primitives like particle speed/width are also
  // routed through here so the rAF tick (captured in the mount-only effect)
  // still reflects live prop changes.
  const callbacksRef = useRef({
    nodeColor, nodeVal, nodeLabel, nodeVisibility,
    linkColor, linkVisibility,
    linkDirectionalParticles, linkDirectionalParticleColor,
    linkDirectionalParticleSpeed, linkDirectionalParticleWidth,
    onNodeClick, onNodeHover, onBackgroundClick,
  })
  callbacksRef.current = {
    nodeColor, nodeVal, nodeLabel, nodeVisibility,
    linkColor, linkVisibility,
    linkDirectionalParticles, linkDirectionalParticleColor,
    linkDirectionalParticleSpeed, linkDirectionalParticleWidth,
    onNodeClick, onNodeHover, onBackgroundClick,
  }

  // ─── Mount: build scene + start render loop ──────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(backgroundColor)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, Math.max(1, width) / Math.max(1, height), 1, 8000)
    camera.position.set(0, 0, 1400)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.rotateSpeed = 0.4
    controls.zoomSpeed = 0.5
    controls.panSpeed = 0.3
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI  // allow rotating beyond the equator
    controls.minDistance = 50
    controls.maxDistance = 5000
    controlsRef.current = controls

    // Particles InstancedMesh — pre-allocated; count toggled per query.
    const particleGeom = new THREE.SphereGeometry(1, 6, 6)
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xa3d977 })
    const particleMesh = new THREE.InstancedMesh(particleGeom, particleMat, MAX_PARTICLES)
    particleMesh.count = 0
    particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(particleMesh)
    particleMeshRef.current = particleMesh

    // ─── Pointer / wheel handlers ─────────────────────────────────────────
    let wheelTimer: number | null = null
    const setInteracting = (v: boolean) => {
      if (interactingRef.current === v) return
      interactingRef.current = v
      const dpr = v ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      renderer.setPixelRatio(dpr)
    }

    const onPointerDown = (e: PointerEvent) => {
      dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false }
      pointerDownOnCanvasRef.current = true
      setInteracting(true)
      // Cancel any in-progress camera tween — otherwise its lerp into
      // camera.position would fight OrbitControls' input every frame.
      tweenRef.current.active = false
    }
    const onPointerMove = (e: PointerEvent) => {
      // Drag-vs-click discrimination
      if (e.buttons > 0) {
        const dx = e.clientX - dragStartRef.current.x
        const dy = e.clientY - dragStartRef.current.y
        if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_PX_SQ) dragStartRef.current.moved = true
      }
      // Hover suppressed during ANY interaction. Includes wheel-only zoom
      // where e.buttons === 0 — checking buttons here would let hover fire
      // mid-zoom and fight the camera.
      if (interactingRef.current) return
      handleHover(e)
    }
    const onPointerUp = (e: PointerEvent) => {
      // Document-level listener fires for ANY pointerup, including releases
      // unrelated to this canvas (e.g. user clicked the sidebar). Gate on
      // the pointerdown having actually started here.
      if (!pointerDownOnCanvasRef.current) return
      pointerDownOnCanvasRef.current = false
      const wasMoved = dragStartRef.current.moved
      setInteracting(false)
      // Only the primary button is a "click"; right/middle releases come
      // from OrbitControls' pan/zoom drags and shouldn't select a node.
      if (!wasMoved && e.button === 0) handleClick(e)
    }
    const onWheel = () => {
      setInteracting(true)
      tweenRef.current.active = false
      if (wheelTimer !== null) clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => {
        setInteracting(false)
        wheelTimer = null
      }, WHEEL_IDLE_MS)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true })
    renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true })
    // pointerup on document so a release that lands off the canvas (after
    // dragging the camera past the viewport edge) still ends the interaction.
    // Otherwise interactingRef sticks true and DPR/hover gating never reset.
    document.addEventListener('pointerup', onPointerUp, { passive: true })
    renderer.domElement.addEventListener('wheel',       onWheel,       { passive: true })

    // ─── Render loop ──────────────────────────────────────────────────────
    let rafId = 0
    const tick = (now: number) => {
      // Camera tween
      const tw = tweenRef.current
      if (tw.active) {
        const t = Math.min(1, (now - tw.startTime) / tw.duration)
        // Cubic ease-in-out
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        camera.position.lerpVectors(tw.fromPos, tw.toPos, eased)
        controls.target.lerpVectors(tw.fromTarget, tw.toTarget, eased)
        if (t >= 1) tw.active = false
      }
      controls.update()
      animateParticles(now)
      updateTooltip()
      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      if (wheelTimer !== null) clearTimeout(wheelTimer)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('wheel',       onWheel)
      controls.dispose()
      // Dispose particle mesh
      particleGeom.dispose()
      particleMat.dispose()
      // Dispose any current node/edge meshes
      disposeNodeMesh()
      disposeEdgeLines()
      disposeQueryLines()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      nodeMeshRef.current = null
      edgeLinesRef.current = null
      queryLinesRef.current = null
      particleMeshRef.current = null
    }
    // intentionally run once: subsequent prop changes are handled by the
    // dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Width/height changes ─────────────────────────────────────────────────
  useEffect(() => {
    const cam = cameraRef.current
    const rnd = rendererRef.current
    if (!cam || !rnd) return
    cam.aspect = Math.max(1, width) / Math.max(1, height)
    cam.updateProjectionMatrix()
    rnd.setSize(width, height)
  }, [width, height])

  useEffect(() => {
    const sc = sceneRef.current
    if (!sc) return
    sc.background = new THREE.Color(backgroundColor)
  }, [backgroundColor])

  // ─── Build / rebuild graph when graphData changes ────────────────────────
  useEffect(() => {
    rebuildScene()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, nodeRelSize, nodeOpacity, linkOpacity])

  // ─── Re-apply per-instance node visuals when callbacks change ───────────
  // The page's nodeColor / nodeVal / nodeVisibility callbacks change identity
  // when their closure deps (hovered, selected, isolated) change. This effect
  // re-walks the InstancedMesh and rewrites matrices + colors in place. Only
  // the affected instances actually look different, but writing all of them
  // keeps the logic simple — ~10k iters is sub-millisecond.
  useEffect(() => {
    applyNodeProps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeColor, nodeVal, nodeVisibility, nodeRelSize])

  // ─── Re-apply per-edge visuals when callbacks change ────────────────────
  // Hover (linkColor depends on hovered) + isolation (linkVisibility depends
  // on activeClusters) both flow through here. Walks ~20k edges, ~1-2ms.
  useEffect(() => {
    applyEdgeProps()
    applyQueryEdgeProps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkColor, linkVisibility])

  // ─── Helper functions (closures share refs) ──────────────────────────────

  function disposeNodeMesh() {
    const m = nodeMeshRef.current
    if (!m) return
    sceneRef.current?.remove(m)
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
    nodeMeshRef.current = null
  }

  function disposeEdgeLines() {
    const m = edgeLinesRef.current
    if (!m) return
    sceneRef.current?.remove(m)
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
    edgeLinesRef.current = null
  }

  function disposeQueryLines() {
    const m = queryLinesRef.current
    if (!m) return
    sceneRef.current?.remove(m)
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
    queryLinesRef.current = null
  }

  function rebuildScene() {
    const scene = sceneRef.current
    if (!scene) return

    const nodes = graphData.nodes as BaseNode[]
    const links = graphData.links as BaseLink[]
    nodesRef.current = nodes
    nodeIdToIndex.current = new Map()
    nodes.forEach((n, i) => nodeIdToIndex.current.set(n.id, i))

    // Old hover index can now point to a different node (or out of bounds);
    // reset it so visuals + tooltip don't carry stale state across rebuilds.
    hoveredIndexRef.current = -1
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0'

    // ── Node InstancedMesh — allocate; properties applied below ─────────
    disposeNodeMesh()
    if (nodes.length > 0) {
      const geom = new THREE.SphereGeometry(1, 8, 6)
      // NOTE: no `vertexColors: true`. SphereGeometry has no per-vertex
      // `color` attribute, and the three.js color shader chunk multiplies
      // vColor by `color` BEFORE applying `instanceColor` — so enabling
      // vertexColors here would zero out our per-instance colors. The
      // standard shader picks up `instanceColor` (set via setColorAt)
      // automatically once it's allocated.
      //
      // depthWrite is forced TRUE even when nodeOpacity < 1. Without it,
      // transparent nodes don't populate the depth buffer, so subsequently
      // drawn transparent edges aren't depth-tested against the spheres —
      // edges visibly bleed through nodes from certain angles.
      const mat  = new THREE.MeshBasicMaterial({
        transparent: nodeOpacity < 1,
        opacity: nodeOpacity,
        depthWrite: true,
      })
      const mesh = new THREE.InstancedMesh(geom, mat, nodes.length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // Render before edges so the depth buffer has node depth populated
      // before edges are tested against it.
      mesh.renderOrder = 0
      scene.add(mesh)
      nodeMeshRef.current = mesh
    }

    // ── Split links + index for adjacency ───────────────────────────────
    const normalLinks: BaseLink[] = []
    const queryLinks:  BaseLink[] = []
    for (const l of links) {
      if (l.isQueryEdge) queryLinks.push(l)
      else normalLinks.push(l)
    }
    linksRef.current = normalLinks
    queryLinksRef.current = queryLinks

    // ── Edge LineSegments — allocate fresh; properties applied below ────
    // renderOrder = 1 forces edges to draw after nodes regardless of how
    // three.js's transparent-pass centroid sort would otherwise order them.
    disposeEdgeLines()
    if (normalLinks.length > 0) {
      edgeLinesRef.current = allocateEdgeLines(normalLinks.length, linkOpacity)
      edgeLinesRef.current.renderOrder = 1
      scene.add(edgeLinesRef.current)
    }
    disposeQueryLines()
    if (queryLinks.length > 0) {
      // Query edges get higher opacity; per-edge color (e.g. sage green)
      // flows from linkColor callback.
      queryLinesRef.current = allocateEdgeLines(queryLinks.length, Math.max(linkOpacity, 0.6))
      queryLinesRef.current.renderOrder = 1
      scene.add(queryLinesRef.current)
    }

    // Apply visuals from current callbacks. (The standalone effects also
    // call these, but only when the relevant dep identities actually
    // change — calling here makes graphData-only rebuilds fully visual.)
    applyNodeProps()
    applyEdgeProps()
    applyQueryEdgeProps()
    rebuildParticles()

    // Bounding spheres are computed only here. Subsequent applyNodeProps /
    // applyEdgeProps calls during hover/isolation only mutate scales and
    // colors, not positions — so the bounds stay valid until the next
    // graphData rebuild. Computing on every hover would cost ~3 ms/event
    // for no visible benefit (bounds are only used for frustum culling).
    nodeMeshRef.current?.computeBoundingSphere()
    edgeLinesRef.current?.geometry.computeBoundingSphere()
    queryLinesRef.current?.geometry.computeBoundingSphere()

    // First non-empty rebuild → fit camera to the graph extent. UMAP coords
    // are not centered on the origin (range ~2..13 before scale, ~200..1300
    // after the page's 100× COORD_SCALE), so the default (0,0,1400) camera
    // looks past the graph entirely — visualization appears empty. Subsequent
    // rebuilds keep the user's current view.
    if (!cameraFramedRef.current && nodes.length > 0) {
      frameCameraToNodes(nodes)
      cameraFramedRef.current = true
    }
  }

  function frameCameraToNodes(nodes: BaseNode[]) {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const n of nodes) {
      const x = n.x ?? 0, y = n.y ?? 0, z = n.z ?? 0
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    if (!isFinite(minX)) return
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1)
    // Distance to fit `extent` vertically at the camera's FOV, with a
    // 1.4× margin so the graph doesn't crowd the viewport edges.
    const halfFov = (camera.fov * Math.PI / 180) / 2
    const dist = (extent / 2) / Math.tan(halfFov) * 1.4
    controls.target.set(cx, cy, cz)
    camera.position.set(cx, cy, cz + dist)
    camera.lookAt(cx, cy, cz)
    camera.updateProjectionMatrix()
    // Constrain zoom so the user can't lose the graph entirely.
    controls.minDistance = extent * 0.05
    controls.maxDistance = extent * 8
    controls.update()
  }

  function allocateEdgeLines(count: number, opacity: number): THREE.LineSegments {
    const positions = new Float32Array(count * 6)
    const colors    = new Float32Array(count * 6)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('color',    new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    })
    return new THREE.LineSegments(geom, mat)
  }

  function applyNodeProps() {
    const mesh = nodeMeshRef.current
    if (!mesh) return
    const nodes = nodesRef.current
    const cb = callbacksRef.current
    const dummy = new THREE.Object3D()
    const tmpColor = new THREE.Color()
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const visible = cb.nodeVisibility(node)
      const radius = nodeRelSize * Math.sqrt(Math.max(0, cb.nodeVal(node)))
      dummy.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0)
      dummy.scale.setScalar(visible ? Math.max(0.001, radius) : 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      tmpColor.set(cb.nodeColor(node))
      mesh.setColorAt(i, tmpColor)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  function applyEdgeProps() {
    applyLinesProps(edgeLinesRef.current, linksRef.current)
  }

  function applyQueryEdgeProps() {
    applyLinesProps(queryLinesRef.current, queryLinksRef.current)
  }

  function applyLinesProps(lines: THREE.LineSegments | null, links: BaseLink[]) {
    if (!lines || links.length === 0) return
    const cb = callbacksRef.current
    const positions = (lines.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    const colors    = (lines.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array
    const idx = nodeIdToIndex.current
    const nodes = nodesRef.current
    const tmpColor = new THREE.Color()
    for (let i = 0; i < links.length; i++) {
      const l = links[i]
      const a = nodes[idx.get(l.source) ?? -1]
      const b = nodes[idx.get(l.target) ?? -1]
      const ax = a?.x ?? 0, ay = a?.y ?? 0, az = a?.z ?? 0
      let bx = b?.x ?? 0, by = b?.y ?? 0, bz = b?.z ?? 0
      const visible = cb.linkVisibility(l)
      // Collapse invisible edges to a degenerate (zero-length) segment so
      // they render nothing without rebuilding geometry.
      if (!visible) { bx = ax; by = ay; bz = az }
      positions[i * 6 + 0] = ax; positions[i * 6 + 1] = ay; positions[i * 6 + 2] = az
      positions[i * 6 + 3] = bx; positions[i * 6 + 4] = by; positions[i * 6 + 5] = bz
      tmpColor.set(cb.linkColor(l))
      colors[i * 6 + 0] = tmpColor.r; colors[i * 6 + 1] = tmpColor.g; colors[i * 6 + 2] = tmpColor.b
      colors[i * 6 + 3] = tmpColor.r; colors[i * 6 + 4] = tmpColor.g; colors[i * 6 + 5] = tmpColor.b
    }
    ;(lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(lines.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  // ─── Particles along query edges ─────────────────────────────────────────
  function rebuildParticles() {
    const mesh = particleMeshRef.current
    if (!mesh) return
    const cb = callbacksRef.current
    const queryLinks = queryLinksRef.current
    let count = 0
    for (const l of queryLinks) count += Math.max(0, Math.floor(cb.linkDirectionalParticles(l)))
    if (count > MAX_PARTICLES) count = MAX_PARTICLES
    mesh.count = count
    if (count > 0) {
      const colorStr = cb.linkDirectionalParticleColor?.() ?? '#a3d977'
      ;(mesh.material as THREE.MeshBasicMaterial).color.set(colorStr)
      const dummy = new THREE.Object3D()
      const radius = cb.linkDirectionalParticleWidth * 1.2
      dummy.scale.setScalar(radius)
      for (let i = 0; i < count; i++) {
        dummy.position.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  function animateParticles(now: number) {
    const mesh = particleMeshRef.current
    if (!mesh || mesh.count === 0) return
    const cb = callbacksRef.current
    const queryLinks = queryLinksRef.current
    const idx = nodeIdToIndex.current
    const nodes = nodesRef.current
    const speed = cb.linkDirectionalParticleSpeed
    const radius = cb.linkDirectionalParticleWidth * 1.2
    const dummy = new THREE.Object3D()

    let particleIdx = 0
    for (let li = 0; li < queryLinks.length && particleIdx < mesh.count; li++) {
      const l = queryLinks[li]
      const n = Math.max(0, Math.floor(cb.linkDirectionalParticles(l)))
      if (n === 0) continue
      const a = nodes[idx.get(l.source) ?? -1]
      const b = nodes[idx.get(l.target) ?? -1]
      if (!a || !b) continue
      for (let p = 0; p < n && particleIdx < mesh.count; p++) {
        // t ∈ [0, 1] cycles over time, offset per particle
        const phase = p / n
        const t = ((now * 0.001 * speed * 60 + phase) % 1)
        const x = (a.x ?? 0) + ((b.x ?? 0) - (a.x ?? 0)) * t
        const y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t
        const z = (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t
        dummy.position.set(x, y, z)
        dummy.scale.setScalar(radius)
        dummy.updateMatrix()
        mesh.setMatrixAt(particleIdx, dummy.matrix)
        particleIdx++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  // ─── Hover ────────────────────────────────────────────────────────────────
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const mouseVec  = useMemo(() => new THREE.Vector2(), [])

  function pickNode(e: PointerEvent): number {
    const renderer = rendererRef.current
    const camera = cameraRef.current
    const mesh = nodeMeshRef.current
    if (!renderer || !camera || !mesh) return -1
    const rect = renderer.domElement.getBoundingClientRect()
    mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouseVec, camera)
    const intersects = raycaster.intersectObject(mesh, false)
    if (intersects.length === 0) return -1
    return intersects[0].instanceId ?? -1
  }

  function handleHover(e: PointerEvent) {
    const idx = pickNode(e)
    const prev = hoveredIndexRef.current
    if (idx === prev) return
    hoveredIndexRef.current = idx
    // Visual updates (node scale + edge color) flow back through React: the
    // page's setHovered triggers new callback identities, which retriggers
    // applyNodeProps / applyEdgeProps via the dedicated effects above. We
    // just notify the page here.
    const cb = callbacksRef.current
    cb.onNodeHover?.(idx >= 0 ? nodesRef.current[idx] : null)
  }

  function handleClick(e: PointerEvent) {
    const idx = pickNode(e)
    const cb = callbacksRef.current
    if (idx < 0) {
      cb.onBackgroundClick?.()
    } else {
      cb.onNodeClick?.(nodesRef.current[idx])
    }
  }

  // ─── Tooltip ──────────────────────────────────────────────────────────────
  function updateTooltip() {
    const tip = tooltipRef.current
    if (!tip) return
    const idx = hoveredIndexRef.current
    if (idx < 0) {
      tip.style.opacity = '0'
      return
    }
    const node = nodesRef.current[idx]
    if (!node) { tip.style.opacity = '0'; return }
    const camera = cameraRef.current
    const renderer = rendererRef.current
    if (!camera || !renderer) return
    const v = new THREE.Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0)
    v.project(camera)
    if (v.z > 1) {  // behind the camera
      tip.style.opacity = '0'
      return
    }
    const rect = renderer.domElement.getBoundingClientRect()
    const sx = (v.x * 0.5 + 0.5) * rect.width
    const sy = (-v.y * 0.5 + 0.5) * rect.height
    tip.style.left = `${sx + TOOLTIP_OFFSET}px`
    tip.style.top  = `${sy + TOOLTIP_OFFSET}px`
    tip.textContent = callbacksRef.current.nodeLabel(node)
    tip.style.opacity = '1'
  }

  // ─── Imperative ref API ──────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    scene:    () => sceneRef.current!,
    camera:   () => cameraRef.current!,
    renderer: () => rendererRef.current!,
    controls: () => controlsRef.current!,
    cameraPosition: (target, lookAt, durationMs = 1000) => {
      const cam = cameraRef.current
      const ctrls = controlsRef.current
      if (!cam || !ctrls) return
      const tw = tweenRef.current
      tw.fromPos.copy(cam.position)
      tw.toPos.set(target.x, target.y, target.z)
      tw.fromTarget.copy(ctrls.target)
      if (lookAt) tw.toTarget.set(lookAt.x, lookAt.y, lookAt.z)
      else tw.toTarget.copy(ctrls.target)
      tw.startTime = performance.now()
      tw.duration = Math.max(1, durationMs)
      tw.active = true
    },
    graphData: () => ({ nodes: nodesRef.current, links: linksRef.current }),
  }), [])

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'grab',
      }}
    >
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          padding: '4px 8px',
          background: 'rgba(11, 15, 20, 0.92)',
          color: '#e5e7eb',
          fontSize: 11,
          lineHeight: 1.35,
          borderRadius: 4,
          whiteSpace: 'pre',
          maxWidth: 360,
          opacity: 0,
          transition: 'opacity 80ms',
          zIndex: 10,
          left: 0,
          top: 0,
        }}
      />
    </div>
  )
}

const CustomGraph3D = forwardRef(CustomGraph3DInner) as <
  N extends BaseNode,
  L extends BaseLink,
>(
  props: CustomGraph3DProps<N, L> & { ref?: Ref<CustomGraphMethods> },
) => ReactElement

export default CustomGraph3D
