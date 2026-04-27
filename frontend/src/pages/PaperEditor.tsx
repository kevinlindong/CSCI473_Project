import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { RenderPaper, highlightTeX, extractMeta, DEFAULT_LATEX } from '../lib/latex'
import {
  readDraftSource,
  writeDraftSource,
  useDrafts,
  SCRATCH_ID,
} from '../hooks/useDrafts'
import { useEditorBridge } from '../contexts/EditorBridgeContext'

/* ==========================================================================
   PaperEditor — "the desk" — minimal zen botanical composer.
   A soft cream chrome holds two panes: a calm dark "garden of code" on the
   left, and a parchment scholar rising in real time on the right. Snippets
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

// Core snippets shown inline in the toolbar — the most-used LaTeX primitives
// in priority order. The strip only renders as many pills as fit in the
// currently available width; the rest remain accessible through the palette.
const TOOLBAR_SNIPPET_IDS: ReadonlyArray<Snippet['id']> = [
  'section', 'subsection', 'eq', 'inline', 'bold', 'italic',
  'cite', 'ref', 'list', 'enum', 'figure', 'table',
]
const TOOLBAR_SNIPPETS: ReadonlyArray<Snippet> = TOOLBAR_SNIPPET_IDS
  .map(id => SNIPPETS.find(s => s.id === id)!)
  .filter(Boolean)
// gap-1.5 → 0.375rem → 6px. Keep in sync with the flex `gap-*` utility on
// the strip container.
const TOOLBAR_GAP_PX = 6

// soft, restrained tints — used as quiet ring/dot accents, never as flat fills
const groupTint: Record<Snippet['group'], string> = {
  struct: 'rgba(38,70,53,0.55)',
  math:   'rgba(127,146,103,0.7)',
  block:  'rgba(44,75,112,0.55)',
  inline: 'rgba(224,177,58,0.7)',
  ref:    'rgba(163,177,138,0.85)',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// Count words across the entire document — including \title/\author/\date
// in the preamble. Strips math, comments, and non-textual commands
// (\cite, \ref, \usepackage, \documentclass, \includegraphics) but PRESERVES
// textual brace content (\section{Title} → "Title", \textbf{word} → "word")
// so the counter reflects what the reader will see.
function wordCount(src: string): number {
  const body = src
    // line comments (% to EOL, but not escaped \%)
    .replace(/(^|[^\\])%[^\n]*/g, '$1')
    // display math environments
    .replace(/\\begin\{(equation|align|gather|multline|displaymath|eqnarray)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    // verbatim / code / floats
    .replace(/\\begin\{(verbatim|lstlisting|tikzpicture|figure|table)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    // inline / display math delimiters
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    // commands whose brace content is NOT prose — drop both the command and braces
    .replace(/\\(cite|citep|citet|ref|eqref|pageref|label|includegraphics|input|include|bibliography|bibliographystyle|usepackage|documentclass|pagestyle|setlength|setcounter|hypersetup|geometry|today|maketitle|tableofcontents|newcommand|renewcommand|definecolor)\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    // \begin{env} / \end{env} markers — keep their inner content
    .replace(/\\(begin|end)\{[^}]*\}/g, ' ')
    // any remaining command — drop the backslash name + optional [opts] but
    // leave its brace content for the next pass to expose
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    // strip remaining braces
    .replace(/[{}]/g, ' ')

  return body.trim().split(/\s+/).filter(Boolean).length
}

function lineCount(src: string): number {
  return src.split('\n').length
}

// ─── component ──────────────────────────────────────────────────────────────

function initialSourceFor(draftId: string): string {
  // Prefer the user's saved edits whenever they exist. Scratch falls back to
  // the presentation deck only on a true first visit (no stored value yet)
  // so subsequent edits aren't clobbered by re-hydrating the demo content.
  const stored = readDraftSource(draftId)
  if (stored !== null) return stored
  if (draftId === SCRATCH_ID) return DEFAULT_LATEX
  return ''
}

export default function PaperEditor() {
  const { repoId } = useParams<{ repoId: string }>()
  const draftId = repoId ?? SCRATCH_ID
  const { drafts, touchDraft, renameDraft } = useDrafts()
  const editorBridge = useEditorBridge()

  // Latest drafts list inside the debounced autosave — keeps the effect's
  // dependency array small (drafts mutates on every save and would loop).
  const draftsRef = useRef(drafts)
  useEffect(() => { draftsRef.current = drafts }, [drafts])

  const draftMeta = drafts.find(d => d.id === draftId)

  const [source, setSource] = useState<string>(() => initialSourceFor(draftId))
  const sourceRef = useRef<string>(source)
  useEffect(() => { sourceRef.current = source }, [source])

  // ── undo / redo history ────────────────────────────────────────────────
  // We maintain our own snapshot stack instead of relying on the textarea's
  // native undo, because controlled inputs lose native undo grouping after
  // setSource is called externally (snippets, scoot writes, imports). Typing
  // is debounced into snapshots; programmatic changes push immediately so
  // there's a clean undo step at the boundary.
  const historyRef = useRef<{ stack: string[]; idx: number }>({
    stack: [sourceRef.current],
    idx: 0,
  })
  const snapTimerRef = useRef<number | null>(null)
  const HISTORY_LIMIT = 200

  const pushImmediate = useCallback((value: string) => {
    if (snapTimerRef.current !== null) {
      clearTimeout(snapTimerRef.current)
      snapTimerRef.current = null
    }
    const h = historyRef.current
    if (h.stack[h.idx] === value) return
    h.stack = h.stack.slice(0, h.idx + 1)
    h.stack.push(value)
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift()
    else h.idx = h.stack.length - 1
  }, [])

  const queueSnapshot = useCallback((value: string) => {
    if (snapTimerRef.current !== null) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = window.setTimeout(() => {
      pushImmediate(value)
      snapTimerRef.current = null
    }, 350)
  }, [pushImmediate])

  const undo = useCallback(() => {
    if (snapTimerRef.current !== null) pushImmediate(sourceRef.current)
    const h = historyRef.current
    if (h.idx <= 0) return false
    h.idx -= 1
    setSource(h.stack[h.idx])
    return true
  }, [pushImmediate])

  const redo = useCallback(() => {
    if (snapTimerRef.current !== null) pushImmediate(sourceRef.current)
    const h = historyRef.current
    if (h.idx >= h.stack.length - 1) return false
    h.idx += 1
    setSource(h.stack[h.idx])
    return true
  }, [pushImmediate])

  // Register with EditorBridge so scoot can append LaTeX into this editor.
  useEffect(() => {
    editorBridge.register({
      mode: 'source',
      getSource: () => sourceRef.current,
      setSource: (text: string) => {
        pushImmediate(sourceRef.current)
        setSource(text)
        pushImmediate(text)
      },
    })
    return () => editorBridge.unregister()
  }, [editorBridge, pushImmediate])

  // Re-hydrate when the user navigates between drafts without remounting.
  useEffect(() => {
    const fresh = initialSourceFor(draftId)
    setSource(fresh)
    historyRef.current = { stack: [fresh], idx: 0 }
    if (snapTimerRef.current !== null) {
      clearTimeout(snapTimerRef.current)
      snapTimerRef.current = null
    }
  }, [draftId])
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
  const toolbarStripRef = useRef<HTMLDivElement>(null)
  const toolbarMeasureRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // How many pills fit inline at the current toolbar width. Remaining pills
  // are only reachable through the palette. Measured via an offscreen layer
  // that mirrors the full snippet set so we can compute natural pill widths
  // without flashing them in the real toolbar.
  const [visibleCount, setVisibleCount] = useState(TOOLBAR_SNIPPETS.length)
  useLayoutEffect(() => {
    const strip = toolbarStripRef.current
    const measure = toolbarMeasureRef.current
    if (!strip || !measure) return
    const recompute = () => {
      const btns = Array.from(measure.querySelectorAll<HTMLElement>('[data-tb-btn]'))
      if (btns.length === 0) return
      const available = strip.clientWidth
      let used = 0
      let n = 0
      for (let k = 0; k < btns.length; k++) {
        const w = btns[k].offsetWidth
        const next = n === 0 ? w : used + TOOLBAR_GAP_PX + w
        if (next > available) break
        used = next
        n++
      }
      setVisibleCount(prev => (prev === n ? prev : n))
    }
    const ro = new ResizeObserver(recompute)
    ro.observe(strip)
    recompute()
    return () => ro.disconnect()
  }, [])

  // ── debounced localStorage autosave ─────────────────────────────────────
  // Writes the source under the per-draft key and upserts the index entry.
  // The display title is seeded from the LaTeX \title{} only on the FIRST
  // save for this draft — after that it's user-controlled (renameDraft from
  // the editable title in the header) so manual renames aren't clobbered.
  useEffect(() => {
    setSaveState('saving')
    const t = setTimeout(() => {
      try {
        writeDraftSource(draftId, source)
        const existing = draftsRef.current.find(d => d.id === draftId)
        const isFirstSave = !existing
        let seedTitle: string | undefined
        if (isFirstSave) {
          const extracted = extractMeta(source).meta.title
          seedTitle =
            (extracted && extracted.replace(/\\\\/g, ' ').trim()) ||
            (draftId === SCRATCH_ID ? 'scratch scholar' : 'untitled scholar')
        }
        touchDraft(draftId, seedTitle)
        setSaveState('saved')
      } catch { setSaveState('idle') }
    }, 420)
    return () => clearTimeout(t)
  }, [source, draftId, touchDraft])

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
    pushImmediate(source)
    setSource(next)
    pushImmediate(next)
    const caretPos = start + (snippet.cursor ?? snippet.insert.length)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(caretPos, caretPos)
    })
  }, [source, pushImmediate])

  // ── file import ────────────────────────────────────────────────────────
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      pushImmediate(sourceRef.current)
      setSource(text)
      pushImmediate(text)
    }
    reader.readAsText(file)
  }, [pushImmediate])

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
        <div className="px-4 py-3.5 flex items-center gap-5">
          {/* Back to library — leaf mark doubles as the return affordance */}
          <Link
            to="/library"
            className="flex items-center gap-3 pr-5 border-r border-forest/12 group hover:opacity-90 transition-opacity"
          >
            <LeafBadge />
            <div className="flex flex-col leading-tight">
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.32em] uppercase text-forest/50">
                ← back to
              </span>
              <span className="font-[family-name:var(--font-display)] text-[18px] text-forest leading-none mt-1 group-hover:text-forest-deep transition-colors">
                library
              </span>
            </div>
          </Link>

          {/* Working title — click to rename. Only updates DraftMeta in the
              library; never touches \title{} in the LaTeX source. */}
          <div className="flex-1 min-w-0">
            <div className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/45 mb-1">
              working title
            </div>
            <EditableTitle
              draftId={draftId}
              currentTitle={
                draftMeta?.title ||
                (meta.title ? meta.title.replace(/\\\\/g, ' ') : '')
              }
              onRename={t => renameDraft(draftId, t)}
            />
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

          {/* Import */}
          <button
            onClick={handleImportClick}
            className="bau-btn bau-btn--ghost shrink-0 !py-2 !px-4 !text-[10.5px] !tracking-[0.22em]"
            title="Open a .tex file from your machine"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 14l-5-5m0 0l-5 5m5-5v11" />
            </svg>
            import .tex
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tex,text/x-tex,text/plain"
            className="hidden"
            onChange={handleImportFile}
          />

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
      <div className="border-b border-forest/12 bg-cream/70 shrink-0 px-4 py-2.5 flex items-center gap-1.5">
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
        </div>

        <div
          ref={toolbarStripRef}
          className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden"
        >
          {TOOLBAR_SNIPPETS.slice(0, visibleCount).map(sn => (
            <button
              key={sn.id}
              onClick={() => insertSnippet(sn)}
              title={sn.hint}
              className="shrink-0 h-8 px-3 rounded-full inline-flex items-center gap-2 border border-transparent hover:border-forest/20 hover:bg-sage/12 transition-colors cursor-pointer group"
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
        </div>

        {/* Offscreen measurement layer — mirrors every candidate pill so we
            can read natural widths and fit as many as possible into the strip
            without overflowing into the palette button. */}
        <div
          ref={toolbarMeasureRef}
          aria-hidden
          style={{ position: 'fixed', left: '-9999px', top: 0, visibility: 'hidden', pointerEvents: 'none' }}
          className="flex items-center gap-1.5"
        >
          {TOOLBAR_SNIPPETS.map(sn => (
            <button
              key={sn.id}
              data-tb-btn
              tabIndex={-1}
              className="shrink-0 h-8 px-3 rounded-full inline-flex items-center gap-2 border border-transparent"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: groupTint[sn.group] }} />
              <span className="font-[family-name:var(--font-mono)] text-[11px] text-forest/55 tabular-nums">{sn.glyph}</span>
              <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/65">{sn.label}</span>
            </button>
          ))}
        </div>

        {/* Palette button — pinned to the right of the toolbar section so it
            stays visible no matter how many snippet pills flow in. The snippets
            container clips its own overflow, so pills are truncated before they
            reach this button. */}
        <button
          onClick={() => setShowSnippetPalette(true)}
          className="shrink-0 h-8 px-3 ml-2 rounded-full flex items-center gap-2 border border-forest/20 bg-cream/70 hover:border-forest/45 hover:bg-sage/15 transition-colors cursor-pointer"
          title="Snippet palette (⌘/)"
        >
          <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.16em] bg-forest text-parchment px-1.5 py-0.5 rounded-full">⌘/</span>
          <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/75">palette</span>
        </button>

        <div className="flex items-center gap-3 shrink-0 pl-4 ml-2 border-l border-forest/12">
          <span className="font-[family-name:var(--font-mono)] text-[11px] text-forest/70 tabular-nums">
            <span className="text-forest font-semibold">{words}</span>
            <span className="text-forest/45"> w</span>
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 tabular-nums">
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
                    <dt className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.22em] uppercase text-forest/40 mb-1">
                      {meta.keywords.length === 1 ? 'keyword' : 'keywords'}
                    </dt>
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
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.2em] uppercase text-parchment/55">
                  utf-8 · LF
                </span>
              </div>

              {/* Line gutter */}
              <div
                ref={gutterRef}
                className="overflow-hidden pt-9 pb-6 pr-3 pl-3 shrink-0 font-[family-name:var(--font-mono)] text-[11.5px] leading-[1.7] text-right text-parchment/45 select-none tabular-nums bg-[#0a1812] border-r border-[#ffffff10]"
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
                  onChange={e => {
                    const next = e.target.value
                    setSource(next)
                    queueSnapshot(next)
                  }}
                  onKeyDown={e => {
                    const mod = e.metaKey || e.ctrlKey
                    if (!mod) return
                    const k = e.key.toLowerCase()
                    if (k === 'z' && !e.shiftKey) {
                      e.preventDefault()
                      undo()
                    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
                      e.preventDefault()
                      redo()
                    }
                  }}
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

          {/* ── PREVIEW PANE — parchment scholar ──────────────── */}
          {showPreview && (
            <div
              className="relative min-h-0 overflow-auto bg-cream"
              style={{ width: focusMode === 'split' ? `${(1 - splitRatio) * 100}%` : '100%' }}
            >
              {/* sticky top tag */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-6 h-7 bg-cream/90 backdrop-blur border-b border-forest/12">
                <span className="w-1.5 h-1.5 rounded-full bg-sage-deep" />
                <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/55">
                  typeset · scholar recto
                </span>
                <div className="flex-1" />
                <span className="font-[family-name:var(--font-body)] text-[12px] text-forest/50">live preview</span>
              </div>

              {/* Overleaf-style page — white paper, Computer Modern body, soft drop shadow. */}
              <div className="flex justify-center py-10 px-8">
                <div className="relative max-w-[720px] w-full">
                  <div className="relative bg-white border border-forest/10 rounded-md overflow-hidden shadow-[0_24px_60px_-30px_rgba(38,70,53,0.28)]">
                    <div className="px-[72px] py-14 relative">
                      <RenderPaper source={source} />
                    </div>
                    <div className="flex items-center justify-center pb-8 pt-2">
                      <span className="font-[family-name:var(--font-cm)] text-[12px] text-[#333]">1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Snippet palette modal ────────────────────────────────── */}
      {showSnippetPalette && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-forest/40 backdrop-blur-sm animate-palette-backdrop"
          onClick={() => setShowSnippetPalette(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl mx-4 bg-milk border border-forest/15 rounded-3xl shadow-[0_30px_80px_-30px_rgba(38,70,53,0.45)] overflow-hidden animate-palette-pop"
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

/* ── Editable working-title — click the title text to rename the draft.
   Updates DraftMeta only; never touches the LaTeX source. ─────────────── */
function EditableTitle({
  draftId, currentTitle, onRename,
}: {
  draftId: string
  currentTitle: string
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(currentTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(currentTitle) }, [currentTitle, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (!next || next === currentTitle) {
      setDraft(currentTitle)
      return
    }
    onRename(next)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(currentTitle)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        spellCheck={false}
        className="w-full bg-transparent border-b border-sage-deep/40 outline-none font-[family-name:var(--font-display)] text-[19px] text-forest"
      />
    )
  }

  const display = currentTitle || (draftId === SCRATCH_ID ? 'scratch scholar' : 'untitled scholar')
  const isPlaceholder = !currentTitle
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full text-left truncate font-[family-name:var(--font-display)] text-[19px] hover:text-forest-deep transition-colors cursor-text"
      title="Click to rename — only changes the library name, not the LaTeX"
    >
      <span className={isPlaceholder ? 'text-forest/45' : 'text-forest'}>{display}</span>
    </button>
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
