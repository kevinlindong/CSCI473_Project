import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { KaTeX } from '../components/KaTeX'
import { useAuth } from '../hooks/useAuth'

/* ==========================================================================
   Home — the study, when you arrive.
   Two doorways: Manuscript and Corpus. Zen minimal.
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
    if (h < 5)  return 'Good evening'
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }, [now])

  const displayName =
    profile?.display_name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'scholar'

  const dateLine = useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    return `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getDate()}`
  }, [now])

  return (
    <div className="min-h-screen bg-cream text-forest antialiased selection:bg-forest/10">
      <Navbar variant="light" />

      {/* ── Greeting ─────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 pt-28 pb-24">
        <div className="flex items-baseline gap-6 mb-16">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.4em] uppercase text-forest/40">
            the study
          </span>
          <span className="h-px flex-1 bg-forest/10" />
          <span className="font-[family-name:var(--font-serif)] italic text-[13px] text-forest/40">
            {dateLine}
          </span>
        </div>

        <h1 className="font-[family-name:var(--font-editorial)] leading-[1] text-forest font-light">
          <span className="block italic text-[32px] text-forest/45 mb-3 tracking-tight">
            {greeting},
          </span>
          <span className="block italic text-[96px] tracking-tight">
            {displayName}.
          </span>
        </h1>

        <p className="mt-12 font-[family-name:var(--font-serif)] text-[17px] leading-[1.75] text-forest/60 max-w-[42ch]">
          Begin a new manuscript, or return to the corpus. The library is quiet today.
        </p>
      </section>

      {/* ── Two doorways ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 pb-28">
        <div className="grid grid-cols-12 gap-16">
          <Doorway
            numeral="一"
            kicker="the desk"
            title="Open a manuscript."
            lede="Compose in LaTeX. A typeset folio will rise beside every keystroke."
            link={{ to: '/editor/scratch', label: 'begin writing' }}
            preview={<DeskPreview />}
          />
          <Doorway
            numeral="二"
            kicker="the reading room"
            title="Consult the corpus."
            lede="Ask a question in plain prose. The answer returns with its citations attached."
            link={{ to: '/browse', label: 'ask the library' }}
            preview={<CorpusPreview />}
          />
        </div>
      </section>

      {/* ── Quiet ledger ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 pb-28">
        <div className="flex items-baseline gap-4 mb-10">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.4em] uppercase text-forest/40">
            recent passes
          </span>
          <span className="h-px flex-1 bg-forest/10" />
        </div>
        <Ledger />
      </section>

      {/* ── Footer colophon ──────────────────────────────────────── */}
      <footer className="max-w-5xl mx-auto px-8 pb-12 pt-8 border-t border-forest/10">
        <div className="flex items-baseline justify-between text-[11px] font-[family-name:var(--font-mono)] tracking-[0.28em] uppercase text-forest/35">
          <span>Folio · the study</span>
          <span className="font-[family-name:var(--font-serif)] italic normal-case tracking-normal text-forest/40">
            set in Fraunces &amp; EB Garamond
          </span>
        </div>
      </footer>
    </div>
  )
}

/* ── Doorway — a single room on the landing strip ─────────────────── */

function Doorway({
  numeral,
  kicker,
  title,
  lede,
  link,
  preview,
}: {
  numeral: string
  kicker: string
  title: string
  lede: string
  link: { to: string; label: string }
  preview: React.ReactNode
}) {
  return (
    <article className="col-span-12 md:col-span-6 group">
      <div className="flex items-baseline gap-4 mb-7">
        <span className="font-[family-name:var(--font-editorial)] text-[48px] text-forest/25 leading-none transition-colors group-hover:text-forest/45">
          {numeral}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.4em] uppercase text-sienna/80">
          {kicker}
        </span>
      </div>

      <h3 className="font-[family-name:var(--font-editorial)] italic text-[32px] leading-[1.1] text-forest mb-5 max-w-[18ch]">
        {title}
      </h3>
      <p className="font-[family-name:var(--font-serif)] text-[15.5px] leading-[1.7] text-forest/60 max-w-[38ch] mb-8">
        {lede}
      </p>

      <div className="mb-8">{preview}</div>

      <Link
        to={link.to}
        className="inline-flex items-baseline gap-2 font-[family-name:var(--font-editorial)] italic text-[17px] text-forest/75 hover:text-forest border-b border-forest/20 hover:border-forest/60 pb-0.5 transition-colors"
      >
        {link.label}
        <span>→</span>
      </Link>
    </article>
  )
}

/* ── Previews ─────────────────────────────────────────────────────── */

function DeskPreview() {
  return (
    <div className="border-t border-b border-forest/10 py-8 px-2">
      <div className="text-center font-[family-name:var(--font-editorial)] italic text-[20px] text-forest mb-1.5">
        On Kernelized Attention
      </div>
      <div className="text-center font-[family-name:var(--font-serif)] italic text-[11px] text-forest/45 mb-5">
        a working scholar
      </div>
      <div className="flex justify-center text-forest/85">
        <KaTeX display math="A_{ij} = \frac{\phi(q_i)^{\top}\phi(k_j)}{Z_i}" />
      </div>
      <div className="text-center mt-5 font-[family-name:var(--font-serif)] italic text-[10px] text-forest/30 tracking-wider">
        — p. 1 —
      </div>
    </div>
  )
}

function CorpusPreview() {
  const [active, setActive] = useState(0)
  const clusters = ['efficient attention', 'diffusion priors', 'learned retrievers', 'alignment · rlhf']
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
    <div className="border-t border-b border-forest/10 py-6">
      <svg viewBox="0 0 100 100" className="w-full h-40">
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.c === active ? 1.2 : 0.8}
            fill="#1a2f26"
            opacity={d.c === active ? 0.9 : 0.22}
            style={{ transition: 'r 500ms ease, opacity 500ms ease' }}
          />
        ))}
        <g
          transform={`translate(${reticle.x},${reticle.y})`}
          style={{ transition: 'transform 700ms cubic-bezier(0.2, 0.9, 0.3, 1)' }}
        >
          <circle r={5} fill="none" stroke="#8B6E4E" strokeWidth="0.35" opacity="0.5">
            <animate attributeName="r" values="5;7.5;5" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2.6s" repeatCount="indefinite" />
          </circle>
          <circle r={1.3} fill="#8B6E4E" />
        </g>
      </svg>
      <div className="mt-3 flex items-center justify-center gap-3 font-[family-name:var(--font-serif)] italic text-[13px] text-forest/55">
        <span className="w-1 h-1 rounded-full bg-sienna/80" />
        <span key={active} className="animate-[ink-bloom_500ms_ease-out]">
          {clusters[active]}
        </span>
      </div>
    </div>
  )
}

/* ── Ledger — quiet activity stream ───────────────────────────────── */

const ACTIVITY = [
  { when: 'this morning', verb: 'indexed', what: '312 preprints', where: 'cs.CL · cs.LG' },
  { when: 'yesterday', verb: 'clustered', what: '7 topic centroids', where: 'k-means · pc₁·pc₂' },
  { when: 'two days ago', verb: 'retrieved', what: '1,082 chunks', where: 'abstract → chunk space' },
  { when: 'last week', verb: 'encoded', what: '96 figure captions', where: 'caption space' },
]

function Ledger() {
  return (
    <ol className="divide-y divide-forest/[0.07]">
      {ACTIVITY.map((a, i) => (
        <li
          key={i}
          className="py-4 grid grid-cols-12 gap-6 items-baseline font-[family-name:var(--font-serif)] text-forest/70"
        >
          <span className="col-span-12 md:col-span-3 italic text-[13px] text-forest/40">
            {a.when}
          </span>
          <span className="col-span-12 md:col-span-6 text-[15px]">
            <span className="italic text-forest/55">{a.verb}</span>{' '}
            <span className="text-forest">{a.what}</span>
          </span>
          <span className="col-span-12 md:col-span-3 md:text-right font-[family-name:var(--font-mono)] text-[10px] tracking-[0.25em] uppercase text-forest/40">
            {a.where}
          </span>
        </li>
      ))}
    </ol>
  )
}
