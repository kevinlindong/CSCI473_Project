import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { KaTeX } from '../components/KaTeX'
import { useAuth } from '../hooks/useAuth'

/* ==========================================================================
   Login — minimal zen botanical.
   A quiet forest-deep panel on the left; a soft cream form on the right.
   ========================================================================== */

const floatingEquations = [
  { math: 'e^{i\\pi} + 1 = 0',                                  x: '10%', y: '20%' },
  { math: '\\nabla \\times \\mathbf{E} = -\\partial_t \\mathbf{B}', x: '68%', y: '14%' },
  { math: '\\int_0^\\infty e^{-x^2}dx = \\tfrac{\\sqrt{\\pi}}{2}', x: '8%',  y: '74%' },
  { math: 'P(A|B) = \\tfrac{P(B|A)P(A)}{P(B)}',                 x: '70%', y: '80%' },
]

export default function Login() {
  const { user, signInWithGoogle, signInWithEmail, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/home'

  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user, navigate, from])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const searchParams = new URLSearchParams(location.search)
  const [mode, setMode] = useState<'signin' | 'signup'>(
    searchParams.get('mode') === 'signup' ? 'signup' : 'signin'
  )

  async function handleGoogleSignIn() {
    setAuthError(null)
    await signInWithGoogle()
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setAuthError(null)
    setAuthLoading(true)
    const fn = mode === 'signup' ? signUp : signInWithEmail
    const { error } = await fn(email, password)
    setAuthLoading(false)
    if (error) setAuthError(error)
    else       navigate(from, { replace: true })
  }

  return (
    <main className="min-h-screen bg-cream flex relative overflow-hidden">
      {/* faint floating equations on the cream side */}
      {floatingEquations.map((eq, i) => (
        <div
          key={i}
          className="absolute opacity-[0.06] animate-float pointer-events-none select-none text-forest"
          style={{
            left: eq.x,
            top: eq.y,
            fontSize: 14,
            animationDelay: `${i * 0.5}s`,
            animationDuration: `${4 + i * 0.7}s`,
          }}
        >
          <KaTeX math={eq.math} />
        </div>
      ))}

      {/* ── LEFT PANEL — forest-deep, botanical ─────────────────────────── */}
      <aside className="hidden lg:flex w-[46%] bg-forest-deep relative items-center justify-center overflow-hidden">
        {/* soft botanical halos */}
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-sage/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[380px] h-[380px] rounded-full bg-bau-yellow/6 blur-3xl" />

        <div className="relative max-w-[440px] px-12 text-parchment">
          <Link to="/" className="inline-flex items-center gap-3 mb-14 group">
            <LogoLeafDark />
            <span className="font-[family-name:var(--font-display)] text-[32px] text-parchment leading-none">
              scholar
            </span>
          </Link>

          <h1 className="font-[family-name:var(--font-display)] text-[60px] leading-[1.02] tracking-[-0.015em] font-light text-parchment">
            a quiet
            <br />
            place to
            <br />
            <span className="font-normal">write mathematics.</span>
          </h1>

          <p className="mt-10 font-[family-name:var(--font-body)] text-[17px] leading-[1.75] text-parchment/70 max-w-[38ch]">
            No compile step. No clutter. Just the paper you mean to write,
            rising beside you as you type.
          </p>

          <div className="mt-14 flex items-center gap-5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-parchment/45">
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-sage" /> LaTeX</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-bau-yellow" /> Corpus</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-bau-red" /> Merges</span>
          </div>
        </div>
      </aside>

      {/* ── RIGHT PANEL — form ──────────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center px-8 py-12 relative">
        <div className="w-full max-w-[420px]">
          <Link to="/" className="inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-10 hover:text-forest transition-colors">
            <span>←</span> back home
          </Link>

          <h2 className="font-[family-name:var(--font-display)] text-[44px] leading-[1.02] text-forest font-light mb-3">
            {mode === 'signin' ? 'welcome back.' : 'begin a scholar.'}
          </h2>
          <p className="font-[family-name:var(--font-body)] text-[15px] leading-[1.7] text-forest/60 mb-10">
            {mode === 'signin'
              ? 'Sign in and the library will remember what you were reading.'
              : 'Create an account. The study is quiet and ready.'}
          </p>

          <button
            onClick={handleGoogleSignIn}
            className="w-full h-12 rounded-full bg-milk border border-forest/20 hover:border-forest/40 hover:bg-parchment/60 transition-all flex items-center justify-center gap-3 font-[family-name:var(--font-body)] text-[14px] text-forest font-medium"
          >
            <GoogleIcon />
            continue with Google
          </button>

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-forest/15" />
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/40">or</span>
            <span className="h-px flex-1 bg-forest/15" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <LabelledInput label="email" type="email" value={email} onChange={setEmail} placeholder="you@example.edu" />
            <LabelledInput label="password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

            {authError && (
              <div className="rounded-xl bg-bau-red/10 border border-bau-red/30 px-4 py-3 font-[family-name:var(--font-body)] text-[13px] text-bau-red">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !email || !password}
              className="w-full h-12 rounded-full bg-forest text-parchment font-[family-name:var(--font-body)] text-[14px] font-medium hover:bg-forest-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {authLoading ? '…' : (mode === 'signin' ? 'sign in' : 'create account')}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setAuthError(null) }}
              className="font-[family-name:var(--font-body)] text-[14px] text-forest/65 hover:text-forest transition-colors"
            >
              {mode === 'signin' ? 'new here? ' : 'have an account? '}
              <span className="underline decoration-forest/30 underline-offset-4">
                {mode === 'signin' ? 'begin a scholar →' : 'sign in ←'}
              </span>
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function LabelledInput({
  label, type, value, onChange, placeholder,
}: { label: string; type: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <div className="font-[family-name:var(--font-mono)] text-[9.5px] tracking-[0.28em] uppercase text-forest/55 mb-1.5">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 rounded-xl bg-milk border border-forest/20 px-4 font-[family-name:var(--font-body)] text-[14px] text-forest placeholder:text-forest/30 outline-none focus:border-forest/45 transition-colors"
      />
    </label>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.98 10.98 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function LogoLeafDark() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r="18" fill="#A3B18A" opacity="0.18" />
      <path d="M 20 8 C 12 12, 10 22, 14 30 C 22 28, 28 20, 26 10 C 24 11, 22 11, 20 8 Z"
            fill="#E9E4D4" opacity="0.9" />
      <path d="M 20 8 C 20 14, 18 22, 14 30" stroke="#A3B18A" strokeWidth="0.8" fill="none" />
    </svg>
  )
}
