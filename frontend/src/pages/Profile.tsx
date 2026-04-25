import { useState, useEffect } from 'react'
import { Navbar } from '../components/Navbar'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

/* ==========================================================================
   Profile — minimal zen botanical scholar card.
   Left  : profile card with soft sage accent + rounded parchment cells.
   Right : activity ledger + contribution grid in calm rounded panels.
   ========================================================================== */

interface CountStats {
  noots: number
  merges: number
  nootbooks: number
}

interface ActivityItem {
  id: string
  title: string
  repo_title: string
  updated_at: string
  created_at: string
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatJoinDate(iso)
}

function ActionBadge({ action }: { action: string }) {
  const palette: Record<string, { ring: string; fg: string }> = {
    merged:    { ring: 'rgba(163,177,138,0.55)', fg: '#264635' },
    pushed:    { ring: 'rgba(38,70,53,0.35)',    fg: '#264635' },
    commented: { ring: 'rgba(224,177,58,0.45)',  fg: '#6b5418' },
    forked:    { ring: 'rgba(139,110,78,0.45)',  fg: '#5a4632' },
    updated:   { ring: 'rgba(44,75,112,0.4)',    fg: '#23395a' },
    created:   { ring: 'rgba(127,146,103,0.55)', fg: '#3d5735' },
  }
  const p = palette[action] || { ring: 'rgba(38,70,53,0.35)', fg: '#264635' }
  return (
    <span
      className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase px-2 py-[2px] rounded-full border"
      style={{ borderColor: p.ring, color: p.fg, background: 'rgba(233,228,212,0.5)' }}
    >
      {action}
    </span>
  )
}

export default function Profile() {
  const { profile, user } = useAuth()
  const [counts, setCounts] = useState<CountStats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)

  const [editing, setEditing] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draft, setDraft] = useState({ full_name: '', display_name: '', organization: '' })
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [tagInputVal, setTagInputVal] = useState('')

  const [profileTags, setProfileTags] = useState<string[]>([])
  const [inlineTagInput, setInlineTagInput] = useState('')
  const [tagsSaving, setTagsSaving] = useState(false)

  useEffect(() => {
    if (profile) setProfileTags(profile.tags ?? [])
  }, [profile])

  function openEdit() {
    setEditing(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setEditVisible(true)))
  }
  function closeEdit() {
    setEditVisible(false)
    setSaveError(null)
    setTimeout(() => setEditing(false), 220)
  }

  useEffect(() => {
    if (profile && editing && editVisible) {
      setDraft({
        full_name:    profile.full_name    ?? '',
        display_name: profile.display_name ?? '',
        organization: profile.organization ?? '',
      })
      setDraftTags(profile.tags ?? [])
      setTagInputVal('')
    }
  }, [editing, editVisible, profile])

  useEffect(() => {
    if (!user) return

    async function loadData() {
      const [nootsRes, mergesRes, nootbooksRes, activityRes] = await Promise.all([
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user!.id),
        supabase
          .from('merge_requests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('status', 'merged'),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('owner_user_id', user!.id),
        supabase
          .from('documents')
          .select('id, title, updated_at, created_at, repositories(title)')
          .eq('user_id', user!.id)
          .order('updated_at', { ascending: false })
          .limit(10),
      ])

      setCounts({
        noots: nootsRes.count ?? 0,
        merges: mergesRes.count ?? 0,
        nootbooks: nootbooksRes.count ?? 0,
      })

      if (activityRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setActivity(activityRes.data.map((d: any) => ({
          id: d.id,
          title: d.title ?? '',
          repo_title: d.repositories?.title ?? 'Unknown scholar',
          updated_at: d.updated_at,
          created_at: d.created_at,
        })))
      } else {
        setActivity([])
      }
    }

    loadData()
  }, [user])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    setSaveError(null)

    const updates: Record<string, unknown> = { tags: draftTags }
    if (draft.full_name.trim())    updates.full_name    = draft.full_name.trim()
    if (draft.display_name.trim()) updates.display_name = draft.display_name.trim()
    if (draft.organization.trim()) updates.organization = draft.organization.trim()

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      setSaving(false)
      setSaveError(error.message)
      return
    }

    setSaving(false)
    closeEdit()
    setProfileTags(draftTags)
    setTimeout(() => window.location.reload(), 230)
  }

  async function saveInlineTags(tags: string[]) {
    if (!user) return
    setTagsSaving(true)
    await supabase.from('profiles').update({ tags }).eq('id', user.id)
    setTagsSaving(false)
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Navbar variant="light" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-12">

          {/* Masthead strip */}
          <div className="flex items-baseline gap-4 mb-10">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">
              profile · scholar
            </span>
            <span className="h-px flex-1 bg-forest/15" />
            <span className="font-[family-name:var(--font-body)] text-[15px] text-forest/55">
              who's writing today?
            </span>
          </div>

          {/* Loading state */}
          {!profile ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-[2px] border-forest/20 border-t-forest animate-spin" />
                <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/40">loading scholar…</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 stagger">

              {/* ── LEFT column — profile card ──────────────────────── */}
              <div>
                <div className="relative bg-milk border border-forest/15 rounded-2xl overflow-hidden">
                  {/* soft sage accent */}
                  <div className="h-[2px] bg-gradient-to-r from-sage-deep via-sage to-transparent opacity-60" />

                  <div className="p-7">
                    {editing ? (
                      /* ── EDIT MODE ──────────────────────────────── */
                      <div
                        className="flex flex-col gap-4 transition-all duration-200 ease-out"
                        style={{ opacity: editVisible ? 1 : 0, transform: editVisible ? 'translateY(0)' : 'translateY(6px)' }}
                      >
                        <div>
                          <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/50 mb-1">amend</div>
                          <h2 className="font-[family-name:var(--font-display)] text-[30px] text-forest leading-none">edit scholar</h2>
                        </div>

                        <Field label="Full name">
                          <BauInput value={draft.full_name} onChange={v => setDraft(d => ({ ...d, full_name: v }))} placeholder="Your full name" />
                        </Field>

                        <Field label="Handle / username">
                          <BauInput value={draft.display_name} onChange={v => setDraft(d => ({ ...d, display_name: v }))} placeholder="@handle" />
                        </Field>

                        <Field label="School / organization">
                          <BauInput value={draft.organization} onChange={v => setDraft(d => ({ ...d, organization: v }))} placeholder="e.g. NYU" />
                        </Field>

                        <Field label="Tags">
                          <p className="font-[family-name:var(--font-mono)] text-[9px] text-forest/40 leading-relaxed mb-2">
                            tags unlock restricted documents &amp; invite-only forks.
                          </p>
                          <form
                            onSubmit={e => {
                              e.preventDefault()
                              const tag = tagInputVal.trim().toLowerCase().replace(/\s+/g, '-')
                              if (!tag || draftTags.includes(tag)) { setTagInputVal(''); return }
                              setDraftTags(prev => [...prev, tag])
                              setTagInputVal('')
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <input
                              type="text"
                              value={tagInputVal}
                              onChange={e => setTagInputVal(e.target.value)}
                              placeholder="add a tag…"
                              className="flex-1 min-w-0 bg-milk border border-forest/20 rounded-full px-3.5 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-forest placeholder:text-forest/30 outline-none focus:border-forest/45 transition-colors"
                            />
                            <button
                              type="submit"
                              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-forest text-parchment hover:bg-forest-ink transition-colors"
                              title="Add tag"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                            </button>
                          </form>
                          {draftTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {draftTags.map(tag => (
                                <TagChip key={tag} tag={tag} onRemove={() => setDraftTags(prev => prev.filter(t => t !== tag))} />
                              ))}
                            </div>
                          )}
                        </Field>

                        {saveError && (
                          <div className="flex items-center gap-2 bg-bau-red/8 border border-bau-red/30 rounded-xl px-3.5 py-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-bau-red/70 shrink-0" />
                            <p className="font-[family-name:var(--font-body)] text-[12.5px] text-bau-red/90">{saveError}</p>
                          </div>
                        )}

                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bau-btn flex-1 justify-center !py-2 !text-[11px] disabled:opacity-50"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={closeEdit}
                            className="bau-btn bau-btn--ghost flex-1 justify-center !py-2 !text-[11px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── VIEW MODE ──────────────────────────────── */
                      <div className="transition-all duration-200 ease-out" style={{ opacity: editing ? 0 : 1 }}>
                        {/* Avatar */}
                        <div className="flex flex-col items-center mb-6">
                          <div className="relative">
                            {profile.avatar_url ? (
                              <img
                                src={profile.avatar_url}
                                alt={profile.full_name ?? profile.display_name}
                                className="w-24 h-24 object-cover rounded-full ring-1 ring-forest/15"
                              />
                            ) : (
                              <div className="w-24 h-24 bg-forest flex items-center justify-center text-[28px] font-[family-name:var(--font-display)] text-parchment rounded-full">
                                {getInitials(profile.full_name ?? profile.display_name)}
                              </div>
                            )}
                          </div>

                          <h1 className="font-[family-name:var(--font-display)] text-[30px] text-forest mt-5 leading-none">
                            {profile.full_name ?? profile.display_name}
                          </h1>
                          <span className="font-[family-name:var(--font-mono)] text-[11px] text-forest/55 mt-2">@{profile.display_name}</span>
                          {profile.email && (
                            <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/40 mt-0.5">{profile.email}</span>
                          )}
                        </div>

                        {/* Meta lines */}
                        <div className="space-y-2 mb-6 pt-4 border-t border-forest/15">
                          {[
                            profile.organization ? { label: 'School', value: profile.organization } : null,
                            { label: 'Tier',   value: String(profile.tier) },
                            { label: 'Joined', value: formatJoinDate(profile.created_at) },
                          ].filter(Boolean).map(m => (
                            <div key={m!.label} className="flex items-center justify-between">
                              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/50">{m!.label}</span>
                              <span className="font-[family-name:var(--font-body)] text-[13px] text-forest/80 capitalize">{m!.value}</span>
                            </div>
                          ))}
                        </div>

                        {/* Stats grid — Bauhaus sticker cards */}
                        <div className="grid grid-cols-2 gap-2 mb-6">
                          <StatCell label="Aura"      value={profile.aura.toLocaleString()}  color="#C85544" glyph="✦" />
                          <StatCell label="Noots"     value={counts ? String(counts.noots) : '—'}     color="#2C4B70" />
                          <StatCell label="Merges"    value={counts ? String(counts.merges) : '—'}    color="#A3B18A" />
                          <StatCell label="scholars"    value={counts ? String(counts.nootbooks) : '—'} color="#E0B13A" />
                        </div>

                        {/* Badges */}
                        {profile.badges.length > 0 && (
                          <div className="mb-6 pt-4 border-t border-forest/15">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/50">Badges</span>
                              <span className="font-[family-name:var(--font-body)] text-[13px] text-sage-deep">earned ✦</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {profile.badges.map(badge => (
                                <span
                                  key={badge}
                                  className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] bg-sage/30 text-forest-ink px-2.5 py-0.5 rounded-full"
                                >
                                  {badge}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tags — inline editable, always visible */}
                        <div className="pt-4 border-t border-forest/15">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/50">Tags</span>
                            {tagsSaving && (
                              <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/40 animate-pulse">saving…</span>
                            )}
                          </div>
                          <p className="font-[family-name:var(--font-mono)] text-[9px] text-forest/40 leading-relaxed mb-3">
                            tags unlock access to restricted documents &amp; invite-only forks.
                          </p>
                          <form
                            onSubmit={e => {
                              e.preventDefault()
                              const tag = inlineTagInput.trim().toLowerCase().replace(/\s+/g, '-')
                              if (!tag || profileTags.includes(tag)) { setInlineTagInput(''); return }
                              const next = [...profileTags, tag]
                              setProfileTags(next)
                              saveInlineTags(next)
                              setInlineTagInput('')
                            }}
                            className="flex items-center gap-1.5 mb-3"
                          >
                            <input
                              type="text"
                              value={inlineTagInput}
                              onChange={e => setInlineTagInput(e.target.value)}
                              placeholder="add a tag…"
                              className="flex-1 min-w-0 bg-milk border border-forest/20 rounded-full px-3.5 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-forest placeholder:text-forest/30 outline-none focus:border-forest/45 transition-colors"
                            />
                            <button
                              type="submit"
                              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-forest text-parchment hover:bg-forest-ink transition-colors"
                              title="Add tag"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                            </button>
                          </form>
                          <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                            {profileTags.length > 0 ? profileTags.map(tag => (
                              <TagChip
                                key={tag}
                                tag={tag}
                                onRemove={() => {
                                  const next = profileTags.filter(t => t !== tag)
                                  setProfileTags(next)
                                  saveInlineTags(next)
                                }}
                              />
                            )) : (
                              <span className="font-[family-name:var(--font-body)] text-[14px] text-forest/40">no tags yet — add one above</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={openEdit}
                          className="bau-btn bau-btn--ghost w-full justify-center mt-6 !py-2.5 !text-[11px]"
                        >
                          Edit scholar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── RIGHT column ──────────────────────────────────── */}
              <div className="space-y-10 stagger">

                {/* Contribution grid */}
                <section>
                  <SectionHeader kicker="activity" title="contribution grid" accent="#A3B18A" />
                  <div className="bg-milk border border-forest/15 rounded-2xl p-6">
                    <div className="flex gap-[3px] flex-wrap">
                      {Array.from({ length: 52 * 7 }).map((_, i) => {
                        const seed = (i * 2654435761) >>> 0
                        const v = seed % 13
                        const bg = v < 8
                          ? 'rgba(38,70,53,0.08)'
                          : v < 11
                            ? 'rgba(163,177,138,0.55)'
                            : v < 12
                              ? 'rgba(163,177,138,0.85)'
                              : '#7F9267'
                        return (
                          <div
                            key={i}
                            className="w-[10px] h-[10px] rounded-[3px]"
                            style={{ backgroundColor: bg }}
                          />
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-4 justify-end">
                      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40">less</span>
                      {[0, 1, 2, 3].map(l => (
                        <div
                          key={l}
                          className="w-[10px] h-[10px] rounded-[3px]"
                          style={{
                            backgroundColor: l === 0 ? 'rgba(38,70,53,0.08)'
                                            : l === 1 ? 'rgba(163,177,138,0.55)'
                                            : l === 2 ? 'rgba(163,177,138,0.85)'
                                            : '#7F9267',
                          }}
                        />
                      ))}
                      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40">more</span>
                    </div>
                  </div>
                </section>

                {/* Top Noots */}
                <section>
                  <SectionHeader kicker="pinned" title="top scholars" accent="#E0B13A" />
                  <div className="bg-milk border border-forest/15 border-dashed rounded-2xl p-10 text-center">
                    <span className="font-[family-name:var(--font-display)] text-[26px] text-forest/50 leading-none">
                      nothing pinned yet —
                    </span>
                    <p className="font-[family-name:var(--font-body)] text-[13.5px] text-forest/50 mt-3">
                      your most-starred scholars will surface here.
                    </p>
                  </div>
                </section>

                {/* Activity feed */}
                <section>
                  <SectionHeader kicker="recent" title="activity feed" accent="#C85544" />
                  {activity === null ? (
                    <div className="flex items-center gap-3 py-8 px-4">
                      <div className="w-5 h-5 border-[2px] border-forest/25 border-t-forest animate-spin" />
                      <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/40">loading…</span>
                    </div>
                  ) : activity.length === 0 ? (
                    <div className="bg-milk border border-forest/15 border-dashed rounded-2xl py-12 text-center">
                      <span className="font-[family-name:var(--font-display)] text-[26px] text-forest/50 leading-none">
                        a quiet day —
                      </span>
                      <p className="font-[family-name:var(--font-body)] text-[13.5px] text-forest/50 mt-3">
                        start writing your first scholar.
                      </p>
                    </div>
                  ) : (
                    <ol className="border border-forest/15 rounded-2xl divide-y divide-forest/10 bg-milk overflow-hidden">
                      {activity.map((item) => {
                        const isNew = item.created_at === item.updated_at
                        return (
                          <li key={item.id} className="grid grid-cols-12 gap-4 items-center px-6 py-4 hover:bg-parchment/40 transition-colors group">
                            <span className="col-span-1 flex items-center justify-center">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: isNew ? '#7F9267' : 'rgba(38,70,53,0.35)' }}
                              />
                            </span>
                            <div className="col-span-12 sm:col-span-8 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <ActionBadge action={isNew ? 'created' : 'updated'} />
                                <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] uppercase text-forest/55">{item.repo_title}</span>
                              </div>
                              <p className="font-[family-name:var(--font-body)] text-[15px] text-forest group-hover:text-forest-ink transition-colors truncate">
                                {item.title || <span className="text-forest/45">untitled scholar</span>}
                              </p>
                            </div>
                            <span className="col-span-12 sm:col-span-3 sm:text-right font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-forest/45">
                              {timeAgo(item.updated_at)}
                            </span>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </section>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────── */

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/55">{label}</label>
      {children}
    </div>
  )
}

function BauInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-milk border border-forest/20 rounded-xl px-3.5 py-2.5 font-[family-name:var(--font-body)] text-[13px] text-forest placeholder:text-forest/30 outline-none focus:border-forest/45 transition-colors"
    />
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

function TagChip({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em] text-forest bg-sage/20 border border-sage/40 rounded-full pl-2.5 pr-1 py-0.5">
      {tag}
      <button
        type="button"
        onClick={onRemove}
        className="text-forest/40 hover:text-forest-ink transition-colors leading-none ml-0.5 cursor-pointer"
        title="Remove tag"
      >×</button>
    </span>
  )
}
