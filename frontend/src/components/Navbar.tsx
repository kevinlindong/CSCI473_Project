import { Link, useLocation } from 'react-router-dom'

/* ==========================================================================
   Navbar — minimal zen botanical header.
   No auth surface; every visitor is a guest. The brand mark links home and
   the three core destinations (corpus, library, editor) live in the middle.
   ========================================================================== */

type NavItem = { path: string; label: string }

const navLinks: NavItem[] = [
  { path: '/browse',         label: 'corpus'  },
  { path: '/library',        label: 'library' },
  { path: '/editor/scratch', label: 'editor'  },
]

const BRAND_WORDMARK = 'scholar'

export function Navbar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const location = useLocation()
  const isDark = variant === 'dark'

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
            alt="scholar logo"
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

          {/* ── Settings — quiet gear, no auth surface ─────────── */}
          <Link
            to="/settings"
            aria-label="Settings"
            className={`group flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
              location.pathname === '/settings'
                ? `${inkStrong} ${isDark ? 'bg-parchment/8' : 'bg-sage/18'}`
                : `${inkSoft} ${isDark ? 'hover:text-parchment hover:bg-parchment/5' : 'hover:text-forest hover:bg-sage/12'}`
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </nav>
      </div>
    </header>
  )
}
