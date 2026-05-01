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

// Direct Three.js renderer: one InstancedMesh for nodes + one LineSegments for
// edges = ~3 draw calls vs ~33k from react-force-graph-3d at 10k+20k. Smooth
// rotate/zoom at 60fps without hiding edges during drag.

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
  cameraPosition: (
    target: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    durationMs?: number,
  ) => void
  graphData: () => { nodes: BaseNode[]; links: BaseLink[] }
}

export interface CustomGraph3DProps<N extends BaseNode, L extends BaseLink> {
  graphData: { nodes: N[]; links: L[] }
  width: number
  height: number
  backgroundColor?: string
  nodeRelSize?: number
  nodeOpacity?: number
  nodeColor?: (n: object) => string
  nodeVal?: (n: object) => number
  nodeLabel?: (n: object) => string
  nodeVisibility?: (n: object) => boolean
  linkOpacity?: number
  linkColor?: (l: object) => string
  linkWidth?: (l: object) => number
  linkVisibility?: (l: object) => boolean
  linkDirectionalParticles?: (l: object) => number
  linkDirectionalParticleSpeed?: number
  linkDirectionalParticleWidth?: number
  linkDirectionalParticleColor?: () => string
  onNodeClick?: (n: object) => void
  onNodeHover?: (n: object | null) => void
  onBackgroundClick?: () => void
}

const TOOLTIP_OFFSET = 12
const CLICK_DRAG_THRESHOLD_PX_SQ = 25  // 5px movement = drag, not click
const WHEEL_IDLE_MS = 220
const MAX_PARTICLES = 96

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
    // linkWidth ignored: gl.LINES is capped at 1px in WebGL.
    linkVisibility = () => true,
    linkDirectionalParticles = () => 0,
    linkDirectionalParticleSpeed = 0.006,
    linkDirectionalParticleWidth = 1.6,
    linkDirectionalParticleColor,
    onNodeClick,
    onNodeHover,
    onBackgroundClick,
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef   = useRef<HTMLDivElement | null>(null)

  const sceneRef       = useRef<THREE.Scene | null>(null)
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef    = useRef<OrbitControls | null>(null)
  const nodeMeshRef    = useRef<THREE.InstancedMesh | null>(null)
  const edgeLinesRef   = useRef<THREE.LineSegments | null>(null)
  const queryLinesRef  = useRef<THREE.LineSegments | null>(null)
  const particleMeshRef = useRef<THREE.InstancedMesh | null>(null)

  const nodesRef        = useRef<BaseNode[]>([])
  const linksRef        = useRef<BaseLink[]>([])
  const queryLinksRef   = useRef<BaseLink[]>([])
  const nodeIdToIndex   = useRef<Map<string, number>>(new Map())

  const hoveredIndexRef         = useRef<number>(-1)
  const interactingRef          = useRef<boolean>(false)
  const pointerDownOnCanvasRef  = useRef<boolean>(false)
  const dragStartRef            = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false })
  // Frame the camera once on first non-empty rebuild; later rebuilds (query, isolation) preserve user's view.
  const cameraFramedRef         = useRef<boolean>(false)

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

  // Routes callbacks + animation primitives through a ref so listeners read
  // latest values without resubscribing or rebuilding the rAF tick.
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
    controls.maxPolarAngle = Math.PI
    controls.minDistance = 50
    controls.maxDistance = 5000
    controlsRef.current = controls

    const particleGeom = new THREE.SphereGeometry(1, 6, 6)
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xa3d977 })
    const particleMesh = new THREE.InstancedMesh(particleGeom, particleMat, MAX_PARTICLES)
    particleMesh.count = 0
    particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(particleMesh)
    particleMeshRef.current = particleMesh

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
      // Cancel any in-progress camera tween so its lerp doesn't fight OrbitControls.
      tweenRef.current.active = false
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons > 0) {
        const dx = e.clientX - dragStartRef.current.x
        const dy = e.clientY - dragStartRef.current.y
        if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_PX_SQ) dragStartRef.current.moved = true
      }
      // Suppress hover during any interaction — including wheel-zoom where buttons===0.
      if (interactingRef.current) return
      handleHover(e)
    }
    const onPointerUp = (e: PointerEvent) => {
      // Gate on pointerdown originating here — document listener also fires for unrelated releases.
      if (!pointerDownOnCanvasRef.current) return
      pointerDownOnCanvasRef.current = false
      const wasMoved = dragStartRef.current.moved
      setInteracting(false)
      // Right/middle releases come from OrbitControls pan/zoom — only primary is a click.
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
    // pointerup on document so a release off-canvas still ends the interaction.
    document.addEventListener('pointerup', onPointerUp, { passive: true })
    renderer.domElement.addEventListener('wheel',       onWheel,       { passive: true })

    let rafId = 0
    const tick = (now: number) => {
      const tw = tweenRef.current
      if (tw.active) {
        const t = Math.min(1, (now - tw.startTime) / tw.duration)
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
      particleGeom.dispose()
      particleMat.dispose()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  useEffect(() => {
    rebuildScene()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, nodeRelSize, nodeOpacity, linkOpacity])

  // Walks the InstancedMesh and rewrites matrices + colors in place when
  // hovered/selected/isolated state changes — ~10k iters is sub-millisecond.
  useEffect(() => {
    applyNodeProps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeColor, nodeVal, nodeVisibility, nodeRelSize])

  useEffect(() => {
    applyEdgeProps()
    applyQueryEdgeProps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkColor, linkVisibility])

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

    hoveredIndexRef.current = -1
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0'

    disposeNodeMesh()
    if (nodes.length > 0) {
      const geom = new THREE.SphereGeometry(1, 8, 6)
      // No vertexColors: the color shader chunk multiplies vColor before
      // applying instanceColor, which would zero out our per-instance colors.
      // depthWrite forced TRUE even at opacity<1 so edges depth-test against nodes.
      const mat  = new THREE.MeshBasicMaterial({
        transparent: nodeOpacity < 1,
        opacity: nodeOpacity,
        depthWrite: true,
      })
      const mesh = new THREE.InstancedMesh(geom, mat, nodes.length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.renderOrder = 0
      scene.add(mesh)
      nodeMeshRef.current = mesh
    }

    const normalLinks: BaseLink[] = []
    const queryLinks:  BaseLink[] = []
    for (const l of links) {
      if (l.isQueryEdge) queryLinks.push(l)
      else normalLinks.push(l)
    }
    linksRef.current = normalLinks
    queryLinksRef.current = queryLinks

    // renderOrder=1 draws edges after nodes regardless of transparent-pass centroid sort.
    disposeEdgeLines()
    if (normalLinks.length > 0) {
      edgeLinesRef.current = allocateEdgeLines(normalLinks.length, linkOpacity)
      edgeLinesRef.current.renderOrder = 1
      scene.add(edgeLinesRef.current)
    }
    disposeQueryLines()
    if (queryLinks.length > 0) {
      queryLinesRef.current = allocateEdgeLines(queryLinks.length, Math.max(linkOpacity, 0.6))
      queryLinesRef.current.renderOrder = 1
      scene.add(queryLinesRef.current)
    }

    applyNodeProps()
    applyEdgeProps()
    applyQueryEdgeProps()
    rebuildParticles()

    // Bounds only need recomputing here — hover/isolation mutates scales/colors, not positions.
    nodeMeshRef.current?.computeBoundingSphere()
    edgeLinesRef.current?.geometry.computeBoundingSphere()
    queryLinesRef.current?.geometry.computeBoundingSphere()

    // First non-empty rebuild → frame camera. UMAP coords aren't origin-centered
    // (~200..1300 after 100× COORD_SCALE), so default camera looks past the graph.
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
    const halfFov = (camera.fov * Math.PI / 180) / 2
    const dist = (extent / 2) / Math.tan(halfFov) * 1.4  // 1.4× margin
    controls.target.set(cx, cy, cz)
    camera.position.set(cx, cy, cz + dist)
    camera.lookAt(cx, cy, cz)
    camera.updateProjectionMatrix()
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
      // Collapse invisible edges to a degenerate (zero-length) segment.
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
    // Page's setHovered triggers new callback identities → retriggers applyNodeProps/applyEdgeProps.
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
    if (v.z > 1) {  // behind camera
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
