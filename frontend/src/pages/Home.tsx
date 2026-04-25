import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { KaTeX } from '../components/KaTeX'
import { useAuth } from '../hooks/useAuth'
import { useLibrary } from '../hooks/useLibrary'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

interface HealthPayload {
  status: string
  loaded: Record<string, boolean>
  llm_enabled: boolean
}

interface CorpusStats {
  papers: number
  clusters: number
  llm: boolean
  artifacts: { label: string; ready: boolean }[]
}

/* ==========================================================================
   Home — "the study" — minimal zen botanical welcome.
   Soft rounded cards, generous whitespace, calm typography.
   ========================================================================== */

export default function Home() {
  const { profile, user } = useAuth()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const greeting = useMemo(() => {
    const h = now.getHours()
    if (h < 5)  return 'good evening'
    if (h < 12) return 'good morning'
    if (h < 18) return 'good afternoon'
    return 'good evening'
  }, [now])

  const displayName =
    profile?.display_name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'scholar'

  const dateLine = useMemo(() => {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`
  }, [now])

  return (
    <div className="min-h-screen bg-cream text-forest antialiased">
      <Navbar variant="light" />

      {/* ── Greeting ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 pt-20 pb-16 relative">
        <div className="absolute right-0 top-8 w-[360px] h-[360px] rounded-full bg-sage/15 blur-3xl pointer-events-none" />

        <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/50 mb-3">
          {dateLine}
        </div>
        <div className="font-[family-name:var(--font-display)] text-[22px] text-forest/55 mb-5">
          {greeting},
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[88px] md:text-[108px] leading-[0.92] text-forest font-light tracking-[-0.02em]">
          <span>{displayName}</span>
          <span className="text-sage-deep">.</span>
        </h1>

        <p className="mt-10 font-[family-name:var(--font-body)] text-[18px] leading-[1.75] text-forest/65 max-w-[46ch]">
          The library is quiet today. Begin a new manuscript, or return to the corpus.
        </p>
      </section>

      <Divider />

      {/* ── Two doorways ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-20">
        <div className="grid grid-cols-12 gap-8">
          <Doorway
            roman="I"
            kicker="the desk"
            title="open the editor"
            lede="Compose in LaTeX. A typeset scholar rises beside every keystroke."
            link={{ to: '/editor/scratch', label: 'begin writing' }}
            accent="#264635"
            preview={<DeskPreview />}
          />
          <Doorway
            roman="II"
            kicker="the reading room"
            title="consult the corpus"
            lede="Ask in plain prose. The answer returns with citations attached."
            link={{ to: '/browse', label: 'ask the library' }}
            accent="#7F9267"
            preview={<CorpusPreview />}
          />
        </div>
      </section>

      <Divider />

      {/* ── Ledger ────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-20">
        <div className="mb-10 flex items-baseline gap-4">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
            system ledger
          </span>
          <span className="h-px flex-1 bg-forest/15" />
        </div>
        <Ledger />
      </section>

      <footer className="max-w-5xl mx-auto px-8 pb-14 pt-10">
        <div className="flex items-center justify-between flex-wrap gap-4 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.22em] uppercase text-forest/40">
          <span>scholar · the study</span>
          <span>set in Gamja Flower, Venus &amp; JetBrains Mono</span>
        </div>
      </footer>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────────── */

function Divider() {
  return (
    <div className="max-w-5xl mx-auto px-8">
      <div className="h-px bg-forest/15" />
    </div>
  )
}

/* ── Doorway — a single room ─────────────────────────────────────── */

function Doorway({
  roman, kicker, title, lede, link, preview, accent,
}: {
  roman: string; kicker: string; title: string; lede: string
  link: { to: string; label: string }
  preview: React.ReactNode
  accent: string
}) {
  return (
    <article className="col-span-12 md:col-span-6 group">
      <Link to={link.to} className="block">
        <div className="bau-card p-8 h-full transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(38,70,53,0.22)]">
          <div className="flex items-baseline justify-between mb-8">
            <span
              className="font-[family-name:var(--font-display)] text-[44px] leading-none"
              style={{ color: accent, opacity: 0.75 }}
            >
              {roman}.
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[9.5px] tracking-[0.3em] uppercase text-forest/50">
              {kicker}
            </span>
          </div>

          <h3 className="font-[family-name:var(--font-display)] text-[36px] leading-[1] text-forest mb-4">
            {title}
          </h3>
          <p className="font-[family-name:var(--font-body)] text-[15px] leading-[1.75] text-forest/65 mb-7 max-w-[36ch]">
            {lede}
          </p>

          <div className="mb-7">{preview}</div>

          <div className="inline-flex items-center gap-2 font-[family-name:var(--font-body)] text-[13px] text-forest/75 group-hover:gap-3 transition-all">
            {link.label}
            <span style={{ color: accent }}>→</span>
          </div>
        </div>
      </Link>
    </article>
  )
}

/* ── Doorway previews ─────────────────────────────────────────────── */

function DeskPreview() {
  return (
    <div className="rounded-xl bg-parchment/40 paper-grain py-6 px-4">
      <div className="text-center mb-2">
        <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/40">scholar · i</span>
      </div>
      <div className="text-center font-[family-name:var(--font-display)] text-[19px] text-forest mb-3">
        On Kernelized Attention
      </div>
      <div className="flex justify-center text-forest/85">
        <KaTeX display math="A_{ij} = \frac{\phi(q_i)^{\top}\phi(k_j)}{Z_i}" />
      </div>
      <div className="text-center mt-4 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/40">
        — p. 1 —
      </div>
    </div>
  )
}

function CorpusPreview() {
  const [active, setActive] = useState(0)
  const clusters = ['efficient attention', 'diffusion priors', 'learned retrievers', 'alignment · rlhf']
  const colorFor = ['#C85544', '#2C4B70', '#E0B13A', '#7F9267']
  const dots = [
    { x: 22, y: 30, c: 0 }, { x: 30, y: 22, c: 0 }, { x: 26, y: 38, c: 0 },
    { x: 56, y: 28, c: 1 }, { x: 62, y: 34, c: 1 }, { x: 50, y: 38, c: 1 },
    { x: 78, y: 64, c: 2 }, { x: 72, y: 72, c: 2 }, { x: 82, y: 58, c: 2 },
    { x: 38, y: 70, c: 3 }, { x: 44, y: 78, c: 3 }, { x: 30, y: 74, c: 3 },
  ]

  useEffect(() => {
    const t = setInterval(() => setActive(i => (i + 1) % clusters.length), 2800)
    return () => clearInterval(t)
  }, [clusters.length])

  const reticle = useMemo(() => {
    const ds = dots.filter(d => d.c === active)
    const x = ds.reduce((s, d) => s + d.x, 0) / ds.length
    const y = ds.reduce((s, d) => s + d.y, 0) / ds.length
    return { x, y }
  }, [active])

  return (
    <div className="rounded-xl bg-parchment/40 py-5 px-3">
      <svg viewBox="0 0 100 100" className="w-full h-40">
        {dots.map((d, i) => {
          const isActive = d.c === active
          return (
            <circle
              key={i}
              cx={d.x} cy={d.y}
              r={isActive ? 1.8 : 1.2}
              fill={colorFor[d.c]}
              opacity={isActive ? 0.9 : 0.32}
              style={{ transition: 'r 500ms ease, opacity 500ms ease' }}
            />
          )
        })}
        <g
          transform={`translate(${reticle.x},${reticle.y})`}
          style={{ transition: 'transform 700ms cubic-bezier(0.2, 0.9, 0.3, 1)' }}
        >
          <circle r={6} fill="none" stroke={colorFor[active]} strokeWidth="0.4" opacity="0.5">
            <animate attributeName="r" values="6;8;6" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2.6s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>
      <div className="mt-2 flex items-center justify-center gap-2 font-[family-name:var(--font-display)] text-[15px] text-forest/70">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorFor[active] }} />
        <span key={active} className="animate-[ink-bloom_500ms_ease-out]">
          {clusters[active]}
        </span>
      </div>
    </div>
  )
}

/* ── Ledger — live system stats from /api/health and /api/topic-map ───── */

function Ledger() {
  const [stats, setStats] = useState<CorpusStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { count: libraryCount } = useLibrary()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [healthRes, topicRes, papersRes] = await Promise.all([
          fetch(`${API_BASE}/api/health`),
          fetch(`${API_BASE}/api/topic-map`).catch(() => null),
          fetch(`${API_BASE}/api/papers?limit=1`).catch(() => null),
        ])
        if (!healthRes.ok) throw new Error(`/api/health ${healthRes.status}`)
        const health = (await healthRes.json()) as HealthPayload

        let papers = 0
        let clusters = 0
        if (topicRes && topicRes.ok) {
          const topic = await topicRes.json()
          papers = (topic.nodes ?? []).length
          clusters = (topic.clusters ?? []).length
        } else if (papersRes && papersRes.ok) {
          // Fallback: we only know the artifact exists, not the count.
          papers = health.loaded.papers_json ? 1 : 0
        }

        if (cancelled) return
        setStats({
          papers,
          clusters,
          llm: health.llm_enabled,
          artifacts: [
            { label: 'abstract embeddings', ready: !!health.loaded.abstracts_npy },
            { label: 'chunk embeddings',    ready: !!health.loaded.chunks_npy },
            { label: 'caption embeddings',  ready: !!health.loaded.captions_npy },
            { label: 'topic graph',         ready: !!health.loaded.topic_graph },
          ],
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="bau-card px-7 py-6">
        <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-[#C85544] mb-2">
          backend unreachable
        </div>
        <div className="font-[family-name:var(--font-body)] text-[14px] text-forest/70">{error}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bau-card px-7 py-6 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] uppercase text-forest/50">
        loading…
      </div>
    )
  }

  const rows = [
    { label: 'corpus',      value: stats.papers ? `${stats.papers.toLocaleString()} papers` : 'not built', kind: 'indexed' },
    { label: 'constellations', value: stats.clusters ? `${stats.clusters} topic clusters` : 'not built', kind: 'clustered' },
    { label: 'synthesis',   value: stats.llm ? 'qwen · on device' : 'disabled', kind: 'generator' },
    { label: 'your shelf',  value: libraryCount > 0 ? `${libraryCount} saved` : 'empty', kind: 'library' },
  ]

  return (
    <>
      <ol className="bau-card divide-y divide-forest/10 overflow-hidden">
        {rows.map((r, i) => (
          <li
            key={i}
            className="grid grid-cols-12 gap-4 items-center px-7 py-5 hover:bg-parchment/40 transition-colors"
          >
            <span className="col-span-12 sm:col-span-3 font-[family-name:var(--font-display)] text-[15px] text-forest/55">
              {r.label}
            </span>
            <span className="col-span-12 sm:col-span-6 font-[family-name:var(--font-body)] text-[15px]">
              <span className="font-[family-name:var(--font-display)] text-forest/60">{r.kind}</span>{' '}
              <span className="text-forest">{r.value}</span>
            </span>
            <span className="col-span-12 sm:col-span-3 sm:text-right font-[family-name:var(--font-mono)] text-[10px] tracking-[0.24em] uppercase text-forest/45">
              live
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2">
        {stats.artifacts.map(a => (
          <span
            key={a.label}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] uppercase border ${
              a.ready
                ? 'bg-sage/15 text-forest border-sage-deep/30'
                : 'bg-milk text-forest/50 border-forest/15'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${a.ready ? 'bg-sage-deep' : 'bg-forest/30'}`} />
            {a.label}
          </span>
        ))}
      </div>
    </>
  )
}
