import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { useDrafts, readDraftSource } from '../hooks/useDrafts'

/* ==========================================================================
   GuestProfile — auth-free profile page driven entirely by local draft
   activity. Mirrors the visual language of Profile.tsx (botanical zen card
   on the left, ledger on the right) but every figure is computed from the
   localStorage drafts the guest has actually worked on.
   ========================================================================== */

function wordCount(src: string): number {
  let body = src
  const beginIdx = body.search(/\\begin\{document\}/)
  if (beginIdx !== -1) body = body.slice(beginIdx + '\\begin{document}'.length)
  const endIdx = body.search(/\\end\{document\}/)
  if (endIdx !== -1) body = body.slice(0, endIdx)

  body = body
    .replace(/(^|[^\\])%[^\n]*/g, '$1')
    .replace(/\\begin\{(equation|align|gather|multline|displaymath|eqnarray)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\begin\{(verbatim|lstlisting|tikzpicture|figure|table)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\(cite|citep|citet|ref|eqref|pageref|label|includegraphics|input|include|bibliography|bibliographystyle|usepackage|documentclass|today|maketitle)\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/\\(begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')

  return body.trim().split(/\s+/).filter(Boolean).length
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatJoinDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// 7×52 contribution grid keyed by day. Bucket each draft's updatedAt into the
// matching cell so the heatmap reflects real local activity.
function buildContributionGrid(drafts: Array<{ updatedAt: number }>): number[] {
  const cells = new Array(7 * 52).fill(0)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayMs = 24 * 60 * 60 * 1000
  for (const d of drafts) {
    const when = new Date(d.updatedAt)
    const whenDay = new Date(when.getFullYear(), when.getMonth(), when.getDate())
    const daysAgo = Math.floor((today.getTime() - whenDay.getTime()) / dayMs)
    if (daysAgo < 0 || daysAgo >= 7 * 52) continue
    // Layout: oldest on the left, today at the bottom-right.
    const col = 51 - Math.floor(daysAgo / 7)
    const row = (today.getDay() - (daysAgo % 7) + 7) % 7
    cells[row * 52 + col] += 1
  }
  return cells
}

function gridColor(count: number): string {
  if (count === 0) return 'rgba(38,70,53,0.08)'
  if (count === 1) return 'rgba(163,177,138,0.55)'
  if (count === 2) return 'rgba(163,177,138,0.85)'
  return '#7F9267'
}

const GUEST_INTERESTS = ['latex', 'reading', 'writing', 'research']

export default function GuestProfile() {
  const { drafts } = useDrafts()

  const stats = useMemo(() => {
    let totalWords = 0
    let totalChars = 0
    for (const d of drafts) {
      const src = readDraftSource(d.id) ?? ''
      totalWords += wordCount(src)
      totalChars += src.length
    }
    const sessionDays = new Set(
      drafts.map(d => new Date(d.updatedAt).toISOString().slice(0, 10))
    ).size
    return {
      drafts: drafts.length,
      words: totalWords,
      chars: totalChars,
      sessions: sessionDays,
    }
  }, [drafts])

  const contributionCells = useMemo(() => buildContributionGrid(drafts), [drafts])
  const recent = useMemo(() => drafts.slice(0, 8), [drafts])
  const oldestDraftMs = useMemo(
    () => (drafts.length ? Math.min(...drafts.map(d => d.createdAt)) : Date.now()),
    [drafts]
  )

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Navbar variant="light" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-12">

          {/* Masthead */}
          <div className="flex items-baseline gap-4 mb-10">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">
              profile · guest
            </span>
            <span className="h-px flex-1 bg-forest/15" />
            <span className="font-[family-name:var(--font-body)] text-[15px] text-forest/55">
              who's writing today?
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">

            {/* ── LEFT — guest card ──────────────────────────────── */}
            <div>
              <div className="relative bg-milk border border-forest/15 rounded-2xl overflow-hidden">
                <div className="h-[2px] bg-gradient-to-r from-sage-deep via-sage to-transparent opacity-60" />

                <div className="p-7">
                  <div className="flex flex-col items-center mb-6">
                    <div className="w-24 h-24 bg-forest flex items-center justify-center text-[28px] font-[family-name:var(--font-display)] text-parchment rounded-full ring-1 ring-forest/15">
                      g
                    </div>

                    <h1 className="font-[family-name:var(--font-display)] text-[30px] text-forest mt-5 leading-none">
                      guest scholar
                    </h1>
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-forest/55 mt-2">
                      @guest
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/40 mt-0.5">
                      no account · local-only
                    </span>
                  </div>

                  <div className="space-y-2 mb-6 pt-4 border-t border-forest/15">
                    <MetaRow label="Mode" value="browse + draft" />
                    <MetaRow label="Storage" value="this device" />
                    <MetaRow label="Joined" value={formatJoinDate(oldestDraftMs)} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <StatCell label="Drafts"   value={String(stats.drafts)}   color="#2C4B70" />
                    <StatCell label="Words"    value={stats.words.toLocaleString()} color="#A3B18A" />
                    <StatCell label="Sessions" value={String(stats.sessions)} color="#E0B13A" />
                    <StatCell label="Letters"  value={stats.chars.toLocaleString()} color="#C85544" glyph="✦" />
                  </div>

                  <div className="pt-4 border-t border-forest/15">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/50">
                        Interests
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/40">
                        guest defaults
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {GUEST_INTERESTS.map(tag => (
                        <span
                          key={tag}
                          className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em] text-forest bg-sage/20 border border-sage/40 rounded-full px-2.5 py-0.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="font-[family-name:var(--font-body)] text-[12px] text-forest/55 leading-relaxed">
                      sign in to claim a handle, sync drafts across devices, and unlock corpus tags.
                    </p>
                  </div>

                  <Link
                    to="/login"
                    className="bau-btn bau-btn--ghost w-full justify-center mt-6 !py-2.5 !text-[11px]"
                  >
                    Sign in to upgrade
                  </Link>
                </div>
              </div>
            </div>

            {/* ── RIGHT — ledger ─────────────────────────────────── */}
            <div className="space-y-10">

              {/* Quick links */}
              <section>
                <SectionHeader kicker="navigate" title="quick links" accent="#2C4B70" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <QuickLink to="/library"        kicker="library"    label="my drafts" />
                  <QuickLink to="/browse"         kicker="corpus"     label="browse papers" />
                  <QuickLink to="/editor/scratch" kicker="editor"     label="open scratch" />
                </div>
              </section>

              {/* Contribution grid */}
              <section>
                <SectionHeader kicker="activity" title="contribution grid" accent="#A3B18A" />
                <div className="bg-milk border border-forest/15 rounded-2xl p-6">
                  <div className="grid grid-rows-7 grid-flow-col gap-[3px] auto-cols-min">
                    {contributionCells.map((count, i) => (
                      <div
                        key={i}
                        className="w-[10px] h-[10px] rounded-[3px]"
                        style={{ backgroundColor: gridColor(count) }}
                        title={count > 0 ? `${count} update${count === 1 ? '' : 's'}` : ''}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-4 justify-end">
                    <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40">less</span>
                    {[0, 1, 2, 3].map(l => (
                      <div
                        key={l}
                        className="w-[10px] h-[10px] rounded-[3px]"
                        style={{ backgroundColor: gridColor(l) }}
                      />
                    ))}
                    <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40">more</span>
                  </div>
                </div>
              </section>

              {/* Recent drafts */}
              <section>
                <SectionHeader kicker="recent" title="draft activity" accent="#C85544" />
                {recent.length === 0 ? (
                  <div className="bg-milk border border-forest/15 border-dashed rounded-2xl py-12 text-center">
                    <span className="font-[family-name:var(--font-display)] text-[26px] text-forest/50 leading-none">
                      a quiet day —
                    </span>
                    <p className="font-[family-name:var(--font-body)] text-[13.5px] text-forest/50 mt-3">
                      open <Link to="/editor/scratch" className="underline decoration-forest/40 hover:decoration-forest">the editor</Link> to start your first draft.
                    </p>
                  </div>
                ) : (
                  <ol className="border border-forest/15 rounded-2xl divide-y divide-forest/10 bg-milk overflow-hidden">
                    {recent.map(d => {
                      const isNew = d.createdAt === d.updatedAt
                      return (
                        <li key={d.id}>
                          <Link
                            to={`/editor/${d.id}`}
                            className="grid grid-cols-12 gap-4 items-center px-6 py-4 hover:bg-parchment/40 transition-colors group"
                          >
                            <span className="col-span-1 flex items-center justify-center">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: isNew ? '#7F9267' : 'rgba(38,70,53,0.35)' }}
                              />
                            </span>
                            <div className="col-span-12 sm:col-span-8 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <ActionBadge action={isNew ? 'created' : 'updated'} />
                                <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] uppercase text-forest/55">
                                  local draft
                                </span>
                              </div>
                              <p className="font-[family-name:var(--font-body)] text-[15px] text-forest group-hover:text-forest-ink transition-colors truncate">
                                {d.title || <span className="text-forest/45">untitled scholar</span>}
                              </p>
                            </div>
                            <span className="col-span-12 sm:col-span-3 sm:text-right font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-forest/45">
                              {timeAgo(d.updatedAt)}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function SectionHeader({ kicker, title, accent }: { kicker: string; title: string; accent: string }) {
  return (
    <div className="flex items-baseline gap-4 mb-5">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
      <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">{kicker}</span>
      <h2 className="font-[family-name:var(--font-display)] text-[26px] text-forest leading-none">{title}</h2>
      <span className="h-px flex-1 bg-forest/15 translate-y-[-4px]" />
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/50">{label}</span>
      <span className="font-[family-name:var(--font-body)] text-[13px] text-forest/80">{value}</span>
    </div>
  )
}

function StatCell({ label, value, color, glyph }: { label: string; value: string; color: string; glyph?: string }) {
  return (
    <div className="relative rounded-2xl bg-parchment/50 p-4 text-center border border-forest/10">
      <span className="block font-[family-name:var(--font-display)] text-[26px] text-forest leading-none">
        {glyph && <span className="mr-0.5" style={{ color }}>{glyph}</span>}{value}
      </span>
      <span className="block font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/50 mt-2">
        {label}
      </span>
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const palette: Record<string, { ring: string; fg: string }> = {
    updated: { ring: 'rgba(44,75,112,0.4)',    fg: '#23395a' },
    created: { ring: 'rgba(127,146,103,0.55)', fg: '#3d5735' },
  }
  const p = palette[action] || palette.updated
  return (
    <span
      className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase px-2 py-[2px] rounded-full border"
      style={{ borderColor: p.ring, color: p.fg, background: 'rgba(233,228,212,0.5)' }}
    >
      {action}
    </span>
  )
}

function QuickLink({ to, kicker, label }: { to: string; kicker: string; label: string }) {
  return (
    <Link
      to={to}
      className="block bg-milk border border-forest/15 rounded-2xl px-5 py-4 hover:border-forest/35 hover:bg-parchment/40 transition-colors group"
    >
      <span className="block font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/50 mb-1.5">
        {kicker}
      </span>
      <span className="block font-[family-name:var(--font-display)] text-[20px] text-forest leading-none group-hover:text-forest-ink transition-colors">
        {label} →
      </span>
    </Link>
  )
}
