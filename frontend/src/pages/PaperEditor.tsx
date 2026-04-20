import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { RenderPaper, highlightTeX, extractMeta, DEFAULT_LATEX } from '../lib/latex'

/* ==========================================================================
   Paper Editor — "Codex" split-screen LaTeX composer.
   Left pane : monospaced source with editorial syntax colour overlay.
   Right pane: live, typeset paper preview on parchment with grain.
   ========================================================================== */

type Snippet = {
  id: string
  label: string
  insert: string
  cursor?: number  // caret offset from insertion start
  hint?: string
}

const SNIPPETS: Snippet[] = [
  { id: 'section',    label: '§ Section',    insert: '\\section{}',    cursor: 9,  hint: 'top-level heading' },
  { id: 'subsection', label: '§§ Subsec',    insert: '\\subsection{}', cursor: 12, hint: 'second level' },
  { id: 'eq',         label: 'Σ Equation',   insert: '\\begin{equation}\n  \n\\end{equation}\n', cursor: 20, hint: 'numbered equation' },
  { id: 'inline',     label: '$x$ Inline',    insert: '$  $', cursor: 2, hint: 'inline math' },
  { id: 'figure',     label: '▢ Figure',     insert: '\\begin{figure}[h]\n  \\includegraphics[width=0.8\\textwidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}\n', cursor: 60, hint: 'figure w/ caption' },
  { id: 'list',       label: '• Itemize',    insert: '\\begin{itemize}\n  \\item \n  \\item \n\\end{itemize}\n', cursor: 23, hint: 'bulleted list' },
  { id: 'enum',       label: '1. Enum',       insert: '\\begin{enumerate}\n  \\item \n  \\item \n\\end{enumerate}\n', cursor: 25, hint: 'numbered list' },
  { id: 'cite',       label: '[n] Citation', insert: '\\cite{}', cursor: 7, hint: 'insert citation' },
  { id: 'bold',       label: 'B Bold',       insert: '\\textbf{}', cursor: 8, hint: 'bold text' },
  { id: 'italic',     label: 'I Italic',     insert: '\\textit{}', cursor: 8, hint: 'italic text' },
  { id: 'table',      label: '⊞ Table',      insert: '\\begin{tabular}{lll}\nA & B & C \\\\\n1 & 2 & 3 \\\\\n4 & 5 & 6\n\\end{tabular}\n', cursor: 20, hint: '3×3 tabular' },
  { id: 'ref',        label: '→ Ref',        insert: '\\ref{}', cursor: 5, hint: 'reference label' },
]

// ─── helpers ─────────────────────────────────────────────────────────────────

function wordCount(src: string): number {
  // rough paper word-count: strip commands, braces, math, comments
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
  const [splitRatio, setSplitRatio] = useState(0.48)  // left pane width fraction
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

  // ── sync scroll between textarea, overlay, and gutter ───────────────────
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

  // ── snippet / palette insertion ────────────────────────────────────────
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
    // estimate scroll position
    const lh = parseFloat(getComputedStyle(ta).lineHeight || '20')
    ta.scrollTop = Math.max(0, (line - 3) * lh)
  }, [source])

  // ── rendered ───────────────────────────────────────────────────────────

  const showSource = focusMode !== 'preview'
  const showPreview = focusMode !== 'source'

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-cream">
      <Navbar variant="light" />

      {/* ── Manuscript Header ────────────────────────────────────────── */}
      <div className="border-b border-forest/10 bg-cream shrink-0 px-6 py-3 flex items-center gap-5">
        {/* Folio ribbon */}
        <div className="flex items-center gap-2 pr-4 border-r border-forest/10">
          <div className="w-6 h-6 squircle-sm bg-forest text-parchment flex items-center justify-center font-[family-name:var(--font-editorial)] text-[11px] font-semibold">F</div>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-forest/40">Folio</span>
            <span className="font-[family-name:var(--font-serif)] text-[12px] text-forest/80 italic">manuscript · draft</span>
          </div>
        </div>

        {/* Paper title — editorial typography */}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-forest/35 mb-0.5">Working title</div>
          <div className="font-[family-name:var(--font-editorial)] text-[17px] text-forest font-semibold truncate">
            {meta.title ? meta.title.replace(/\\\\/g, ' ') : <span className="text-forest/35 italic font-normal">Untitled manuscript</span>}
          </div>
        </div>

        {/* View mode pill */}
        <div className="relative flex h-8 border border-forest/15 squircle-sm overflow-hidden shrink-0">
          <span
            className="absolute inset-y-0 w-1/3 bg-forest transition-transform duration-200 ease-out"
            style={{ transform: `translateX(${focusMode === 'source' ? '0%' : focusMode === 'split' ? '100%' : '200%'})` }}
          />
          {(['source', 'split', 'preview'] as const).map(m => (
            <button
              key={m}
              onClick={() => setFocusMode(m)}
              className="relative z-10 w-[72px] flex items-center justify-center font-[family-name:var(--font-body)] text-[10px] tracking-[0.22em] uppercase transition-colors"
              style={{ color: focusMode === m ? '#E9E4D4' : 'rgba(26,47,38,0.45)' }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Save state */}
        <div className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] uppercase shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${saveState === 'saved' ? 'bg-sage animate-pulse-soft' : saveState === 'saving' ? 'bg-amber animate-pulse' : 'bg-forest/30'}`} />
          <span className="text-forest/50">{saveState === 'saved' ? 'autosaved' : saveState === 'saving' ? 'saving…' : 'ready'}</span>
        </div>

        <button
          onClick={() => {
            const blob = new Blob([source], { type: 'text/x-tex' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = (meta.title?.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase() || 'manuscript') + '.tex'
            a.click()
            URL.revokeObjectURL(a.href)
          }}
          className="shrink-0 h-8 px-3 border border-forest/15 squircle-sm flex items-center gap-1.5 font-[family-name:var(--font-body)] text-[10px] tracking-[0.22em] uppercase text-forest/55 hover:text-forest hover:border-forest/35 hover:bg-forest/[0.04] transition-colors"
          title="Download .tex source"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg>
          <span>Export</span>
        </button>
      </div>

      {/* ── Snippet toolbar (second strip) ─────────────────────────────── */}
      <div className="border-b border-forest/[0.08] bg-cream shrink-0 px-4 py-1.5 flex items-center gap-0.5 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-forest/10 mr-1">
          <button
            onClick={() => setShowOutline(v => !v)}
            className={`h-7 w-7 flex items-center justify-center squircle-sm transition-colors ${showOutline ? 'bg-forest/[0.08] text-forest' : 'text-forest/40 hover:text-forest/70 hover:bg-forest/[0.04]'}`}
            title="Toggle outline"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h10M4 12h16M4 18h7" /></svg>
          </button>
          <button
            onClick={() => setShowSnippetPalette(true)}
            className="h-7 px-2 flex items-center gap-1 squircle-sm text-forest/40 hover:text-forest/70 hover:bg-forest/[0.04] transition-colors"
            title="Snippet palette (⌘/)"
          >
            <span className="font-[family-name:var(--font-mono)] text-[9px] border border-forest/15 px-1 squircle-sm">⌘/</span>
            <span className="font-[family-name:var(--font-body)] text-[11px]">Palette</span>
          </button>
        </div>

        {SNIPPETS.map(sn => (
          <button
            key={sn.id}
            onClick={() => insertSnippet(sn)}
            title={sn.hint}
            className="shrink-0 h-7 px-2.5 font-[family-name:var(--font-body)] text-[11px] text-forest/55 hover:text-forest hover:bg-forest/[0.06] squircle-sm transition-colors"
          >
            {sn.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-3 shrink-0 pl-4 border-l border-forest/10">
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/40">
            {words}<span className="text-forest/25"> words</span>
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/30">
            {lines} ln · {chars} ch
          </span>
        </div>
      </div>

      {/* ── Workspace: outline | source | preview ───────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Outline */}
        {showOutline && (
          <aside className="w-52 border-r border-forest/[0.08] bg-cream shrink-0 overflow-y-auto p-5 hidden md:block">
            <h4 className="font-mono text-[9px] tracking-[0.3em] uppercase text-forest/30 mb-3">Structure</h4>
            {outline.length === 0 ? (
              <div className="font-[family-name:var(--font-serif)] italic text-[12px] text-forest/30">No sections yet — start with \section{'{…}'}</div>
            ) : (
              <ol className="space-y-1">
                {outline.map((it, i) => (
                  <li key={i}>
                    <button
                      onClick={() => jumpToLine(it.line)}
                      className={`text-left w-full squircle-sm px-2 py-1.5 group transition-colors hover:bg-forest/[0.04] ${it.level === 1 ? '' : it.level === 2 ? 'pl-5' : 'pl-8'}`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-[family-name:var(--font-mono)] text-[9px] text-sienna/60 tabular-nums shrink-0">
                          {it.level === 1 ? '§' : it.level === 2 ? '§§' : '§§§'}
                        </span>
                        <span className="font-[family-name:var(--font-serif)] text-[12.5px] text-forest/75 group-hover:text-forest leading-snug">
                          {it.text}
                        </span>
                      </div>
                      <div className="ml-5 mt-0.5 font-[family-name:var(--font-mono)] text-[9px] text-forest/25">line {it.line}</div>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {/* Metadata summary */}
            <div className="mt-8 pt-5 border-t border-forest/10">
              <h4 className="font-mono text-[9px] tracking-[0.3em] uppercase text-forest/30 mb-3">Metadata</h4>
              <dl className="space-y-2 font-[family-name:var(--font-serif)] text-[12px]">
                {meta.authors && meta.authors.length > 0 && (
                  <div>
                    <dt className="smcp text-forest/40 text-[0.8em]">Authors</dt>
                    <dd className="text-forest/75 italic leading-snug">{meta.authors.join(', ')}</dd>
                  </div>
                )}
                {meta.keywords && meta.keywords.length > 0 && (
                  <div>
                    <dt className="smcp text-forest/40 text-[0.8em] mb-0.5">Keywords</dt>
                    <dd className="flex flex-wrap gap-1">
                      {meta.keywords.map(k => <span key={k} className="font-[family-name:var(--font-mono)] text-[10px] text-moss border-b border-dotted border-moss/40">{k}</span>)}
                    </dd>
                  </div>
                )}
                {meta.date && (
                  <div>
                    <dt className="smcp text-forest/40 text-[0.8em]">Date</dt>
                    <dd className="text-forest/65 italic">{meta.date}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Quick Browse link */}
            <div className="mt-8 pt-5 border-t border-forest/10">
              <Link
                to="/browse"
                className="group block squircle-sm p-3 bg-parchment/70 border border-forest/10 hover:border-sienna/40 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3.5 h-3.5 text-sienna" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" strokeLinecap="round" /></svg>
                  <span className="font-[family-name:var(--font-editorial)] italic text-[13px] text-forest">Related papers</span>
                </div>
                <div className="font-[family-name:var(--font-serif)] text-[11px] text-forest/55 leading-snug">Browse the corpus for work that informs your draft.</div>
              </Link>
            </div>
          </aside>
        )}

        {/* Source + Preview */}
        <div ref={containerRef} className="flex-1 flex min-h-0 relative paper-texture">
          {/* ── SOURCE PANE ─────────────────────────────────────────── */}
          {showSource && (
            <div
              className="relative flex min-h-0 bg-[#F5F1E3] border-r border-forest/10"
              style={{ width: focusMode === 'split' ? `${splitRatio * 100}%` : '100%' }}
            >
              {/* Inside-cover ribbon */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-1 bg-gradient-to-b from-[#EDE6D1] to-transparent pointer-events-none">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/35">Source · .tex</span>
                <div className="flex-1 h-px bg-forest/10" />
                <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/30">UTF-8</span>
              </div>

              {/* Line gutter */}
              <div
                ref={gutterRef}
                className="overflow-hidden pt-8 pb-6 pr-3 pl-4 shrink-0 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.7] text-right text-forest/25 select-none tabular-nums bg-[#EDE7D4]/40 border-r border-forest/10"
                style={{ minWidth: 48 }}
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
                  className="tex-hl absolute inset-0 pt-8 pb-6 pl-5 pr-10 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.7] whitespace-pre-wrap break-words overflow-auto text-forest/90 pointer-events-none"
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
                  className="absolute inset-0 pt-8 pb-6 pl-5 pr-10 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.7] whitespace-pre-wrap break-words bg-transparent text-transparent caret-forest selection:bg-amber/25 resize-none outline-none"
                />
                {/* Faint scripture rule */}
                <div className="pointer-events-none absolute inset-y-0 left-[4.5rem] w-px bg-sienna/15" />
              </div>
            </div>
          )}

          {/* ── DRAG HANDLE ────────────────────────────────────────── */}
          {focusMode === 'split' && (
            <div
              onMouseDown={() => setIsDragging(true)}
              className="w-[3px] shrink-0 bg-forest/10 hover:bg-sienna/40 cursor-col-resize relative group"
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1 h-8 bg-sienna/30 rounded opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}

          {/* ── PREVIEW PANE ────────────────────────────────────────── */}
          {showPreview && (
            <div
              className="relative min-h-0 overflow-auto"
              style={{ width: focusMode === 'split' ? `${(1 - splitRatio) * 100}%` : '100%' }}
            >
              <div className="sticky top-0 z-10 flex items-center gap-2 px-6 py-1 bg-gradient-to-b from-[#F7F3E8] to-transparent pointer-events-none">
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/40">Typeset · preview</span>
                <div className="flex-1 h-px bg-forest/10" />
                <span className="font-[family-name:var(--font-serif)] italic text-[11px] text-forest/35">folio recto</span>
              </div>

              {/* Folio page */}
              <div className="flex justify-center py-10 px-8">
                <div className="relative max-w-[680px] w-full bg-[#FBF7EA] paper-grain squircle-sm shadow-[0_24px_60px_-30px_rgba(26,47,38,0.35),0_8px_20px_-12px_rgba(139,110,78,0.25)] border border-forest/10">
                  {/* Corner decorations */}
                  <CornerFlourish position="tl" />
                  <CornerFlourish position="tr" />
                  <CornerFlourish position="bl" />
                  <CornerFlourish position="br" />

                  {/* Folio number */}
                  <div className="absolute top-4 right-6 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/30">
                    f. I
                  </div>

                  <div className="px-16 py-16 relative">
                    <RenderPaper source={source} />
                  </div>
                </div>
              </div>

              {/* Subtle page rule */}
              <div className="max-w-[680px] mx-auto my-4 dotted-rule h-px" />

              {/* Colophon */}
              <div className="flex justify-center pb-8">
                <div className="flex items-center gap-3 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/30">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 0 L7.3 4.4 L12 5 L8.5 7.8 L9.6 12 L6 9.6 L2.4 12 L3.5 7.8 L0 5 L4.7 4.4 Z" fill="#8B6E4E" opacity="0.4" />
                  </svg>
                  <span>typeset live · kaTeX v0.16</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 0 L7.3 4.4 L12 5 L8.5 7.8 L9.6 12 L6 9.6 L2.4 12 L3.5 7.8 L0 5 L4.7 4.4 Z" fill="#8B6E4E" opacity="0.4" />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Snippet palette (modal) ────────────────────────────────── */}
      {showSnippetPalette && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-forest/40 backdrop-blur-sm animate-fade-up"
          onClick={() => setShowSnippetPalette(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg mx-4 bg-cream border border-forest/15 squircle-xl shadow-2xl overflow-hidden paper-grain"
          >
            <div className="px-5 py-4 border-b border-forest/10 flex items-center gap-3">
              <span className="font-[family-name:var(--font-editorial)] italic text-[18px] text-forest">Insert block</span>
              <div className="flex-1" />
              <kbd className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 border border-forest/15 px-1.5 py-0.5 squircle-sm">esc</kbd>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto py-2">
              {SNIPPETS.map(sn => (
                <li key={sn.id}>
                  <button
                    onClick={() => { insertSnippet(sn); setShowSnippetPalette(false) }}
                    className="w-full px-5 py-3 flex items-baseline gap-4 hover:bg-forest/[0.04] transition-colors group"
                  >
                    <span className="font-[family-name:var(--font-editorial)] text-[15px] text-forest w-28 shrink-0 group-hover:text-sienna transition-colors">{sn.label}</span>
                    <span className="font-[family-name:var(--font-serif)] italic text-[12px] text-forest/55 truncate">{sn.hint}</span>
                    <span className="ml-auto font-[family-name:var(--font-mono)] text-[10px] text-forest/30 truncate max-w-[180px]">{sn.insert.split('\n')[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── subcomponents ──────────────────────────────────────────────────────────

function CornerFlourish({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const rot = {
    tl: '0 0',
    tr: 'rotate(90 12 12)',
    bl: 'rotate(-90 12 12)',
    br: 'rotate(180 12 12)',
  }[position]
  const pos = {
    tl: 'top-2 left-2',
    tr: 'top-2 right-2',
    bl: 'bottom-2 left-2',
    br: 'bottom-2 right-2',
  }[position]
  return (
    <svg className={`absolute ${pos} w-6 h-6 pointer-events-none`} viewBox="0 0 24 24" fill="none">
      <g transform={rot} stroke="#8B6E4E" strokeWidth="0.7" opacity="0.55">
        <path d="M2 8 Q 2 2, 8 2" strokeLinecap="round" />
        <path d="M5 3.5 Q 5.5 5.5, 7.5 5" strokeLinecap="round" />
        <circle cx="8" cy="8" r="0.6" fill="#8B6E4E" />
      </g>
    </svg>
  )
}
