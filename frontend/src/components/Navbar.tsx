import { useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/* ==========================================================================
   Navbar — minimal zen botanical header.
   • Soft cream chrome, single hairline border, organic leaf mark.
   • Gamja Flower wordmark, lowercase nav links with restrained sage dot
     on active.
   ========================================================================== */

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2)
}

type NavItem = { path: string; label: string }

const navLinks: NavItem[] = [
  { path: '/home',           label: 'study'      },
  { path: '/browse',         label: 'corpus'     },
  { path: '/editor/scratch', label: 'manuscript' },
]

const profileDropdownLinks = [
  { path: '/profile',  label: 'profile'  },
  { path: '/settings', label: 'settings' },
]

export function Navbar({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, profile, user } = useAuth()
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
      <div className="max-w-7xl mx-auto flex items-center justify-between px-8 h-[64px]">
        {/* ── Logo: organic leaf + Gamja Flower wordmark ──────────── */}
        <Link
          to="/home"
          onClick={e => { if (location.pathname === '/home') e.preventDefault() }}
          className="flex items-center gap-3 self-center hover:opacity-90 transition-opacity"
        >
          <LogoLeaf dark={isDark} />
          <span className={`font-[family-name:var(--font-display)] text-[24px] leading-none translate-y-[1px] ${inkStrong}`}>
            Folio
          </span>
          <span className={`hidden sm:inline-block font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase translate-y-[1px] ml-1 ${isDark ? 'text-parchment/40' : 'text-forest/40'}`}>
            · a scholar's notebook
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
                className={`group relative flex items-center gap-2 px-4 h-9 rounded-full font-[family-name:var(--font-body)] text-[14px] transition-all ${
                  active
                    ? `${inkStrong} ${isDark ? 'bg-parchment/8' : 'bg-sage/18'}`
                    : `${inkSoft} ${isDark ? 'hover:text-parchment hover:bg-parchment/5' : 'hover:text-forest hover:bg-sage/12'}`
                }`}
              >
                {active && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: isDark ? '#A3B18A' : '#7F9267' }}
                  />
                )}
                {link.label}
              </Link>
            )
          })}

          <span className={`h-5 w-px mx-3 ${isDark ? 'bg-parchment/15' : 'bg-forest/15'}`} />

          {/* ── Profile avatar ─────────────────────────────────── */}
          <div
            className="relative flex items-center"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <button
              onClick={() => navigate('/profile')}
              aria-label="Profile"
              className={`group relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-[10px] transition-all cursor-pointer ${
                isDark
                  ? 'bg-parchment/10 hover:bg-parchment/20 text-parchment ring-1 ring-parchment/15'
                  : 'bg-forest text-parchment hover:-translate-y-0.5 ring-1 ring-forest/15'
              }`}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name ?? 'profile'}
                  className="w-full h-full object-cover"
                />
              ) : profile?.display_name ? (
                <span className="font-[family-name:var(--font-display)] text-[14px] leading-none">
                  {getInitials(profile.display_name)}
                </span>
              ) : (
                <span className="font-[family-name:var(--font-display)] text-[16px] leading-none">·</span>
              )}
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
                  {profile?.display_name || user?.email || 'guest scholar'}
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

              {user && (
                <button
                  onClick={async () => {
                    setDropdownOpen(false)
                    await signOut()
                    navigate('/')
                  }}
                  className={`w-full text-left px-5 py-2.5 font-[family-name:var(--font-body)] text-[14px] transition-colors cursor-pointer border-t ${
                    isDark
                      ? 'border-parchment/8 text-parchment/55 hover:text-parchment hover:bg-parchment/[0.04]'
                      : 'border-forest/10 text-forest/55 hover:text-forest hover:bg-sage/12'
                  }`}
                >
                  sign out ←
                </button>
              )}

              {!user && (
                <Link
                  to="/login"
                  onClick={() => setDropdownOpen(false)}
                  className={`block px-5 py-2.5 font-[family-name:var(--font-body)] text-[14px] transition-colors border-t ${
                    isDark
                      ? 'border-parchment/8 text-parchment/55 hover:text-parchment hover:bg-parchment/[0.04]'
                      : 'border-forest/10 text-forest/60 hover:text-forest hover:bg-sage/12'
                  }`}
                >
                  sign in →
                </Link>
              )}
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}

/* Organic leaf — soft botanical mark to replace the Bauhaus primitives. */
function LogoLeaf({ dark }: { dark: boolean }) {
  const ink   = dark ? '#E9E4D4' : '#264635'
  const halo  = dark ? '#A3B18A' : '#A3B18A'
  const vein  = dark ? '#A3B18A' : '#A3B18A'
  return (
    <svg width="30" height="30" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r="18" fill={halo} opacity={dark ? 0.16 : 0.18} />
      <path
        d="M 20 8 C 12 12, 10 22, 14 30 C 22 28, 28 20, 26 10 C 24 11, 22 11, 20 8 Z"
        fill={ink}
        opacity={dark ? 0.85 : 0.9}
      />
      <path
        d="M 20 8 C 20 14, 18 22, 14 30"
        stroke={vein}
        strokeWidth="0.8"
        fill="none"
        opacity={0.85}
      />
    </svg>
  )
}
