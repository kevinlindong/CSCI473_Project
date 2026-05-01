import { createContext, useContext, useCallback, useRef } from 'react'
import type { Block, BlockType } from '../hooks/useDocument'
import { newBlock } from '../hooks/useDocument'

export interface BlockSpec {
  type: BlockType
  content: string
  meta?: Record<string, unknown>
  position?: string
}

interface EditorBridge {
  isEditorActive: boolean
  insertBlocks: (specs: BlockSpec[]) => void
  appendSource: (text: string) => void
  getSource: () => string | null
  insertCitation: (paperId: string, opts?: { title?: string; authors?: string[] }) => boolean
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
    const sectionRe = /\\section\*?\{([^}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = sectionRe.exec(source)) !== null) {
      if (m[1].toLowerCase().includes(target)) {
        if (op === 'before') return m.index
        const startIdx = m.index + m[0].length
        const tailRe = /\\section\*?\{|\\begin\{thebibliography\}|\\end\{document\}/g
        tailRe.lastIndex = startIdx
        const next = tailRe.exec(source)
        return next ? next.index : defaultOffset
      }
    }

    const envName = target === 'references' || target === 'bibliography'
      ? 'thebibliography'
      : target
    const envBeginRe = new RegExp(`\\\\begin\\{${envName}\\}`)
    const envBegin = source.match(envBeginRe)
    if (envBegin) {
      if (op === 'before') return envBegin.index!
      const envEndRe = new RegExp(`\\\\end\\{${envName}\\}`)
      const envEnd = source.match(envEndRe)
      if (envEnd) {
        const eolAfter = source.indexOf('\n', envEnd.index! + envEnd[0].length)
        return eolAfter === -1 ? envEnd.index! + envEnd[0].length : eolAfter + 1
      }
    }

    const cmdNames = ['title', 'author', 'date', 'maketitle']
    if (cmdNames.includes(target)) {
      const cmdRe = target === 'maketitle'
        ? /\\maketitle\b/
        : new RegExp(`\\\\${target}\\b(?:\\s*\\{[^}]*\\})?`)
      const cmd = source.match(cmdRe)
      if (cmd) {
        if (op === 'before') return cmd.index!
        const eolAfter = source.indexOf('\n', cmd.index! + cmd[0].length)
        return eolAfter === -1 ? cmd.index! + cmd[0].length : eolAfter + 1
      }
    }
  }

  return defaultOffset
}

function blockSpecToLatex(spec: BlockSpec): string {
  const c = spec.content.trim()
  switch (spec.type) {
    case 'h1': return `\\section{${c}}\n`
    case 'h2': return `\\subsection{${c}}\n`
    case 'h3': return `\\subsubsection{${c}}\n`
    case 'latex':
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

const EditorBridgeContext = createContext<EditorBridge>({
  isEditorActive: false,
  insertBlocks: () => {},
  appendSource: () => {},
  getSource: () => null,
  insertCitation: () => false,
  register: () => {},
  unregister: () => {},
})

export function useEditorBridge() {
  return useContext(EditorBridgeContext)
}

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

    if ('mode' in cur && cur.mode === 'source') {
      const source = cur.getSource()
      const latex = specs.map(blockSpecToLatex).join('\n')
      const offset = findInsertOffset(source, specs[0]?.position)
      const before = source.slice(0, offset)
      const after = source.slice(offset)
      const lead = before.length === 0 || before.endsWith('\n') ? '' : '\n'
      const trail = after.length === 0 || after.startsWith('\n') ? '\n' : '\n\n'
      cur.setSource(before + lead + latex + trail + after)
      return
    }

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

  const getSource = useCallback((): string | null => {
    const cur = ref.current
    if (!cur || !('mode' in cur) || cur.mode !== 'source') return null
    return cur.getSource()
  }, [])

  const insertCitation = useCallback(
    (paperId: string, opts?: { title?: string; authors?: string[] }): boolean => {
      const cur = ref.current
      if (!cur || !('mode' in cur) || cur.mode !== 'source') return false

      // arXiv ids contain dots; LaTeX bibitem keys must be alphanumeric.
      const safeId = paperId.replace(/[^A-Za-z0-9]/g, '_')
      const title = opts?.title?.trim() || paperId
      const authors = (opts?.authors ?? []).filter(Boolean).join(', ')
      const bibBody = `${authors ? authors + '. ' : ''}${title}. arXiv:${paperId}.`

      let source = cur.getSource()

      if (!new RegExp(`\\\\bibitem\\{${safeId}\\}`).test(source)) {
        const bibBegin = source.match(/\\begin\{thebibliography\}[^\n]*\n?/)
        if (bibBegin) {
          const bibEndIdx = source.indexOf('\\end{thebibliography}', bibBegin.index! + bibBegin[0].length)
          const insertAt = bibEndIdx >= 0 ? bibEndIdx : source.length
          const before = source.slice(0, insertAt)
          const after = source.slice(insertAt)
          source = `${before}  \\bibitem{${safeId}} ${bibBody}\n${after}`
        } else {
          const endDoc = source.match(/\\end\{document\}/)
          const insertAt = endDoc ? endDoc.index! : source.length
          const before = source.slice(0, insertAt)
          const after = source.slice(insertAt)
          const block =
            `\n\\begin{thebibliography}{99}\n` +
            `  \\bibitem{${safeId}} ${bibBody}\n` +
            `\\end{thebibliography}\n\n`
          source = before + block + after
        }
      }

      const bibBeginAfter = source.match(/\\begin\{thebibliography\}/)
      const endDocAfter = source.match(/\\end\{document\}/)
      const citeAnchor = bibBeginAfter?.index ?? endDocAfter?.index ?? source.length
      const lineStart = source.lastIndexOf('\n', citeAnchor - 1) + 1
      const before = source.slice(0, lineStart)
      const after = source.slice(lineStart)
      const lead = before.length === 0 || before.endsWith('\n') ? '' : '\n'
      source = `${before}${lead}\\cite{${safeId}}\n${after}`

      cur.setSource(source)
      return true
    },
    [],
  )

  const value: EditorBridge = {
    get isEditorActive() { return ref.current !== null },
    insertBlocks,
    appendSource,
    getSource,
    insertCitation,
    register,
    unregister,
  }

  return (
    <EditorBridgeContext.Provider value={value}>
      {children}
    </EditorBridgeContext.Provider>
  )
}
