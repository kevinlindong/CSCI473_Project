import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { RenderPaper, highlightTeX, extractMeta, DEFAULT_LATEX } from '../lib/latex'

/* ==========================================================================
   PaperEditor — "the desk" — minimal zen botanical composer.
   A soft cream chrome holds two panes: a calm dark "garden of code" on the
   left, and a parchment folio rising in real time on the right. Snippets
   sit in a quiet pill strip; the outline whispers from a soft side rail.
   ========================================================================== */

type Snippet = {
  id: string
  label: string
  glyph: string
  insert: string
  cursor?: number
  hint?: string
  group: 'struct' | 'math' | 'block' | 'inline' | 'ref'
}

const SNIPPETS: Snippet[] = [
  { id: 'section',    glyph: '§',   label: 'Section',     group: 'struct', insert: '\\section{}',    cursor: 9,  hint: 'top-level heading' },
  { id: 'subsection', glyph: '§§',  label: 'Subsection',  group: 'struct', insert: '\\subsection{}', cursor: 12, hint: 'second level' },
  { id: 'eq',         glyph: 'Σ',   label: 'Equation',    group: 'math',   insert: '\\begin{equation}\n  \n\\end{equation}\n', cursor: 20, hint: 'numbered equation' },
  { id: 'inline',     glyph: '$',   label: 'Inline math', group: 'inline', insert: '$  $', cursor: 2, hint: 'inline math' },
  { id: 'figure',     glyph: '▢',   label: 'Figure',      group: 'block',  insert: '\\begin{figure}[h]\n  \\includegraphics[width=0.8\\textwidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}\n', cursor: 60, hint: 'figure with caption' },
  { id: 'list',       glyph: '•',   label: 'Itemize',     group: 'block',  insert: '\\begin{itemize}\n  \\item \n  \\item \n\\end{itemize}\n', cursor: 23, hint: 'bulleted list' },
  { id: 'enum',       glyph: '1.',  label: 'Enumerate',   group: 'block',  insert: '\\begin{enumerate}\n  \\item \n  \\item \n\\end{enumerate}\n', cursor: 25, hint: 'numbered list' },
  { id: 'cite',       glyph: '[ ]', label: 'Citation',    group: 'ref',    insert: '\\cite{}', cursor: 7, hint: 'insert citation' },
  { id: 'bold',       glyph: 'B',   label: 'Bold',        group: 'inline', insert: '\\textbf{}', cursor: 8, hint: 'bold text' },
  { id: 'italic',     glyph: 'I',   label: 'Italic',      group: 'inline', insert: '\\textit{}', cursor: 8, hint: 'italic text' },
  { id: 'table',      glyph: '⊞',   label: 'Table',       group: 'block',  insert: '\\begin{tabular}{lll}\nA & B & C \\\\\n1 & 2 & 3 \\\\\n4 & 5 & 6\n\\end{tabular}\n', cursor: 20, hint: '3×3 tabular' },
  { id: 'ref',        glyph: '→',   label: 'Reference',   group: 'ref',    insert: '\\ref{}', cursor: 5, hint: 'reference label' },
]

// soft, restrained tints — used as quiet ring/dot accents, never as flat fills
const groupTint: Record<Snippet['group'], string> = {
  struct: 'rgba(38,70,53,0.55)',
  math:   'rgba(127,146,103,0.7)',
  block:  'rgba(44,75,112,0.55)',
  inline: 'rgba(224,177,58,0.7)',
  ref:    'rgba(163,177,138,0.85)',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function wordCount(src: string): number {
  const stripped = src
    .replace(/%[^\n]*/g, '')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
  return stripped.trim().split(/\s+/).filter(Boolean).length
}

function lineCount(src: string): number {
  return src.split('\n').length
}

const STORAGE_KEY = 'paper-editor:draft'

// ─── component ──────────────────────────────────────────────────────────────

export default function PaperEditor() {
  const [source, setSource] = useState<string>(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_LATEX } catch { return DEFAULT_LATEX }
  })
  const [splitRatio, setSplitRatio] = useState(0.48)
  const [isDragging, setIsDragging] = useState(false)
  const [focusMode, setFocusMode] = useState<'split' | 'source' | 'preview'>('split')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showOutline, setShowOutline] = useState(true)
  const [showSnippetPalette, setShowSnippetPalette] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef  = useRef<HTMLPreElement>(null)
  const gutterRef   = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── debounced localStorage autosave ─────────────────────────────────────
  useEffect(() => {
    setSaveState('saving')
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, source)
        setSaveState('saved')
      } catch { setSaveState('idle') }
    }, 420)
    return () => clearTimeout(t)
  }, [source])

  // ── sync scroll ──────────────────────────────────────────────────────────
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    if (overlayRef.current) {
      overlayRef.current.scrollTop = ta.scrollTop
      overlayRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop
    }
  }, [])

  // ── drag resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      setSplitRatio(Math.min(0.82, Math.max(0.22, ratio)))
    }
    const onUp = () => setIsDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging])

  // ── snippet insertion ──────────────────────────────────────────────────
  const insertSnippet = useCallback((snippet: Snippet) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? source.length
    const end = ta.selectionEnd ?? source.length
    const before = source.slice(0, start)
    const after = source.slice(end)
    const next = before + snippet.insert + after
    setSource(next)
    const caretPos = start + (snippet.cursor ?? snippet.insert.length)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(caretPos, caretPos)
    })
  }, [source])

  // ── keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setShowSnippetPalette(s => !s)
      } else if (e.key === 'Escape') {
        setShowSnippetPalette(false)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        insertSnippet(SNIPPETS.find(s => s.id === 'bold')!)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'i' && !e.shiftKey) {
        e.preventDefault()
        insertSnippet(SNIPPETS.find(s => s.id === 'italic')!)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        insertSnippet(SNIPPETS.find(s => s.id === 'eq')!)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [insertSnippet])

  // ── derived state ─────────────────────────────────────────────────────
  const meta = useMemo(() => extractMeta(source).meta, [source])
  const highlighted = useMemo(() => highlightTeX(source) + '\n', [source])
  const lines = useMemo(() => lineCount(source), [source])
  const words = useMemo(() => wordCount(source), [source])
  const chars = source.length
  const outline = useMemo(() => {
    const out: Array<{ level: 1 | 2 | 3; text: string; line: number }> = []
    source.split('\n').forEach((ln, idx) => {
      const s1 = ln.match(/^\\section\*?\{([^}]+)\}/)
      const s2 = ln.match(/^\\subsection\*?\{([^}]+)\}/)
      const s3 = ln.match(/^\\subsubsection\*?\{([^}]+)\}/)
      if (s1) out.push({ level: 1, text: s1[1], line: idx + 1 })
      else if (s2) out.push({ level: 2, text: s2[1], line: idx + 1 })
      else if (s3) out.push({ level: 3, text: s3[1], line: idx + 1 })
    })
    return out
  }, [source])

  const jumpToLine = useCallback((line: number) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = source.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
    ta.focus()
    ta.setSelectionRange(pos, pos)
    const lh = parseFloat(getComputedStyle(ta).lineHeight || '20')
    ta.scrollTop = Math.max(0, (line - 3) * lh)
  }, [source])

  // ── rendered ───────────────────────────────────────────────────────────

  const showSource = focusMode !== 'preview'
  const showPreview = focusMode !== 'source'

  const saveDot =
    saveState === 'saved'   ? '#7F9267'
    : saveState === 'saving' ? '#E0B13A'
    : 'rgba(38,70,53,0.3)'
  const saveLabel =
    saveState === 'saved'   ? 'autosaved'
    : saveState === 'saving' ? 'saving…'
    : 'ready'

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-cream">
      <Navbar variant="light" />

      {/* ── Manuscript Header — calm cream band with leaf mark ─────── */}
      <div className="border-b border-forest/12 shrink-0 bg-cream/80 backdrop-blur relative">
        <div className="px-6 py-3.5 flex items-center gap-5">
          {/* Manuscript mark — leaf in soft halo */}
          <div className="flex items-center gap-3 pr-5 border-r border-forest/12">
            <LeafBadge />
            <div className="flex flex-col leading-tight">
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.32em] uppercase text-forest/50">
                manuscript
              </span>
              <span className="font-[family-name:var(--font-display)] text-[18px] text-forest leading-none mt-1">
                draft folio
              </span>
            </div>
          </div>

          {/* Working title */}
          <div className="flex-1 min-w-0">
            <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/45 mb-1">
              working title
            </div>
            <div className="font-[family-name:var(--font-display)] text-[19px] text-forest truncate">
              {meta.title
                ? meta.title.replace(/\\\\/g, ' ')
                : <span className="text-forest/45">untitled — give your folio a name</span>}
            </div>
          </div>

          {/* View mode — soft pill switch */}
          <div className="relative flex h-9 rounded-full bg-parchment/60 border border-forest/15 shrink-0 p-1">
            <span
              className="absolute inset-y-1 w-[calc((100%-8px)/3)] rounded-full bg-forest transition-transform duration-200 ease-out"
              style={{ transform: `translateX(${focusMode === 'source' ? '0%' : focusMode === 'split' ? '100%' : '200%'})` }}
            />
            {(['source', 'split', 'preview'] as const).map(m => (
              <button
                key={m}
                onClick={() => setFocusMode(m)}
                className="relative z-10 w-[78px] flex items-center justify-center font-[family-name:var(--font-body)] text-[13px] transition-colors cursor-pointer"
                style={{ color: focusMode === m ? '#E9E4D4' : 'rgba(38,70,53,0.55)' }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Save state */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${saveState === 'saving' ? 'animate-pulse' : ''}`}
              style={{ background: saveDot }}
            />
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-forest/55">
              {saveLabel}
            </span>
          </div>

          {/* Export */}
          <button
            onClick={() => {
              const blob = new Blob([source], { type: 'text/x-tex' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = (meta.title?.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase() || 'manuscript') + '.tex'
              a.click()
              URL.revokeObjectURL(a.href)
            }}
            className="bau-btn bau-btn--ghost shrink-0 !py-2 !px-4 !text-[10.5px] !tracking-[0.22em]"
            title="Download .tex source"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
            </svg>
            export .tex
          </button>
        </div>
      </div>

      {/* ── Snippet toolbar — soft pill strip ─────────────────────── */}
      <div className="border-b border-forest/12 bg-cream/70 shrink-0 px-4 py-2.5 flex items-center gap-1.5 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0 pr-3 border-r border-forest/12 mr-2">
          <button
            onClick={() => setShowOutline(v => !v)}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer border ${
              showOutline
                ? 'bg-forest text-parchment border-forest'
                : 'border-forest/20 text-forest/55 hover:text-forest hover:border-forest/45 hover:bg-sage/15'
            }`}
            title="Toggle outline"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h10M4 12h16M4 18h7" />
            </svg>
          </button>
          <button
            onClick={() => setShowSnippetPalette(true)}
            className="h-8 px-3 rounded-full flex items-center gap-2 border border-forest/20 hover:border-forest/45 hover:bg-sage/15 transition-colors cursor-pointer"
            title="Snippet palette (⌘/)"
          >
            <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.16em] bg-forest text-parchment px-1.5 py-0.5 rounded-full">⌘/</span>
            <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/75">palette</span>
          </button>
        </div>

        {SNIPPETS.map(sn => (
          <button
            key={sn.id}
            onClick={() => insertSnippet(sn)}
            title={sn.hint}
            className="shrink-0 h-8 px-3 rounded-full flex items-center gap-2 border border-transparent hover:border-forest/20 hover:bg-sage/12 transition-colors cursor-pointer group"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: groupTint[sn.group] }}
            />
            <span className="font-[family-name:var(--font-mono)] text-[11px] text-forest/55 group-hover:text-forest tabular-nums">
              {sn.glyph}
            </span>
            <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/65 group-hover:text-forest">
              {sn.label}
            </span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-3 shrink-0 pl-4 border-l border-forest/12">
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/55">
            <span className="text-forest font-medium">{words}</span>
            <span className="text-forest/35"> w</span>
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/40">
            {lines} ln · {chars} ch
          </span>
        </div>
      </div>

      {/* ── Workspace: outline | source | preview ─────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* ── OUTLINE ──────────────────────────────────────────── */}
        {showOutline && (
          <aside className="w-60 border-r border-forest/12 bg-cream/60 shrink-0 overflow-y-auto hidden md:block">
            {/* Structure header */}
            <div className="px-5 pt-6 pb-4 border-b border-forest/10">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.32em] uppercase text-forest/50">structure</span>
                <span className="font-[family-name:var(--font-display)] text-[14px] text-sage-deep">{outline.length}</span>
              </div>
              <div className="font-[family-name:var(--font-display)] text-[20px] text-forest leading-none">
                table of contents
              </div>
            </div>

            <div className="p-4">
              {outline.length === 0 ? (
                <div className="border border-dashed border-forest/20 rounded-2xl px-4 py-5 text-center bg-milk/40">
                  <div className="font-[family-name:var(--font-body)] text-[14px] text-forest/55 mb-1.5">no sections yet</div>
                  <div className="font-[family-name:var(--font-mono)] text-[10px] text-forest/40">
                    try <span className="text-sage-deep">\section{'{...}'}</span>
                  </div>
                </div>
              ) : (
                <ol className="space-y-0.5">
                  {outline.map((it, i) => (
                    <li key={i}>
                      <button
                        onClick={() => jumpToLine(it.line)}
                        className={`text-left w-full group transition-colors hover:bg-sage/12 rounded-lg flex items-baseline gap-2 px-2.5 py-1.5 ${
                          it.level === 1 ? '' : it.level === 2 ? 'pl-6' : 'pl-10'
                        }`}
                      >
                        <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/35 group-hover:text-sage-deep shrink-0 tabular-nums w-6">
                          {it.level === 1 ? '§' : it.level === 2 ? '§§' : '§§§'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-[family-name:var(--font-body)] text-[13px] text-forest/80 group-hover:text-forest leading-snug truncate">
                            {it.text}
                          </span>
                          <span className="block font-[family-name:var(--font-mono)] text-[9px] text-forest/30">
                            l. {it.line}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Metadata */}
            <div className="mx-5 my-5 pt-5 border-t border-forest/10">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.32em] uppercase text-forest/50">front matter</span>
                <span className="w-1.5 h-1.5 rounded-full bg-sage" />
              </div>
              <dl className="space-y-3 font-[family-name:var(--font-body)] text-[12.5px]">
                {meta.authors && meta.authors.length > 0 && (
                  <div>
                    <dt className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40 mb-0.5">authors</dt>
                    <dd className="text-forest/80 leading-snug">{meta.authors.join(', ')}</dd>
                  </div>
                )}
                {meta.keywords && meta.keywords.length > 0 && (
                  <div>
                    <dt className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40 mb-1">keywords</dt>
                    <dd className="flex flex-wrap gap-1">
                      {meta.keywords.map(k => (
                        <span key={k} className="font-[family-name:var(--font-mono)] text-[9.5px] tracking-[0.08em] uppercase border border-forest/20 rounded-full px-2 py-0.5 text-forest/70 bg-milk/60">
                          {k}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {meta.date && (
                  <div>
                    <dt className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40 mb-0.5">date</dt>
                    <dd className="text-forest/70">{meta.date}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Browse the corpus link */}
            <div className="mx-5 mb-6 pt-5 border-t border-forest/10">
              <Link
                to="/browse"
                className="group block bg-milk border border-forest/15 rounded-2xl p-4 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_rgba(38,70,53,0.22)] transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage-deep" />
                  <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/55">corpus</span>
                </div>
                <div className="font-[family-name:var(--font-display)] text-[17px] text-forest leading-none mb-1.5">browse related</div>
                <div className="font-[family-name:var(--font-body)] text-[12px] text-forest/55 leading-snug">
                  find work that informs your draft.
                </div>
              </Link>
            </div>
          </aside>
        )}

        {/* ── Source + Preview ────────────────────────────────── */}
        <div ref={containerRef} className="flex-1 flex min-h-0 relative">
          {/* ── SOURCE PANE — calm dark "garden of code" ────── */}
          {showSource && (
            <div
              className="relative flex min-h-0 border-r border-forest/12"
              style={{
                width: focusMode === 'split' ? `${splitRatio * 100}%` : '100%',
                background: '#0E1F18',
              }}
            >
              {/* Codebox titlebar */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 h-7 bg-[#081611] border-b border-[#ffffff10]">
                <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-sage shrink-0">
                  source · main.tex
                </span>
                <div className="flex-1" />
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.2em] uppercase text-parchment/35">
                  utf-8 · LF
                </span>
              </div>

              {/* Line gutter */}
              <div
                ref={gutterRef}
                className="overflow-hidden pt-9 pb-6 pr-3 pl-3 shrink-0 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.7] text-right text-parchment/25 select-none tabular-nums bg-[#0a1812] border-r border-[#ffffff08]"
                style={{ minWidth: 44 }}
                aria-hidden
              >
                {Array.from({ length: lines }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Source code area (overlay + textarea) */}
              <div className="relative flex-1 min-w-0">
                <pre
                  ref={overlayRef}
                  className="tex-hl absolute inset-0 pt-9 pb-6 pl-5 pr-10 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.7] whitespace-pre-wrap break-words overflow-auto pointer-events-none"
                  style={{ color: '#E9E4D4' }}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
                <textarea
                  ref={textareaRef}
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  onScroll={syncScroll}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="absolute inset-0 pt-9 pb-6 pl-5 pr-10 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.7] whitespace-pre-wrap break-words bg-transparent text-transparent caret-parchment selection:bg-sage/30 resize-none outline-none"
                />
              </div>

              {/* tiny live tag */}
              <div className="absolute bottom-3 right-4 pointer-events-none">
                <span className="font-[family-name:var(--font-body)] text-[12px] text-sage/70">editing live ↓</span>
              </div>
            </div>
          )}

          {/* ── DRAG HANDLE ───────────────────────────────────── */}
          {focusMode === 'split' && (
            <div
              onMouseDown={() => setIsDragging(true)}
              className="w-[6px] shrink-0 bg-forest/15 hover:bg-sage/45 cursor-col-resize relative group transition-colors"
            >
              <div className="absolute inset-y-0 -left-2 -right-2" />
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1 h-10 rounded-full bg-sage/60 opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
          )}

          {/* ── PREVIEW PANE — parchment folio ──────────────── */}
          {showPreview && (
            <div
              className="relative min-h-0 overflow-auto bg-cream"
              style={{ width: focusMode === 'split' ? `${(1 - splitRatio) * 100}%` : '100%' }}
            >
              {/* sticky top tag */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-6 h-7 bg-cream/90 backdrop-blur border-b border-forest/12">
                <span className="w-1.5 h-1.5 rounded-full bg-sage-deep" />
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/55">
                  typeset · folio recto
                </span>
                <div className="flex-1" />
                <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/50">live preview</span>
              </div>

              {/* Folio page */}
              <div className="flex justify-center py-12 px-8">
                <div className="relative max-w-[680px] w-full">
                  <div className="relative bg-milk paper-grain border border-forest/15 rounded-3xl overflow-hidden shadow-[0_24px_60px_-30px_rgba(38,70,53,0.28)]">
                    {/* Folio header band */}
                    <div className="flex items-center justify-between px-7 py-3 border-b border-forest/10 bg-parchment/40">
                      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/50">
                        folio · I
                      </span>
                      <span className="font-[family-name:var(--font-display)] text-[15px] text-forest/70 leading-none">
                        a scholar's draft
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/50">
                        recto
                      </span>
                    </div>

                    {/* Body */}
                    <div className="px-14 py-14 relative">
                      <RenderPaper source={source} />
                    </div>

                    {/* Folio footer */}
                    <div className="flex items-center justify-between px-7 py-3 border-t border-forest/10 bg-parchment/40">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                        <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/45">
                          typeset · KaTeX
                        </span>
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/45">
                        — 1 —
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Colophon */}
              <div className="flex justify-center pb-12 pt-2">
                <div className="flex items-center gap-3">
                  <span className="w-1 h-1 rounded-full bg-forest/30" />
                  <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/45">
                    folio · v1 · live render
                  </span>
                  <span className="w-1 h-1 rounded-full bg-forest/30" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Snippet palette modal ────────────────────────────────── */}
      {showSnippetPalette && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-forest/40 backdrop-blur-sm animate-fade-up"
          onClick={() => setShowSnippetPalette(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl mx-4 bg-milk border border-forest/15 rounded-3xl shadow-[0_30px_80px_-30px_rgba(38,70,53,0.45)] overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-forest/10 flex items-center gap-3 bg-parchment/40">
              <div className="w-9 h-9 rounded-full bg-forest flex items-center justify-center text-parchment font-[family-name:var(--font-display)] text-[14px]">
                ⌘
              </div>
              <div className="flex-1">
                <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/50 mb-0.5">insert</div>
                <div className="font-[family-name:var(--font-display)] text-[22px] text-forest leading-none">snippet palette</div>
              </div>
              <kbd className="font-[family-name:var(--font-mono)] text-[10px] text-forest/70 border border-forest/20 rounded-full px-2.5 py-1">esc</kbd>
            </div>

            {/* Snippets list */}
            <ul className="max-h-[60vh] overflow-y-auto">
              {SNIPPETS.map(sn => (
                <li key={sn.id} className="border-b border-forest/[0.06] last:border-b-0">
                  <button
                    onClick={() => { insertSnippet(sn); setShowSnippetPalette(false) }}
                    className="w-full px-6 py-3 flex items-center gap-4 hover:bg-sage/10 transition-colors group cursor-pointer text-left"
                  >
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center font-[family-name:var(--font-mono)] text-[12px] text-forest shrink-0 border"
                      style={{ background: 'rgba(233,228,212,0.55)', borderColor: groupTint[sn.group] }}
                    >
                      {sn.glyph}
                    </span>
                    <span className="flex flex-col flex-1 min-w-0">
                      <span className="font-[family-name:var(--font-body)] text-[14px] text-forest group-hover:text-forest-ink transition-colors">
                        {sn.label}
                      </span>
                      <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/55 truncate">
                        {sn.hint}
                      </span>
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/40 truncate max-w-[180px] hidden sm:inline">
                      {sn.insert.split('\n')[0]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* footer */}
            <div className="px-6 py-3 border-t border-forest/10 bg-parchment/40 flex items-center justify-between">
              <span className="font-[family-name:var(--font-body)] text-[13px] text-forest/55">
                pick a block, drop it in.
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.28em] uppercase text-forest/40">
                {SNIPPETS.length} blocks
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Leaf badge — soft botanical mark used as the "manuscript" sigil. ─── */
function LeafBadge() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r="18" fill="#A3B18A" opacity="0.22" />
      <path
        d="M 20 8 C 12 12, 10 22, 14 30 C 22 28, 28 20, 26 10 C 24 11, 22 11, 20 8 Z"
        fill="#264635"
        opacity="0.92"
      />
      <path
        d="M 20 8 C 20 14, 18 22, 14 30"
        stroke="#A3B18A"
        strokeWidth="0.8"
        fill="none"
      />
    </svg>
  )
}
