import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { KaTeX } from '../components/KaTeX'

/* ==========================================================================
   Landing — a quiet doorway.
   Two rooms: the manuscript (LaTeX editor) and the corpus (retrieval).
   Zen minimal: negative space, hairline rules, one ink accent.
   ========================================================================== */

export default function Landing() {
  return (
    <div className="min-h-screen bg-cream text-forest antialiased selection:bg-forest/10 selection:text-forest">
      <TopBar />
      <Hero />
      <Breath />
      <Rooms />
      <Breath />
      <Specimen />
      <Breath />
      <Closing />
      <Colophon />
    </div>
  )
}

/* ── 1 · Top bar ─────────────────────────────────────────────────────── */

function TopBar() {
  return (
    <header className="max-w-6xl mx-auto px-8 pt-8 flex items-center justify-between">
      <Link to="/" className="flex items-baseline gap-2 group">
        <span className="font-[family-name:var(--font-editorial)] italic text-[22px] tracking-tight text-forest">
          Folio
        </span>
        <span className="w-[6px] h-[6px] rounded-full bg-sienna/80 group-hover:bg-sienna transition-colors" />
      </Link>
      <nav className="flex items-center gap-8 text-[13px] font-[family-name:var(--font-serif)] italic text-forest/55">
        <Link to="/browse" className="hover:text-forest transition-colors">Corpus</Link>
        <Link to="/editor/scratch" className="hover:text-forest transition-colors">Manuscript</Link>
        <Link to="/how-it-works" className="hover:text-forest transition-colors">Notes</Link>
        <Link
          to="/home"
          className="text-forest/80 hover:text-forest border-b border-forest/30 hover:border-forest transition-colors not-italic font-[family-name:var(--font-body)] text-[12px] pb-0.5"
        >
          enter →
        </Link>
      </nav>
    </header>
  )
}

/* ── 2 · Hero — the single quiet statement ───────────────────────────── */

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-8 pt-40 pb-32">
      <div className="grid grid-cols-12 gap-8 items-start">

        {/* Enso mark — the one signature flourish */}
        <div className="col-span-12 md:col-span-3 flex md:justify-center">
          <Enso />
        </div>

        <div className="col-span-12 md:col-span-9 max-w-[52ch]">
          <div className="flex items-center gap-3 mb-10 text-[10px] tracking-[0.4em] uppercase font-[family-name:var(--font-mono)] text-forest/40">
            <span className="inline-block w-2 h-px bg-forest/40" />
            <span>a place for papers</span>
          </div>

          <h1 className="font-[family-name:var(--font-editorial)] text-forest font-light leading-[1.02] tracking-tight">
            <span className="block text-[86px] md:text-[112px] italic">Write.</span>
            <span className="block text-[86px] md:text-[112px] text-forest/40 italic">Read.</span>
            <span className="block text-[86px] md:text-[112px] italic">Cite.</span>
          </h1>

          <p className="mt-12 font-[family-name:var(--font-serif)] text-[17px] leading-[1.75] text-forest/65 max-w-[46ch]">
            A quiet LaTeX study, paired with a corpus of the literature that answers
            in whole paragraphs, every claim pinned to its source.
          </p>

          <div className="mt-14 flex items-center gap-6">
            <Link
              to="/editor/scratch"
              className="group inline-flex items-baseline gap-2 text-forest border-b border-forest/60 hover:border-forest pb-1 transition-colors"
            >
              <span className="font-[family-name:var(--font-editorial)] italic text-[20px]">
                open the manuscript
              </span>
              <span className="translate-y-[-1px] transition-transform group-hover:translate-x-1">→</span>
            </Link>

            <Link
              to="/browse"
              className="inline-flex items-baseline gap-2 text-forest/55 hover:text-forest transition-colors pb-1"
            >
              <span className="font-[family-name:var(--font-editorial)] italic text-[20px]">
                or consult the corpus
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* A hand-drawn-feeling enso circle — the one signature flourish */
function Enso() {
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" className="opacity-90">
      <defs>
        <filter id="ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="1.2" />
        </filter>
      </defs>
      <path
        d="M 75 18
           C 36 18, 18 52, 18 78
           C 18 112, 48 132, 80 132
           C 108 132, 130 110, 130 80
           C 130 56, 114 36, 88 30"
        fill="none"
        stroke="#1a2f26"
        strokeWidth="2.4"
        strokeLinecap="round"
        filter="url(#ink)"
        opacity="0.75"
      />
      <circle cx="88" cy="30" r="1.6" fill="#8B6E4E" opacity="0.85" />
    </svg>
  )
}

/* ── 3 · Breathing space ─────────────────────────────────────────────── */

function Breath() {
  return (
    <div className="max-w-6xl mx-auto px-8">
      <div className="h-px bg-forest/10" />
    </div>
  )
}

/* ── 4 · Two rooms ───────────────────────────────────────────────────── */

function Rooms() {
  return (
    <section className="max-w-6xl mx-auto px-8 py-32">
      <div className="mb-20 flex items-baseline gap-4">
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.4em] uppercase text-forest/40">
          two rooms
        </span>
        <span className="font-[family-name:var(--font-editorial)] italic text-[18px] text-forest/50">
          — joined by a corridor
        </span>
      </div>

      <div className="grid grid-cols-12 gap-20">
        <Room
          numeral="一"
          kicker="the desk"
          title="A typeset folio."
          body="Write in plain LaTeX — sections, theorems, tables, figures, citations. A serif proof of the paper rises beside every keystroke."
          link={{ to: '/editor/scratch', label: 'open the desk' }}
        />
        <Room
          numeral="二"
          kicker="the reading room"
          title="A corpus of papers."
          body="Ask a question. The library answers in whole paragraphs. Every sentence is pinned to the passage that taught it."
          link={{ to: '/browse', label: 'enter the reading room' }}
        />
      </div>
    </section>
  )
}

function Room({
  numeral,
  kicker,
  title,
  body,
  link,
}: {
  numeral: string
  kicker: string
  title: string
  body: string
  link: { to: string; label: string }
}) {
  return (
    <article className="col-span-12 md:col-span-6 group">
      <div className="flex items-baseline gap-5 mb-8">
        <span className="font-[family-name:var(--font-editorial)] text-[54px] text-forest/25 leading-none group-hover:text-forest/40 transition-colors">
          {numeral}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.4em] uppercase text-sienna/80">
          {kicker}
        </span>
      </div>
      <h3 className="font-[family-name:var(--font-editorial)] italic text-[36px] leading-[1.1] text-forest mb-6 max-w-[20ch]">
        {title}
      </h3>
      <p className="font-[family-name:var(--font-serif)] text-[16px] leading-[1.75] text-forest/65 max-w-[40ch] mb-10">
        {body}
      </p>
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

/* ── 5 · Specimen — a single typeset fragment ────────────────────────── */

function Specimen() {
  return (
    <section className="max-w-6xl mx-auto px-8 py-32">
      <div className="grid grid-cols-12 gap-16 items-start">

        <aside className="col-span-12 md:col-span-4">
          <div className="flex items-center gap-3 mb-6 text-[10px] tracking-[0.4em] uppercase font-[family-name:var(--font-mono)] text-forest/40">
            <span className="w-2 h-px bg-forest/40" />
            <span>a specimen</span>
          </div>
          <h3 className="font-[family-name:var(--font-editorial)] italic text-[30px] leading-[1.15] text-forest mb-5">
            Written once.<br/>Read twice.
          </h3>
          <p className="font-[family-name:var(--font-serif)] text-[15px] leading-[1.7] text-forest/60 max-w-[30ch]">
            A paragraph you drafted becomes a specimen — the corpus returns it
            ranked against the literature, the editor returns it typeset. Same
            prose, two lenses.
          </p>
        </aside>

        <figure className="col-span-12 md:col-span-8">
          <div className="bg-parchment/80 border-t border-b border-forest/10 py-16 px-12 md:px-20">
            <div className="text-center mb-10 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.4em] uppercase text-forest/35">
              query — efficient long-context attention
            </div>

            <p className="font-[family-name:var(--font-serif)] text-[18px] leading-[1.8] text-forest/80 max-w-[46ch] mx-auto text-left">
              Recent work reframes attention as a kernel sum<sup className="text-sienna font-[family-name:var(--font-mono)] text-[10px] ml-0.5">1</sup>,
              permitting linear-time approximations whose error depends only on
              the chosen feature map. On long-context benchmarks these variants
              hold pace with dense transformers while keeping memory sublinear in
              sequence length<sup className="text-sienna font-[family-name:var(--font-mono)] text-[10px] ml-0.5">2</sup>.
            </p>

            <div className="my-10 flex justify-center text-forest/85">
              <KaTeX
                display
                math="A_{ij} = \frac{\phi(q_i)^{\top}\phi(k_j)}{\sum_{l}\phi(q_i)^{\top}\phi(k_l)}"
              />
            </div>

            <div className="max-w-[46ch] mx-auto font-[family-name:var(--font-serif)] text-[13px] leading-[1.7] text-forest/50 border-t border-forest/10 pt-6 space-y-1">
              <div className="flex gap-3"><span className="text-sienna font-[family-name:var(--font-mono)] text-[10px]">1.</span><span><em>Rethinking Attention with Performers.</em> Choromanski et al. 2020.</span></div>
              <div className="flex gap-3"><span className="text-sienna font-[family-name:var(--font-mono)] text-[10px]">2.</span><span><em>Efficient Transformers: A Survey.</em> Tay et al. 2022.</span></div>
            </div>
          </div>
        </figure>
      </div>
    </section>
  )
}

/* ── 6 · Closing ─────────────────────────────────────────────────────── */

function Closing() {
  const [phraseIdx, setPhraseIdx] = useState(0)
  const phrases = useRef([
    'a quiet place to think through a paper',
    'a library that answers in paragraphs',
    'citations you can visit',
    'a folio, rising beside every keystroke',
  ]).current

  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % phrases.length), 4200)
    return () => clearInterval(t)
  }, [phrases.length])

  return (
    <section className="max-w-6xl mx-auto px-8 py-40 text-center">
      <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.4em] uppercase text-forest/35 mb-8">
        —
      </div>
      <h3 className="font-[family-name:var(--font-editorial)] italic text-[48px] md:text-[72px] leading-[1.05] text-forest mb-10 font-light">
        Pull up a chair.
      </h3>

      <div className="h-7 mb-12 flex items-center justify-center overflow-hidden">
        <span
          key={phraseIdx}
          className="font-[family-name:var(--font-serif)] italic text-[17px] text-forest/55 animate-[ink-bloom_600ms_ease-out]"
        >
          {phrases[phraseIdx]}
        </span>
      </div>

      <Link
        to="/home"
        className="inline-flex items-baseline gap-3 font-[family-name:var(--font-editorial)] italic text-[22px] text-forest border-b border-forest/40 hover:border-forest transition-colors pb-1"
      >
        enter the study
        <span>→</span>
      </Link>
    </section>
  )
}

/* ── 7 · Colophon ────────────────────────────────────────────────────── */

function Colophon() {
  return (
    <footer className="max-w-6xl mx-auto px-8 pb-14 pt-8 border-t border-forest/10">
      <div className="flex flex-wrap items-baseline justify-between gap-y-4 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.28em] uppercase text-forest/35">
        <span>Folio · {new Date().getFullYear()}</span>
        <div className="flex items-center gap-6">
          <Link to="/editor/scratch" className="hover:text-forest/70 transition-colors">Manuscript</Link>
          <Link to="/browse" className="hover:text-forest/70 transition-colors">Corpus</Link>
          <Link to="/how-it-works" className="hover:text-forest/70 transition-colors">Notes</Link>
          <Link to="/terms" className="hover:text-forest/70 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-forest/70 transition-colors">Privacy</Link>
        </div>
        <span className="font-[family-name:var(--font-serif)] italic normal-case tracking-normal text-forest/40">
          set in Fraunces &amp; EB Garamond
        </span>
      </div>
    </footer>
  )
}
