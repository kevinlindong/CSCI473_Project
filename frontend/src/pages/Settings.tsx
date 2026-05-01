import { useState } from 'react'
import JSZip from 'jszip'
import { Navbar } from '../components/Navbar'
import { useTheme, THEMES } from '../contexts/ThemeContext'

type Section = 'appearance' | 'danger'

const sections: { id: Section; label: string; icon: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: '◈' },
  { id: 'danger', label: 'Danger Zone', icon: '⚠' },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border-2 transition-all cursor-pointer ${checked ? 'bg-sage border-sage' : 'bg-transparent border-forest/20'
        }`}
    >
      <span className={`inline-block h-3 w-3 rounded-full transition-transform ${checked ? 'translate-x-4 bg-parchment' : 'translate-x-0.5 bg-forest/25'
        }`} />
    </button>
  )
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-forest/[0.06] last:border-0">
      <div className="flex-1 pr-8">
        <span className="font-[family-name:var(--font-body)] text-sm text-forest/80 font-medium block">{label}</span>
        {description && <span className="font-mono text-[10px] text-forest/30 mt-0.5 block">{description}</span>}
      </div>
      {children}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-parchment border border-forest/10 squircle-xl p-6 shadow-[0_2px_24px_-8px_rgba(38,70,53,0.06)]">
      <h3 className="font-[family-name:var(--font-display)] text-xl text-forest mb-4">{title}</h3>
      {children}
    </div>
  )
}

/** Conic-gradient circle showing 4 theme colors as quadrants */
function ThemeCircle({ colors, size = 40 }: { colors: [string, string, string, string]; size?: number }) {
  return (
    <div
      className="rounded-full shrink-0 ring-2 ring-forest/0"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(
          ${colors[0]} 0deg 90deg,
          ${colors[1]} 90deg 180deg,
          ${colors[2]} 180deg 270deg,
          ${colors[3]} 270deg 360deg
        )`,
      }}
    />
  )
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>('appearance')
  const { themeId, setThemeId, fontScale, setFontScale, compactMode, setCompactMode, latexPreview, setLatexPreview } = useTheme()

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Navbar variant="light" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="mb-8">
            <span className="font-mono text-[9px] text-sage/50 tracking-[0.3em] uppercase block mb-1">CONFIGURATION</span>
            <h1 className="font-[family-name:var(--font-display)] text-4xl text-forest">Settings</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">

            {/* Sidebar nav */}
            <nav className="flex flex-col gap-0.5">
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 squircle-sm text-left transition-all cursor-pointer ${activeSection === s.id
                      ? 'bg-forest text-parchment'
                      : s.id === 'danger'
                        ? 'text-rust/60 hover:bg-rust/[0.06] hover:text-rust'
                        : 'text-forest/40 hover:text-forest hover:bg-forest/[0.05]'
                    }`}
                >
                  <span className="text-[11px] opacity-70">{s.icon}</span>
                  <span className="font-[family-name:var(--font-body)] text-xs font-medium">{s.label}</span>
                </button>
              ))}
            </nav>

            {/* Content */}
            <div className="space-y-6">

              {activeSection === 'appearance' && (
                <SectionCard title="Appearance">

                  {/* Color Theme */}
                  <div className="mb-6 pb-6 border-b border-forest/[0.06]">
                    <label className="font-mono text-[10px] text-forest/30 tracking-wider uppercase block mb-4">Color Theme</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {THEMES.map(theme => {
                        const active = themeId === theme.id
                        return (
                          <button
                            key={theme.id}
                            onClick={() => setThemeId(theme.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 squircle-sm border transition-all cursor-pointer text-left ${
                              active
                                ? 'border-forest bg-forest/[0.06] shadow-sm'
                                : 'border-forest/10 hover:border-forest/25 hover:bg-forest/[0.03]'
                            }`}
                          >
                            <ThemeCircle colors={theme.preview} size={34} />
                            <div className="min-w-0">
                              <span className="font-[family-name:var(--font-body)] text-[11px] font-medium text-forest/80 block leading-tight truncate">
                                {theme.name}
                              </span>
                              {active && (
                                <span className="font-mono text-[9px] text-sage block mt-0.5">active</span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Font size */}
                  <div className="mb-5 pb-5 border-b border-forest/[0.06]">
                    <label className="font-mono text-[10px] text-forest/30 tracking-wider uppercase block mb-3">Font size</label>
                    <div className="flex gap-2">
                      {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setFontScale(val)}
                          className={`font-mono text-[10px] px-4 py-2 squircle-sm border transition-all cursor-pointer ${fontScale === val
                              ? 'bg-forest text-parchment border-forest'
                              : 'border-forest/15 text-forest/40 hover:border-forest/30 hover:text-forest'
                            }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <SettingRow label="Compact mode" description="Reduce spacing throughout the app">
                    <Toggle checked={compactMode} onChange={setCompactMode} />
                  </SettingRow>
                  <SettingRow label="LaTeX preview" description="Show rendered math preview while editing">
                    <Toggle checked={latexPreview} onChange={setLatexPreview} />
                  </SettingRow>
                </SectionCard>
              )}

              {activeSection === 'danger' && (
                <DangerZone />
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DangerZone() {
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  // Bundle every scholar-local key into a ZIP download. The zip contains
  // `scholar.json` (settings/index metadata) plus a `papers/` folder with one
  // .tex per draft so the source files survive as plain LaTeX even if the
  // JSON is never re-imported.
  async function handleExport() {
    setExportLoading(true)
    setExportMsg(null)
    try {
      const draftIndex = JSON.parse(localStorage.getItem('folio_drafts_v1') || '{}') as Record<string, { id: string; title: string; createdAt: number; updatedAt: number }>
      const drafts = Object.values(draftIndex).map(meta => ({
        ...meta,
        source: localStorage.getItem(`folio_draft_src_v1:${meta.id}`) ?? '',
      }))

      const settings: Record<string, string> = {}
      const otherLocalStorage: Record<string, string> = {}
      const knownPrefixes = ['folio-', 'folio_', 'scholar', 'noots-']
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) continue
        if (key === 'folio_drafts_v1' || key.startsWith('folio_draft_src_v1:')) continue
        const value = localStorage.getItem(key) ?? ''
        if (key.startsWith('folio-')) settings[key] = value
        else if (knownPrefixes.some(p => key.startsWith(p))) otherLocalStorage[key] = value
      }

      const zip = new JSZip()
      const usedNames = new Set<string>()
      const fileMap: Array<{ id: string; title: string; file: string }> = []
      const papersFolder = zip.folder('papers')!
      for (const d of drafts) {
        const safe = (d.title || 'untitled')
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '_')
          .toLowerCase()
          .slice(0, 60) || 'untitled'
        let candidate = `${safe}.tex`
        let n = 2
        while (usedNames.has(candidate)) candidate = `${safe}_${n++}.tex`
        usedNames.add(candidate)
        papersFolder.file(candidate, d.source)
        fileMap.push({ id: d.id, title: d.title, file: `papers/${candidate}` })
      }

      const manifest = {
        exported_at: new Date().toISOString(),
        version: 2,
        app: 'scholar',
        counts: {
          drafts: drafts.length,
          settings: Object.keys(settings).length,
        },
        drafts: drafts.map(({ source: _src, ...meta }) => meta),
        papers: fileMap,
        settings,
        otherLocalStorage,
      }
      zip.file('scholar.json', JSON.stringify(manifest, null, 2))

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `scholar-export-${stamp}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportMsg(`Exported ${drafts.length} paper${drafts.length === 1 ? '' : 's'} + settings.`)
    } catch (err) {
      setExportMsg(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExportLoading(false)
      setTimeout(() => setExportMsg(null), 4000)
    }
  }

  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  function handleReset() {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k) continue
        if (k === 'folio_drafts_v1' || k.startsWith('folio_draft_src_v1:') || k.startsWith('folio-') || k.startsWith('folio_') || k.startsWith('scholar') || k.startsWith('noots-')) {
          keys.push(k)
        }
      }
      keys.forEach(k => localStorage.removeItem(k))
      setResetMsg(`Cleared ${keys.length} local entr${keys.length === 1 ? 'y' : 'ies'}.`)
      setConfirmReset(false)
      setTimeout(() => setResetMsg(null), 4000)
    } catch (err) {
      setResetMsg(`Reset failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="bg-parchment border border-rust/20 squircle-xl p-6 shadow-[0_2px_24px_-8px_rgba(139,69,19,0.08)]">
      <h3 className="font-[family-name:var(--font-display)] text-xl text-rust mb-4">Danger Zone</h3>

      {/* Export */}
      <div className="flex items-center justify-between py-5 border-b border-rust/[0.08]">
        <div className="flex-1 pr-8">
          <span className="font-[family-name:var(--font-body)] text-sm text-forest/80 font-medium block">Export all data</span>
          <span className="font-mono text-[10px] text-forest/45 mt-0.5 block">Download a ZIP with scholar.json plus every draft saved as a .tex file.</span>
          {exportMsg && (
            <span className={`font-mono text-[10px] mt-1.5 block ${exportMsg.startsWith('Export failed') ? 'text-rust' : 'text-sage-deep'}`}>
              {exportMsg}
            </span>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="font-mono text-[10px] px-4 py-2 squircle-sm border border-forest/15 text-forest/55 hover:border-forest/40 hover:text-forest transition-all cursor-pointer shrink-0 disabled:opacity-50"
        >
          {exportLoading ? 'Preparing…' : 'Export'}
        </button>
      </div>

      {/* Reset local data */}
      <div className="flex items-center justify-between py-5">
        <div className="flex-1 pr-8">
          <span className="font-[family-name:var(--font-body)] text-sm text-forest/80 font-medium block">Reset local data</span>
          <span className="font-mono text-[10px] text-forest/30 mt-0.5 block">Clear every draft, library entry, and preference saved in this browser. This cannot be undone.</span>
          {resetMsg && (
            <span className={`font-mono text-[10px] mt-1.5 block ${resetMsg.startsWith('Reset failed') ? 'text-rust' : 'text-sage-deep'}`}>
              {resetMsg}
            </span>
          )}
        </div>
        {confirmReset ? (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmReset(false)}
              className="font-mono text-[10px] px-3 py-2 squircle-sm border border-forest/15 text-forest/40 hover:text-forest transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              className="font-mono text-[10px] px-3 py-2 squircle-sm border border-rust/50 text-rust/80 hover:border-rust hover:text-rust transition-all cursor-pointer"
            >
              Clear forever
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="font-mono text-[10px] px-4 py-2 squircle-sm border border-rust/30 text-rust/70 hover:border-rust/60 hover:text-rust transition-all cursor-pointer shrink-0"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
