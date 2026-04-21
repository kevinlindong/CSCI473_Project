import { Link } from 'react-router-dom'
import { KaTeX } from '../components/KaTeX'

/* ==========================================================================
   Landing — GMK Botanical. Minimal, zen, generous whitespace.
   Rounded corners, soft shadows. A scholar's garden.
   ========================================================================== */

export default function Landing() {
  return (
    <div className="min-h-screen bg-cream text-forest antialiased selection:bg-sage/30">
      <TopBar />
      <Hero />
      <Rooms />
      <Specimen />
      <Pipeline />
      <Colophon />
    </div>
  )
}

/* ── 1 · Top bar ─────────────────────────────────────────────────────── */

function TopBar() {
  return (
    <header className="relative z-20">
      <div className="max-w-6xl mx-auto px-8 pt-8 pb-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <LogoLeaf />
          <span className="font-[family-name:var(--font-editorial)] text-[30px] text-forest leading-none italic tracking-tight">
            Folio
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link to="/browse" className="hidden md:inline-flex h-10 px-4 items-center font-[family-name:var(--font-body)] text-[13px] text-forest/70 hover:text-forest rounded-full transition-colors">
            corpus
          </Link>
          <Link to="/editor/scratch" className="hidden md:inline-flex h-10 px-4 items-center font-[family-name:var(--font-body)] text-[13px] text-forest/70 hover:text-forest rounded-full transition-colors">
            manuscript
          </Link>
          <Link to="/how-it-works" className="hidden md:inline-flex h-10 px-4 items-center font-[family-name:var(--font-body)] text-[13px] text-forest/70 hover:text-forest rounded-full transition-colors">
            how it works
          </Link>

          <Link to="/home" className="bau-btn ml-3">
            enter the study
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </nav>
      </div>
    </header>
  )
}

function LogoLeaf() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r="18" fill="#E9E4D4" />
      <path d="M 20 8 C 12 12, 10 22, 14 30 C 22 28, 28 20, 26 10 C 24 11, 22 11, 20 8 Z"
            fill="#264635" opacity="0.92" />
      <path d="M 20 8 C 20 14, 18 22, 14 30" stroke="#A3B18A" strokeWidth="0.8" fill="none" />
    </svg>
  )
}

/* ── 2 · Hero  ───────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative">
      {/* quiet botanical backdrop */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-40 -right-20 w-[520px] h-[520px] rounded-full bg-sage/25" />
        <div className="absolute -bottom-10 -left-20 w-[340px] h-[340px] rounded-full bg-parchment/60" />
      </div>

      <div className="max-w-6xl mx-auto px-8 pt-24 pb-32 grid grid-cols-12 gap-10 items-center">
        {/* Left — the statement */}
        <div className="col-span-12 md:col-span-7 relative">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-forest/25" />
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/55">
              a scholar's notebook
            </span>
          </div>

          <h1 className="font-[family-name:var(--font-editorial)] text-[76px] md:text-[92px] leading-[0.98] tracking-[-0.02em] text-forest font-light">
            Where papers
            <br />
            <span className="italic">grow into</span>
            <br />
            <span className="font-normal">folios.</span>
          </h1>

          <p className="mt-10 font-[family-name:var(--font-editorial)] text-[18px] leading-[1.75] text-forest/70 max-w-[46ch]">
            Folio is a calm place to write mathematics and read the corpus — a
            LaTeX editor, a library, and a quiet reading room. No compile step,
            no clutter. Just ink and light.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/login" className="bau-btn">
              begin a folio
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link to="/browse" className="bau-btn bau-btn--ghost">
              browse the corpus
            </Link>
          </div>

          <div className="mt-14 flex items-center gap-4 text-[12px] text-forest/50 font-[family-name:var(--font-mono)] tracking-[0.2em]">
            <span>LATEX · NATIVE</span>
            <span className="w-1 h-1 rounded-full bg-forest/25" />
            <span>CITATIONS · PINNED</span>
            <span className="w-1 h-1 rounded-full bg-forest/25" />
            <span>NO COMPILE</span>
          </div>
        </div>

        {/* Right — a single folio preview */}
        <div className="col-span-12 md:col-span-5">
          <FolioPreview />
        </div>
      </div>
    </section>
  )
}

function FolioPreview() {
  return (
    <div className="relative">
      <div className="latex-frame paper-grain bg-milk px-8 py-10 offset-shadow">
        <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/40 mb-2">§ 2 · folio recto</div>
        <h3 className="font-[family-name:var(--font-editorial)] text-[26px] font-normal text-forest mb-4 leading-tight">
          On kernelised attention
        </h3>
        <p className="font-[family-name:var(--font-editorial)] text-[14px] leading-[1.8] text-forest/80">
          For any feature map <em>φ : ℝ<sup>d</sup> → ℝ<sup>r</sup></em>, define the
          linearised attention operator
        </p>
        <div className="my-5 flex justify-center text-forest">
          <KaTeX display math="A_{ij} = \frac{\phi(q_i)^{\top}\phi(k_j)}{\sum_{\ell}\phi(q_i)^{\top}\phi(k_\ell)}" />
        </div>
        <div className="mt-4 rounded-xl bg-sage/15 px-4 py-3 border-l-[3px] border-sage">
          <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.24em] uppercase text-forest/55 mb-0.5">Theorem 2.1</div>
          <div className="font-[family-name:var(--font-editorial)] italic text-[13px] text-forest/80 leading-snug">
            Positive random features give an unbiased estimate of softmax attention in <KaTeX math="\mathcal{O}(n)" /> time.
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between text-[10px] text-forest/40 font-[family-name:var(--font-mono)] tracking-[0.22em] uppercase">
          <span>Choromanski et al., 2020</span>
          <span>· 14 ·</span>
        </div>
      </div>

      {/* handwritten side-note */}
      <div className="absolute -right-4 top-12 hidden lg:block">
        <span className="font-[family-name:var(--font-display)] text-[19px] text-forest/55 inline-block -rotate-3">
          ← as you type ✦
        </span>
      </div>
    </div>
  )
}

/* ── 3 · Two rooms ───────────────────────────────────────────────────── */

function Rooms() {
  return (
    <section className="bg-parchment/40 py-28">
      <div className="max-w-6xl mx-auto px-8">
        <div className="mb-16 text-center">
          <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-3">two rooms</div>
          <h2 className="font-[family-name:var(--font-editorial)] text-[52px] leading-[1.02] text-forest italic font-light">
            a desk, and a library.
          </h2>
        </div>

        <div className="grid grid-cols-12 gap-8">
          <Room
            n="I."
            kicker="the desk"
            title="Manuscript"
            body="Compose in LaTeX. A typeset folio rises beside every keystroke. No build step, no staring at warnings. Equations bloom in place."
            link={{ to: '/editor/scratch', label: 'open the desk' }}
            accent="#264635"
          />
          <Room
            n="II."
            kicker="the reading room"
            title="Corpus"
            body="Ask in plain prose. The corpus answers with every claim pinned to its source — a calm librarian, never a hallucinator."
            link={{ to: '/browse', label: 'enter the library' }}
            accent="#7F9267"
          />
        </div>
      </div>
    </section>
  )
}

function Room({
  n, kicker, title, body, link, accent,
}: {
  n: string; kicker: string; title: string; body: string
  link: { to: string; label: string }; accent: string
}) {
  return (
    <article className="col-span-12 md:col-span-6">
      <Link to={link.to} className="block group">
        <div className="bau-card p-10 h-full transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(38,70,53,0.25)]">
          <div className="flex items-baseline justify-between mb-10">
            <span
              className="font-[family-name:var(--font-editorial)] text-[54px] leading-none italic"
              style={{ color: accent, opacity: 0.75 }}
            >
              {n}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/45">
              {kicker}
            </span>
          </div>

          <h3 className="font-[family-name:var(--font-editorial)] text-[44px] leading-[1] text-forest italic mb-5">
            {title}
          </h3>
          <p className="font-[family-name:var(--font-editorial)] text-[15.5px] leading-[1.75] text-forest/70 mb-10 max-w-[38ch]">
            {body}
          </p>

          <div
            className="inline-flex items-center gap-2 font-[family-name:var(--font-body)] text-[13px] text-forest/75 group-hover:gap-3 transition-all"
          >
            {link.label}
            <span className="inline-block" style={{ color: accent }}>→</span>
          </div>
        </div>
      </Link>
    </article>
  )
}

/* ── 4 · Specimen — LaTeX side by side ───────────────────────────────── */

function Specimen() {
  return (
    <section className="bg-forest text-parchment py-28 relative overflow-hidden">
      <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-sage/10" />
      <div className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-bau-yellow/5" />

      <div className="max-w-6xl mx-auto px-8 relative">
        <div className="mb-14 text-center">
          <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-parchment/50 mb-3">a specimen</div>
          <h3 className="font-[family-name:var(--font-editorial)] text-[48px] leading-[1.04] italic text-parchment font-light">
            plain LaTeX. nothing weird.
          </h3>
          <p className="mt-4 font-[family-name:var(--font-editorial)] text-[15.5px] leading-[1.7] text-parchment/65 max-w-[48ch] mx-auto">
            The source on one side, the typeset folio on the other —
            indistinguishable from what a journal would print.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-6 items-start">
          {/* code */}
          <div className="col-span-12 md:col-span-6">
            <div className="codebox">
              <div className="codebox-titlebar">
                <span className="codebox-dots"><span className="codebox-dot" /><span className="codebox-dot" /><span className="codebox-dot" /></span>
                <span className="ml-2">chapter_02.tex</span>
                <span className="ml-auto text-parchment/40">42 ln</span>
              </div>
              <div className="p-6 overflow-x-auto">
<pre className="whitespace-pre leading-[1.8]">
<span className="tok-com">% kernelised attention</span>{'\n'}
<span className="tok-tex">\documentclass</span>[<span className="tok-str">11pt</span>]&#123;<span className="tok-env">article</span>&#125;{'\n'}
<span className="tok-tex">\usepackage</span>&#123;<span className="tok-env">amsmath,amsthm</span>&#125;{'\n'}
{'\n'}
<span className="tok-tex">\section</span>&#123;<span className="tok-arg">On kernelised attention</span>&#125;{'\n'}
{'\n'}
For any <span className="tok-sym">$\phi : \mathbb&#123;R&#125;^d \to \mathbb&#123;R&#125;^r$</span>,{'\n'}
define{'\n'}
<span className="tok-tex">\begin</span>&#123;<span className="tok-env">equation</span>&#125;{'\n'}
{'  '}A_&#123;ij&#125; = <span className="tok-tex">\frac</span>&#123;<span className="tok-arg">\phi(q_i)^\top \phi(k_j)</span>&#125;{'\n'}
{'           '}&#123;<span className="tok-arg">\sum_\ell \phi(q_i)^\top \phi(k_\ell)</span>&#125;.{'\n'}
<span className="tok-tex">\end</span>&#123;<span className="tok-env">equation</span>&#125;
</pre>
              </div>
            </div>
          </div>

          {/* rendered */}
          <div className="col-span-12 md:col-span-6">
            <div className="bg-milk text-forest rounded-2xl px-8 py-10 paper-grain">
              <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/40 mb-2">§ 2</div>
              <h4 className="font-[family-name:var(--font-editorial)] text-[28px] font-normal text-forest mb-4">
                On kernelised attention
              </h4>
              <p className="font-[family-name:var(--font-editorial)] text-[14.5px] leading-[1.8] text-forest/80">
                For any feature map <em>φ : ℝ<sup>d</sup> → ℝ<sup>r</sup></em>, define
              </p>
              <div className="my-5 flex justify-center">
                <KaTeX display math="A_{ij} = \frac{\phi(q_i)^{\top}\phi(k_j)}{\sum_{\ell}\phi(q_i)^{\top}\phi(k_\ell)}\,." />
              </div>
            </div>
          </div>
        </div>

        {/* supporting equations */}
        <div className="mt-10 grid grid-cols-12 gap-4">
          <SpecimenEq label="Bayes" math="P(H \mid D) = \frac{P(D \mid H)\, P(H)}{\int P(D \mid H')\, P(H')\, dH'}" />
          <SpecimenEq label="ELBO"  math="\mathcal{L} = \mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)] - \mathrm{KL}(q_\phi \,\Vert\, p)" />
          <SpecimenEq label="Diffusion" math="x_{t-1} = \tfrac{1}{\sqrt{\alpha_t}}\!\left(x_t - \tfrac{1-\alpha_t}{\sqrt{1-\bar\alpha_t}}\,\varepsilon_\theta\right) + \sigma_t z" />
        </div>
      </div>
    </section>
  )
}

function SpecimenEq({ label, math }: { label: string; math: string }) {
  return (
    <div className="col-span-12 md:col-span-4 bg-milk/95 text-forest rounded-2xl p-5">
      <div className="font-[family-name:var(--font-mono)] text-[9.5px] tracking-[0.3em] uppercase text-forest/55 mb-3">
        {label}
      </div>
      <div className="overflow-x-auto">
        <KaTeX display math={math} />
      </div>
    </div>
  )
}

/* ── 5 · Pipeline — how it works ─────────────────────────────────────── */

function Pipeline() {
  const steps = [
    { n: 'one',   title: 'Draft in LaTeX',    body: 'Type the paper you mean to write. Folio typesets as you type, no compile step, no warnings.' },
    { n: 'two',   title: 'Ask the corpus',    body: 'Mid-sentence, query the library in plain prose. Every claim returns with its source attached.' },
    { n: 'three', title: 'Fork, merge, read', body: 'Others fork your folio, open merge requests, leave marginalia. The paper breathes with its readers.' },
  ]
  return (
    <section className="py-28">
      <div className="max-w-6xl mx-auto px-8">
        <div className="mb-16 text-center">
          <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-3">how the garden grows</div>
          <h3 className="font-[family-name:var(--font-editorial)] text-[48px] leading-[1.04] italic text-forest font-light">
            three quiet moves.
          </h3>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {steps.map((s, i) => (
            <div key={i} className="col-span-12 md:col-span-4 bau-card p-8 hover:-translate-y-1 transition-all">
              <div className="font-[family-name:var(--font-display)] text-[28px] text-sage-deep mb-4">{s.n}.</div>
              <h4 className="font-[family-name:var(--font-editorial)] text-[26px] italic text-forest mb-4">{s.title}</h4>
              <p className="font-[family-name:var(--font-editorial)] text-[14.5px] leading-[1.75] text-forest/70">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── 6 · Colophon ────────────────────────────────────────────────────── */

function Colophon() {
  return (
    <footer className="bg-forest-deep text-parchment py-20">
      <div className="max-w-6xl mx-auto px-8">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="max-w-[30ch]">
            <div className="flex items-center gap-3 mb-4">
              <LogoLeaf />
              <span className="font-[family-name:var(--font-editorial)] italic text-[26px] text-parchment leading-none">Folio</span>
            </div>
            <p className="font-[family-name:var(--font-editorial)] text-[14px] leading-[1.75] text-parchment/60">
              A calm place to write mathematics. Built by scholars for scholars.
            </p>
          </div>

          <ColLinks title="the study" links={[
            { to: '/home', label: 'home' },
            { to: '/editor/scratch', label: 'begin a folio' },
            { to: '/browse', label: 'browse the corpus' },
          ]} />
          <ColLinks title="about" links={[
            { to: '/how-it-works', label: 'how it works' },
            { to: '/terms', label: 'terms' },
            { to: '/privacy', label: 'privacy' },
          ]} />
        </div>

        <div className="mt-16 pt-6 border-t border-parchment/15 flex flex-wrap items-center justify-between gap-4 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.22em] text-parchment/45">
          <span>© 2026 FOLIO · A SCHOLAR'S NOTEBOOK</span>
          <span>SET IN FRAUNCES, ARCHIVO &amp; GAMJA FLOWER</span>
        </div>
      </div>
    </footer>
  )
}

function ColLinks({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-parchment/45 mb-5">{title}</div>
      <ul className="space-y-2.5">
        {links.map(l => (
          <li key={l.to}>
            <Link to={l.to} className="font-[family-name:var(--font-editorial)] italic text-[15px] text-parchment/75 hover:text-parchment transition-colors">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

