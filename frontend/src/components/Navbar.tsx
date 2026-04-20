import { useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2)
}

const navLinks = [
  { path: '/home', label: 'Study' },
  { path: '/browse', label: 'Corpus' },
  { path: '/editor/scratch', label: 'Manuscript' },
]

const profileDropdownLinks = [
  { path: '/profile', label: 'Profile' },
  { path: '/settings', label: 'Settings' },
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

  const base = isDark
    ? 'border-sage/10 bg-forest/95 text-parchment'
    : 'border-forest/10 bg-cream/85 text-forest'

  const ink = isDark ? 'text-parchment' : 'text-forest'
  const inkSoft = isDark ? 'text-parchment/50' : 'text-forest/55'
  const accentLine = isDark ? 'bg-parchment/60' : 'bg-forest/70'

  return (
    <header className={`border-b backdrop-blur-sm sticky top-0 z-50 ${base}`}>
      <div className="max-w-7xl mx-auto flex items-baseline justify-between px-8 h-16">
        {/* Wordmark — a single italic word and a quiet dot */}
        <Link
          to="/home"
          onClick={e => { if (location.pathname === '/home') e.preventDefault() }}
          className="flex items-baseline gap-2 self-center hover:opacity-85 transition-opacity"
        >
          <span className={`font-[family-name:var(--font-editorial,var(--font-display))] italic text-[22px] tracking-tight leading-none ${ink}`}>
            Folio
          </span>
          <span className="w-[5px] h-[5px] rounded-full bg-sienna/80" />
        </Link>

        {/* Links — minimal italic serif, hairline underline for active */}
        <nav className="flex items-center gap-8 self-center">
          {navLinks.map(link => {
            const active =
              location.pathname === link.path ||
              (link.path === '/editor/scratch' && location.pathname.startsWith('/editor/'))
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`relative font-[family-name:var(--font-editorial,var(--font-serif))] italic text-[15px] transition-colors pb-[2px] ${
                  active
                    ? ink
                    : `${inkSoft} ${isDark ? 'hover:text-parchment' : 'hover:text-forest'}`
                }`}
              >
                {link.label}
                <span
                  className={`absolute left-0 right-0 -bottom-[1px] h-px ${accentLine} transition-opacity ${
                    active ? 'opacity-90' : 'opacity-0'
                  }`}
                />
              </Link>
            )
          })}

          <span className={`h-4 w-px ${isDark ? 'bg-parchment/15' : 'bg-forest/15'}`} />

          {/* Profile — a quiet mark. Works with or without a profile. */}
          <div
            className="relative flex items-center"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <button
              onClick={() => navigate('/profile')}
              aria-label="Profile"
              className={`group w-8 h-8 rounded-full flex items-center justify-center text-[10px] transition-all cursor-pointer ${
                isDark
                  ? 'border border-parchment/30 hover:border-parchment/60 text-parchment/80'
                  : 'border border-forest/25 hover:border-forest/55 text-forest/75'
              }`}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name ?? 'profile'}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : profile?.display_name ? (
                <span className="font-[family-name:var(--font-serif)] italic text-[13px] leading-none">
                  {getInitials(profile.display_name)}
                </span>
              ) : (
                <span className="font-[family-name:var(--font-editorial,var(--font-serif))] italic text-[14px] leading-none">
                  一
                </span>
              )}
            </button>

            <div
              className={`absolute right-0 top-full mt-3 w-48 border overflow-hidden
                transition-all duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] origin-top-right
                ${isDark ? 'bg-forest border-sage/15' : 'bg-parchment border-forest/10'}
                ${dropdownOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}
            >
              <div className={`px-4 py-3 border-b text-[11px] font-[family-name:var(--font-mono)] tracking-[0.28em] uppercase ${isDark ? 'border-sage/10 text-parchment/35' : 'border-forest/10 text-forest/35'}`}>
                {profile?.display_name || user?.email || 'guest'}
              </div>

              {profileDropdownLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setDropdownOpen(false)}
                  className={`block px-4 py-3 font-[family-name:var(--font-editorial,var(--font-serif))] italic text-[15px] border-b transition-colors ${
                    isDark
                      ? 'border-sage/8 text-parchment/70 hover:text-parchment hover:bg-parchment/[0.04]'
                      : 'border-forest/[0.06] text-forest/65 hover:text-forest hover:bg-forest/[0.03]'
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
                  className={`w-full text-left px-4 py-3 font-[family-name:var(--font-editorial,var(--font-serif))] italic text-[15px] transition-colors cursor-pointer ${
                    isDark
                      ? 'text-parchment/45 hover:text-parchment/80 hover:bg-parchment/[0.04]'
                      : 'text-forest/45 hover:text-forest/70 hover:bg-forest/[0.03]'
                  }`}
                >
                  sign out
                </button>
              )}

              {!user && (
                <Link
                  to="/login"
                  onClick={() => setDropdownOpen(false)}
                  className={`block px-4 py-3 font-[family-name:var(--font-editorial,var(--font-serif))] italic text-[15px] transition-colors ${
                    isDark
                      ? 'text-parchment/45 hover:text-parchment/80 hover:bg-parchment/[0.04]'
                      : 'text-forest/45 hover:text-forest/70 hover:bg-forest/[0.03]'
                  }`}
                >
                  sign in
                </Link>
              )}
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
