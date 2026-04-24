import { useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

/* ==========================================================================
   Navbar — minimal zen botanical header.
   Fixed-width layout so components never shift between pages.
   Profile is pinned to "guest" — no auth state leaks into the UI.
   ========================================================================== */

type NavItem = { path: string; label: string }

const navLinks: NavItem[] = [
  { path: '/browse',         label: 'corpus'     },
  { path: '/library',        label: 'library'    },
  { path: '/editor/scratch', label: 'editor' },
]

const profileDropdownLinks = [
  { path: '/profile',  label: 'profile'  },
  { path: '/settings', label: 'settings' },
]
const BRAND_WORDMARK = 'Scholar'
const GUEST_LABEL = 'guest'

export function Navbar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isDark = variant === 'dark'

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
    setDropdownOpen(true)
  }
  const handleMouseLeave = () => {
    hideTimeout.current = setTimeout(() => setDropdownOpen(false), 120)
  }

  const chrome = isDark
    ? 'bg-[#0c1e16]/95 text-parchment border-b border-parchment/10 backdrop-blur'
    : 'bg-cream/85 text-forest border-b border-forest/12 backdrop-blur'
  const inkSoft = isDark ? 'text-parchment/55' : 'text-forest/55'
  const inkStrong = isDark ? 'text-parchment' : 'text-forest'

  return (
    <header className={`sticky top-0 z-50 ${chrome}`}>
      <div className="w-full flex items-center justify-between px-4 h-[64px]">
        {/* ── Logo: custom botanical mark + Gamja Flower wordmark ── */}
        <Link
          to="/home"
          onClick={e => { if (location.pathname === '/home') e.preventDefault() }}
          className="scholar-wordmark-group flex items-center gap-3 self-center hover:opacity-90 transition-opacity"
        >
          <img
            src="/logoCB.png"
            alt="Scholar logo"
            className="w-9 h-9 object-contain shrink-0"
          />
          <span className={`font-[family-name:var(--font-display)] text-[24px] leading-none translate-y-[1px] ${inkStrong}`}>
            {BRAND_WORDMARK.split('').map((ch, idx) => (
              <span
                key={`${ch}-${idx}`}
                className="scholar-wave-letter inline-block"
                style={{ animationDelay: `${idx * 55}ms` }}
              >
                {ch}
              </span>
            ))}
          </span>
        </Link>

        {/* ── Links ─────────────────────────────────────────────── */}
        <nav className="flex items-center gap-1 self-center">
          {navLinks.map(link => {
            const active =
              location.pathname === link.path ||
              (link.path === '/editor/scratch' && location.pathname.startsWith('/editor/'))
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`group relative flex items-center justify-center px-4 h-9 rounded-full font-[family-name:var(--font-body)] text-[14px] transition-colors ${
                  active
                    ? `${inkStrong} ${isDark ? 'bg-parchment/8' : 'bg-sage/18'}`
                    : `${inkSoft} ${isDark ? 'hover:text-parchment hover:bg-parchment/5' : 'hover:text-forest hover:bg-sage/12'}`
                }`}
              >
                {link.label}
              </Link>
            )
          })}

          <span className={`h-5 w-px mx-3 ${isDark ? 'bg-parchment/15' : 'bg-forest/15'}`} />

          {/* ── Profile — locked to guest ──────────────────────── */}
          <div
            className="relative flex items-center"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <button
              onClick={() => navigate('/profile')}
              aria-label="Guest profile"
              className={`group relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-[10px] transition-all cursor-pointer ${
                isDark
                  ? 'bg-parchment/10 hover:bg-parchment/20 text-parchment ring-1 ring-parchment/15'
                  : 'bg-forest text-parchment hover:-translate-y-0.5 ring-1 ring-forest/15'
              }`}
            >
              <span className="font-[family-name:var(--font-display)] text-[14px] leading-none">G</span>
            </button>

            <div
              className={`absolute right-0 top-full mt-3 w-60 rounded-2xl overflow-hidden border
                transition-all duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] origin-top-right
                ${isDark ? 'bg-forest-deep border-parchment/12' : 'bg-milk border-forest/15'}
                ${dropdownOpen
                  ? 'opacity-100 translate-y-0 pointer-events-auto shadow-[0_18px_38px_-18px_rgba(38,70,53,0.28)]'
                  : 'opacity-0 -translate-y-1 pointer-events-none'}`}
            >
              <div className={`px-5 py-4 border-b ${isDark ? 'border-parchment/10' : 'border-forest/10'}`}>
                <span className={`block font-[family-name:var(--font-mono)] text-[9.5px] tracking-[0.28em] uppercase truncate ${isDark ? 'text-parchment/45' : 'text-forest/50'}`}>
                  {GUEST_LABEL}
                </span>
                <span className={`block font-[family-name:var(--font-display)] text-[18px] mt-1.5 leading-none ${inkStrong}`}>
                  hello there —
                </span>
              </div>

              {profileDropdownLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setDropdownOpen(false)}
                  className={`block px-5 py-2.5 font-[family-name:var(--font-body)] text-[14px] transition-colors ${
                    isDark
                      ? 'text-parchment/70 hover:text-parchment hover:bg-parchment/[0.06]'
                      : 'text-forest/70 hover:text-forest hover:bg-sage/15'
                  } ${location.pathname === link.path ? (isDark ? 'text-parchment' : 'text-forest') : ''}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}

