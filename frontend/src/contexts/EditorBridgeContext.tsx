import { createContext, useContext, useCallback, useRef } from 'react'
import type { Block, BlockType } from '../hooks/useDocument'
import { newBlock } from '../hooks/useDocument'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BlockSpec {
  type: BlockType
  content: string
  meta?: Record<string, unknown>
  /** Optional placement hint for source-mode editors. Forms:
   *  "end" | "start" | "after:<section>" | "before:<section>".
   *  Section match is case-insensitive substring of \section{...}. */
  position?: string
}

interface EditorBridge {
  /** true when an editor (block-mode or source-mode) is mounted */
  isEditorActive: boolean
  /** Append blocks to the current document. Translates to LaTeX source when
   *  the active editor is source-mode (e.g. PaperEditor). */
  insertBlocks: (specs: BlockSpec[]) => void
  /** Append plain text to the active editor. Source-mode editors receive the
   *  text verbatim; block-mode editors wrap it in a paragraph block. */
  appendSource: (text: string) => void
  register: (cb: RegisterPayload) => void
  unregister: () => void
}

type BlockPayload = {
  mode?: 'blocks'
  getBlocks: () => Block[]
  setBlocks: (blocks: Block[]) => void
}

type SourcePayload = {
  mode: 'source'
  getSource: () => string
  setSource: (text: string) => void
}

type RegisterPayload = BlockPayload | SourcePayload

// Pick the offset in the LaTeX source where new content should be inserted.
// Handles "end" / "start" / "after:section" / "before:section". Falls back to
// just before \end{document} (or end-of-source if it's missing).
function findInsertOffset(source: string, position?: string): number {
  const endDocMatch = source.match(/\\end\{document\}/)
  const defaultOffset = endDocMatch ? endDocMatch.index! : source.length

  if (!position) return defaultOffset

  const [op, ...rest] = position.split(':')
  const target = rest.join(':').trim().toLowerCase()

  if (op === 'end') return defaultOffset
  if (op === 'start') {
    const mt = source.match(/\\maketitle\b/)
    if (mt) return mt.index! + mt[0].length
    const beg = source.match(/\\begin\{document\}/)
    return beg ? beg.index! + beg[0].length : 0
  }

  if ((op === 'after' || op === 'before') && target) {
    // Match any \section{...} whose name contains the target substring.
    const sectionRe = /\\section\*?\{([^}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = sectionRe.exec(source)) !== null) {
      if (m[1].toLowerCase().includes(target)) {
        if (op === 'before') return m.index
        // 'after': insert before the *next* \section, \begin{thebibliography}, or \end{document}.
        const startIdx = m.index + m[0].length
        const tailRe = /\\section\*?\{|\\begin\{thebibliography\}|\\end\{document\}/g
        tailRe.lastIndex = startIdx
        const next = tailRe.exec(source)
        return next ? next.index : defaultOffset
      }
    }
  }

  return defaultOffset
}

// Convert a BlockSpec into a LaTeX source fragment for source-mode editors.
function blockSpecToLatex(spec: BlockSpec): string {
  const c = spec.content.trim()
  switch (spec.type) {
    case 'h1': return `\\section{${c}}\n`
    case 'h2': return `\\subsection{${c}}\n`
    case 'h3': return `\\subsubsection{${c}}\n`
    case 'latex':
      // If the user already wrote a full env or $...$, pass through. Otherwise wrap.
      if (/\\begin\{|^\$/.test(c)) return `${c}\n`
      return `\\begin{equation}\n  ${c}\n\\end{equation}\n`
    case 'code': return `\\begin{verbatim}\n${c}\n\\end{verbatim}\n`
    case 'quote': return `\\begin{quote}\n${c}\n\\end{quote}\n`
    case 'bullet_list':
      return `\\begin{itemize}\n${c.split('\n').filter(Boolean).map(l => `  \\item ${l}`).join('\n')}\n\\end{itemize}\n`
    case 'ordered_list':
      return `\\begin{enumerate}\n${c.split('\n').filter(Boolean).map(l => `  \\item ${l}`).join('\n')}\n\\end{enumerate}\n`
    default: return `${c}\n`
  }
}

// ─── Context ───────────────────────────────────────────────────────────────────

const EditorBridgeContext = createContext<EditorBridge>({
  isEditorActive: false,
  insertBlocks: () => {},
  appendSource: () => {},
  register: () => {},
  unregister: () => {},
})

export function useEditorBridge() {
  return useContext(EditorBridgeContext)
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export function EditorBridgeProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<RegisterPayload | null>(null)

  const register = useCallback((payload: RegisterPayload) => {
    ref.current = payload
  }, [])

  const unregister = useCallback(() => {
    ref.current = null
  }, [])

  const insertBlocks = useCallback((specs: BlockSpec[]) => {
    const cur = ref.current
    if (!cur) return

    // Source-mode editor: translate blocks → LaTeX, splice at target offset.
    if ('mode' in cur && cur.mode === 'source') {
      const source = cur.getSource()
      const latex = specs.map(blockSpecToLatex).join('\n')
      // Position taken from the first spec — all blocks in one call go together.
      const offset = findInsertOffset(source, specs[0]?.position)
      const before = source.slice(0, offset)
      const after = source.slice(offset)
      const lead = before.length === 0 || before.endsWith('\n') ? '' : '\n'
      const trail = after.length === 0 || after.startsWith('\n') ? '\n' : '\n\n'
      cur.setSource(before + lead + latex + trail + after)
      return
    }

    // Block-mode editor (legacy Editor.tsx).
    const blockCb = cur as BlockPayload
    const existing = blockCb.getBlocks()
    const normalizeContent = (type: BlockSpec['type'], raw: unknown): string => {
      const lines = Array.isArray(raw)
        ? (raw as unknown[]).map(String)
        : String(raw ?? '').split('\n')
      if (type === 'bullet_list') {
        return lines.map(l => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean).join('\n')
      }
      if (type === 'ordered_list') {
        return lines.map(l => l.replace(/^\s*\d+[.)]\s+/, '').trim()).filter(Boolean).join('\n')
      }
      return Array.isArray(raw) ? (raw as string[]).join('\n') : String(raw ?? '')
    }
    const created: Block[] = specs.map(s => ({
      ...newBlock(s.type),
      content: normalizeContent(s.type, s.content),
      meta: s.meta ?? newBlock(s.type).meta,
    }))
    blockCb.setBlocks([...existing, ...created])
  }, [])

  const appendSource = useCallback((text: string) => {
    const cur = ref.current
    if (!cur) return
    if ('mode' in cur && cur.mode === 'source') {
      const sep = cur.getSource().endsWith('\n') ? '' : '\n'
      cur.setSource(cur.getSource() + sep + text)
      return
    }
    const blockCb = cur as BlockPayload
    const existing = blockCb.getBlocks()
    blockCb.setBlocks([...existing, { ...newBlock('paragraph'), content: text }])
  }, [])

  const value: EditorBridge = {
    get isEditorActive() { return ref.current !== null },
    insertBlocks,
    appendSource,
    register,
    unregister,
  }

  return (
    <EditorBridgeContext.Provider value={value}>
      {children}
    </EditorBridgeContext.Provider>
  )
}
