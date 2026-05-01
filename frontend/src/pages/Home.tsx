import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { KaTeX } from '../components/KaTeX'

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

export default function Home() {
  return (
    <div className="min-h-screen bg-cream text-forest antialiased">
      <Navbar variant="light" />

      <Hero />
      <Divider />
      <FeatureGrid />
      <Divider />
      <SystemLedger />

      <footer className="max-w-5xl mx-auto px-8 pb-14 pt-10">
        <div className="flex items-center justify-between flex-wrap gap-4 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.22em] uppercase text-forest/40">
          <span>scholar · the study</span>
          <span>csci-ua 473 · spring 2026</span>
        </div>
      </footer>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative max-w-5xl mx-auto px-8 pt-20 pb-20">
      <div className="absolute right-0 top-8 w-[360px] h-[360px] rounded-full bg-sage/15 blur-3xl pointer-events-none -z-0" />

      <div className="relative">
        <div className="mb-6 flex items-center gap-3">
          <span className="h-px w-10 bg-forest/25" />
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/55">
            a scholar's notebook
          </span>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-[80px] md:text-[112px] leading-[0.92] text-forest font-light tracking-[-0.02em]">
          <span className="block">read the corpus.</span>
          <span className="block text-forest/65">write the manuscript.</span>
        </h1>

        <p className="mt-10 font-[family-name:var(--font-body)] text-[18px] leading-[1.75] text-forest/70 max-w-[52ch]">
          scholar is a calm reading room and writing desk for arXiv research.
          Pose a question in plain prose and the corpus answers with cited
          passages; compose in LaTeX and a typeset draft rises beside every
          keystroke.
        </p>

        <div className="mt-10 flex items-center gap-3 flex-wrap">
          <Link
            to="/browse"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-forest text-parchment hover:bg-forest-deep transition-colors font-[family-name:var(--font-body)] text-[15px] shadow-[0_18px_36px_-22px_rgba(38,70,53,0.45)]"
          >
            explore the corpus
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
            </svg>
          </Link>
          <Link
            to="/editor/scratch"
            className="inline-flex items-center gap-2 h-12 px-5 rounded-full bg-milk border border-forest/15 hover:bg-sage/10 hover:border-forest/35 transition-colors font-[family-name:var(--font-body)] text-[14px] text-forest/80 hover:text-forest"
          >
            begin a manuscript
          </Link>
          <Link
            to="/library"
            className="inline-flex items-center gap-2 h-12 px-5 rounded-full bg-milk border border-forest/15 hover:bg-sage/10 hover:border-forest/35 transition-colors font-[family-name:var(--font-body)] text-[14px] text-forest/80 hover:text-forest"
          >
            your library
          </Link>
        </div>
      </div>
    </section>
  )
}


function FeatureGrid() {
  return (
    <section className="max-w-5xl mx-auto px-8 py-20">
      <div className="mb-10 flex items-baseline gap-4">
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
          three rooms
        </span>
        <span className="h-px flex-1 bg-forest/15" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <FeatureCard
          roman="I"
          kicker="the reading room"
          title="ask the corpus."
          lede="Type a question in plain English. We search thousands of curated arXiv preprints, retrieve the most relevant passages, and synthesise an answer with every claim pinned to a citation."
          link={{ to: '/browse', label: 'explore the corpus' }}
          accent="#7F9267"
          preview={<CorpusPreview />}
          primary
        />
        <FeatureCard
          roman="II"
          kicker="the desk"
          title="compose in LaTeX."
          lede="A live editor with KaTeX preview. Drop equations inline, keep your sections organised, and let the agent fill in the prose around your ideas."
          link={{ to: '/editor/scratch', label: 'open the editor' }}
          accent="#264635"
          preview={<DeskPreview />}
        />
        <FeatureCard
          roman="III"
          kicker="the shelf"
          title="curate your library."
          lede="Save papers as you read. The library follows you between sessions — no account required, persisted right in your browser."
          link={{ to: '/library', label: 'open your library' }}
          accent="#8B6E4E"
          preview={<LibraryPreview />}
        />
      </div>
    </section>
  )
}

function FeatureCard({
  roman, kicker, title, lede, link, preview, accent, primary,
}: {
  roman: string
  kicker: string
  title: string
  lede: string
  link: { to: string; label: string }
  preview: React.ReactNode
  accent: string
  primary?: boolean
}) {
  return (
    <article className={primary ? 'col-span-12 md:col-span-12 lg:col-span-12 group' : 'col-span-12 md:col-span-6 group'}>
      <Link to={link.to} className="block">
        <div className="bau-card p-8 h-full transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(38,70,53,0.22)]">
          <div className={`grid ${primary ? 'grid-cols-12 gap-8 items-center' : 'grid-cols-1 gap-0'}`}>
            <div className={primary ? 'col-span-12 md:col-span-7' : 'col-span-1'}>
              <div className="flex items-baseline justify-between mb-6">
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

              <h3 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.05] text-forest mb-4">
                {title}
              </h3>
              <p className="font-[family-name:var(--font-body)] text-[15px] leading-[1.75] text-forest/65 mb-6 max-w-[42ch]">
                {lede}
              </p>

              <div className="inline-flex items-center gap-2 font-[family-name:var(--font-body)] text-[13.5px] text-forest/80 group-hover:gap-3 transition-all">
                {link.label}
                <span style={{ color: accent }}>→</span>
              </div>
            </div>

            <div className={primary ? 'col-span-12 md:col-span-5' : 'col-span-1 mt-6'}>
              {preview}
            </div>
          </div>
        </div>
      </Link>
    </article>
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

  const ds = dots.filter(d => d.c === active)
  const reticleX = ds.reduce((s, d) => s + d.x, 0) / ds.length
  const reticleY = ds.reduce((s, d) => s + d.y, 0) / ds.length

  return (
    <div className="rounded-xl bg-parchment/40 py-5 px-3">
      <svg viewBox="0 0 100 100" className="w-full h-44">
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
          transform={`translate(${reticleX},${reticleY})`}
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

function LibraryPreview() {
  const titles = [
    { t: 'Attention is all you need', c: '#7F9267' },
    { t: 'Deep residual learning', c: '#C85544' },
    { t: 'Denoising diffusion probabilistic models', c: '#2C4B70' },
    { t: 'Learning transferable visual models', c: '#E0B13A' },
  ]
  return (
    <div className="rounded-xl bg-parchment/40 py-4 px-4 space-y-2.5">
      {titles.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-milk border border-forest/10"
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: row.c }} />
          <span className="font-[family-name:var(--font-body)] text-[12.5px] text-forest/80 truncate">
            {row.t}
          </span>
          <svg className="w-3 h-3 text-forest/40 ml-auto shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5v14l7-5 7 5V5a2 2 0 00-2-2H7a2 2 0 00-2 2z" />
          </svg>
        </div>
      ))}
    </div>
  )
}


function Divider() {
  return (
    <div className="max-w-5xl mx-auto px-8">
      <div className="h-px bg-forest/15" />
    </div>
  )
}


function SystemLedger() {
  const [stats, setStats] = useState<CorpusStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [healthRes, topicRes] = await Promise.all([
          fetch(`${API_BASE}/api/health`),
          fetch(`${API_BASE}/api/topic-map`).catch(() => null),
        ])
        if (!healthRes.ok) throw new Error(`/api/health ${healthRes.status}`)
        const health = (await healthRes.json()) as HealthPayload

        let papers = 0
        let clusters = 0
        if (topicRes && topicRes.ok) {
          const topic = await topicRes.json()
          papers = (topic.nodes ?? []).length
          clusters = (topic.clusters ?? []).length
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

  return (
    <section className="max-w-5xl mx-auto px-8 py-20">
      <div className="mb-10 flex items-baseline gap-4">
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
          live ledger
        </span>
        <span className="h-px flex-1 bg-forest/15" />
      </div>

      {error ? (
        <div className="bau-card px-7 py-6">
          <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-[#C85544] mb-2">
            backend unreachable
          </div>
          <div className="font-[family-name:var(--font-body)] text-[14px] text-forest/70">{error}</div>
        </div>
      ) : !stats ? (
        <div className="bau-card px-7 py-6 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] uppercase text-forest/50">
          loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="corpus" value={stats.papers ? stats.papers.toLocaleString() : '—'} sub="papers indexed" />
            <Stat label="constellations" value={stats.clusters ? `${stats.clusters}` : '—'} sub="topic clusters" />
            <Stat label="synthesis" value={stats.llm ? 'online' : 'disabled'} sub={stats.llm ? 'rag synthesis' : 'no llm'} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
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
      )}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bau-card px-6 py-5">
      <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/50 mb-2">
        {label}
      </div>
      <div className="font-[family-name:var(--font-display)] text-[36px] text-forest leading-none mb-1.5 tabular-nums">
        {value}
      </div>
      <div className="font-[family-name:var(--font-body)] text-[12.5px] text-forest/55">
        {sub}
      </div>
    </div>
  )
}
