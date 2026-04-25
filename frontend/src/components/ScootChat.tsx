import { useState, useRef, useEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditorBridge, type BlockSpec } from '../contexts/EditorBridgeContext'
import { useDrafts } from '../hooks/useDrafts'
import type { BlockType } from '../hooks/useDocument'

/* ==========================================================================
   ScootChat — floating, draggable chat overlay for the scoot agent.
   - No backdrop: the page behind stays interactive and unblurred.
   - Drag from the grip strip at the top of the panel.
   - Position persists in localStorage between opens.
   - Hits POST /api/scoot (local Qwen model) for replies.
   ========================================================================== */

type ChatMsg = { role: 'user' | 'assistant'; content: string }

interface Props {
  open: boolean
  onClose: () => void
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
const PANEL_WIDTH = 640
const POSITION_KEY = 'scoot_chat_pos_v1'

const apiUrl = (path: string) => {
  const base = API_BASE.replace(/\/$/, '')
  if (base.endsWith('/api')) return `${base}${path}`
  return `${base}/api${path}`
}

function mapBlockType(raw: string): BlockType {
  const t = raw.toLowerCase().trim()
  if (t === 'latex' || t === 'math' || t === 'equation') return 'latex'
  if (t === 'code') return 'code'
  if (t === 'heading' || t === 'h2') return 'h2'
  if (t === 'h1') return 'h1'
  if (t === 'h3') return 'h3'
  if (t === 'quote') return 'quote'
  return 'paragraph'
}

const OPEN_DRAFT_RE = /\[OPEN_DRAFT\]([\s\S]*?)\[\/OPEN_DRAFT\]/g
const INSERT_BLOCK_RE = /\[INSERT_BLOCK([^\]]*)\]([\s\S]*?)\[\/INSERT_BLOCK\]/g
const SEARCH_CORPUS_RE = /\[SEARCH_CORPUS\]([\s\S]*?)\[\/SEARCH_CORPUS\]/g

function parseAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) out[m[1]] = m[2]
  return out
}

interface ParsedActions {
  openDraft: string[]
  insertBlocks: BlockSpec[]
  searchCorpus: string[]
  cleaned: string
}

function parseActions(reply: string): ParsedActions {
  const openDraft: string[] = []
  const insertBlocks: BlockSpec[] = []
  const searchCorpus: string[] = []

  reply.replace(OPEN_DRAFT_RE, (_, q) => { openDraft.push(q.trim()); return '' })
  reply.replace(INSERT_BLOCK_RE, (_, attr, content) => {
    const attrs = parseAttrs(attr)
    insertBlocks.push({
      type: mapBlockType(attrs.type ?? 'text'),
      content: content.trim(),
      position: attrs.position,
    })
    return ''
  })
  reply.replace(SEARCH_CORPUS_RE, (_, q) => { searchCorpus.push(q.trim()); return '' })

  const cleaned = reply
    .replace(OPEN_DRAFT_RE, '')
    .replace(INSERT_BLOCK_RE, '')
    .replace(SEARCH_CORPUS_RE, '')
    .trim()

  return { openDraft, insertBlocks, searchCorpus, cleaned }
}

// ── Position helpers ────────────────────────────────────────────────────────

function loadPos(): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p
  } catch { /* ignore */ }
  return null
}

function defaultPos(): { x: number; y: number } {
  const w = typeof window === 'undefined' ? 1280 : window.innerWidth
  const h = typeof window === 'undefined' ? 720 : window.innerHeight
  return {
    x: Math.max(20, Math.round((w - PANEL_WIDTH) / 2)),
    y: Math.max(20, Math.round(h * 0.18)),
  }
}

export function ScootChat({ open, onClose }: Props) {
  const navigate = useNavigate()
  const editorBridge = useEditorBridge()
  const { drafts } = useDrafts()

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => loadPos() ?? defaultPos())
  const [dragging, setDragging] = useState(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, busy])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Persist drag position so the panel reopens where the user last left it.
  useEffect(() => {
    try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(pos)) } catch { /* ignore */ }
  }, [pos])

  // ── Drag handling ──────────────────────────────────────────────────────

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragOffset.current) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    const w = window.innerWidth
    const h = window.innerHeight
    const nextX = Math.min(Math.max(0, e.clientX - dragOffset.current.dx), w - rect.width)
    const nextY = Math.min(Math.max(0, e.clientY - dragOffset.current.dy), h - rect.height)
    setPos({ x: nextX, y: nextY })
  }

  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    dragOffset.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  // ── Action dispatchers ─────────────────────────────────────────────────

  const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'on', 'in', 'for', 'to', 'and', 'my'])

  const tokenScore = (qt: string, titleLower: string, titleWords: string[]): boolean => {
    if (titleLower.includes(qt)) return true
    if (qt.length < 4) return false
    const prefix = qt.slice(0, Math.min(qt.length, 5))
    return titleWords.some(tw => tw.startsWith(prefix))
  }

  const fuzzyMatch = (query: string, title: string, strict: boolean): boolean => {
    const titleLower = title.toLowerCase()
    const titleWords = titleLower.split(/[\s:,.\-—]+/).filter(Boolean)
    const qTokens = query.toLowerCase().split(/\s+/)
      .filter(Boolean)
      .filter(t => !STOP_WORDS.has(t))
    if (!qTokens.length) return false
    const hits = qTokens.filter(qt => tokenScore(qt, titleLower, titleWords)).length
    if (strict) return hits === qTokens.length
    const required = qTokens.length <= 2 ? qTokens.length : qTokens.length - 1
    return hits >= required
  }

  type OpenResult =
    | { status: 'opened'; title: string }
    | { status: 'ambiguous'; titles: string[] }
    | { status: 'notfound' }

  const dispatchOpenDraft = useCallback((query: string): OpenResult => {
    const q = query.toLowerCase().trim()
    if (!q) return { status: 'notfound' }

    let matches = drafts.filter(d => d.title.toLowerCase().includes(q))
    if (matches.length === 0) {
      matches = drafts.filter(d => fuzzyMatch(query, d.title, true))
    }
    if (matches.length === 0) {
      matches = drafts.filter(d => fuzzyMatch(query, d.title, false))
    }

    if (matches.length === 1) {
      navigate(`/editor/${matches[0].id}`)
      return { status: 'opened', title: matches[0].title }
    }
    if (matches.length > 1) {
      return { status: 'ambiguous', titles: matches.map(d => d.title) }
    }
    return { status: 'notfound' }
  }, [drafts, navigate])

  const dispatchInsertBlocks = useCallback((blocks: BlockSpec[]) => {
    if (!blocks.length) return false
    if (!editorBridge.isEditorActive) return false
    editorBridge.insertBlocks(blocks)
    return true
  }, [editorBridge])

  const dispatchCorpusSearch = useCallback(async (query: string): Promise<string> => {
    try {
      const res = await fetch(apiUrl('/query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      })
      if (!res.ok) return `corpus search failed (${res.status})`
      const data = await res.json()
      const ans = (data.answer ?? '').toString().trim()
      const cites = (data.citations ?? []) as Array<{ title: string; url: string }>
      const citeBlock = cites.slice(0, 3).map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`).join('\n')
      return citeBlock ? `${ans}\n\nsources:\n${citeBlock}` : ans
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return `corpus search error: ${msg}`
    }
  }, [])

  const submit = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const nextHistory: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setMessages(nextHistory)
    setBusy(true)
    try {
      const res = await fetch(apiUrl('/scoot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      const raw = (data.reply ?? '').toString()
      const parsed = parseActions(raw)

      const sideEffects: string[] = []

      for (const q of parsed.openDraft) {
        const result = dispatchOpenDraft(q)
        if (result.status === 'opened') {
          sideEffects.push(`Opened "${result.title}".`)
        } else if (result.status === 'ambiguous') {
          const list = result.titles.map(t => `  • ${t}`).join('\n')
          sideEffects.push(
            `I found a few papers matching "${q}":\n${list}\n\nWhich one would you like? Reply with more of the title to narrow it down.`
          )
        } else {
          sideEffects.push(`I couldn't find a paper matching "${q}" in your library.`)
        }
      }

      if (parsed.insertBlocks.length) {
        const ok = dispatchInsertBlocks(parsed.insertBlocks)
        const count = parsed.insertBlocks.length
        sideEffects.push(
          ok
            ? `Inserted ${count} block${count === 1 ? '' : 's'} into the editor.`
            : 'Open a paper in the editor first so I can insert content for you.'
        )
      }

      let corpusAppendix = ''
      for (const q of parsed.searchCorpus) {
        const ans = await dispatchCorpusSearch(q)
        corpusAppendix += `\n\nHere's what the corpus says about "${q}":\n\n${ans}`
      }

      const assistantText = [
        parsed.cleaned,
        sideEffects.join('\n\n'),
        corpusAppendix,
      ].filter(Boolean).join('\n\n').trim() || 'Done.'

      setMessages(m => [...m, { role: 'assistant', content: assistantText }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages(m => [...m, { role: 'assistant', content: `scoot is offline (${msg})` }])
    } finally {
      setBusy(false)
    }
  }, [input, busy, messages, dispatchOpenDraft, dispatchInsertBlocks, dispatchCorpusSearch])

  if (!open) return null

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const hasMessages = messages.length > 0 || busy

  return (
    <div
      ref={panelRef}
      className={`fixed z-[60] w-[640px] max-w-[92vw] flex flex-col rounded-2xl bg-cream
                  border border-forest/15 shadow-[0_28px_72px_-18px_rgba(26,47,38,0.5)]
                  animate-palette-pop ${dragging ? 'select-none' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="scoot research agent"
    >
      {/* Drag handle — entire strip is grabbable, with a centered grip pill */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className={`flex items-center justify-center pt-2 pb-1.5 rounded-t-2xl
                    ${dragging ? 'cursor-grabbing' : 'cursor-grab'}
                    hover:bg-forest/[0.04] transition-colors`}
        aria-label="Drag to move"
      >
        <span className="w-9 h-1 rounded-full bg-forest/15" />
      </div>

      {/* Input row — single baseline, items-center for clean alignment */}
      <div className="flex items-center gap-3 px-5 pb-3 border-b border-forest/10">
        <span className="w-2 h-2 rounded-full bg-sage shrink-0" />
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="ask scoot anything…"
          rows={1}
          className="flex-1 resize-none bg-transparent border-0 outline-none
                     text-[15px] font-[family-name:var(--font-body)] text-forest placeholder:text-forest/35
                     leading-[1.4] max-h-[160px] py-1"
        />
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[9px] text-forest/35 tracking-[0.2em] uppercase hidden sm:inline leading-none">
            {busy ? 'thinking…' : editorBridge.isEditorActive ? 'editor connected' : '⌘K · esc'}
          </span>
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="px-3 h-7 rounded-full bg-forest text-parchment text-[11px] font-[family-name:var(--font-body)]
                       hover:bg-forest-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors leading-none flex items-center"
          >
            send
          </button>
          <button
            onClick={onClose}
            className="text-forest/45 hover:text-forest transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-forest/[0.06] text-[13px] leading-none"
            aria-label="Close scoot"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Empty state — left-aligned with the input dot via matching px-5 */}
      {!hasMessages && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-[family-name:var(--font-display)] text-[14px] text-forest leading-none">scoot</span>
            <span className="font-mono text-[9px] text-forest/40 tracking-[0.2em] uppercase leading-none">research agent</span>
          </div>
          <ul className="list-none space-y-1.5 text-[12.5px] font-[family-name:var(--font-body)] text-forest/55 leading-snug">
            <li>› open my quantitative finance paper</li>
            <li>› insert a latex block for the navier-stokes equation</li>
            <li>› what does the corpus say about contrastive learning?</li>
          </ul>
        </div>
      )}

      {/* Scrollable conversation history */}
      {hasMessages && (
        <div
          ref={scrollRef}
          className="overflow-y-auto px-5 py-4 space-y-3 max-h-[55vh]"
        >
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] text-[13.5px] leading-relaxed font-[family-name:var(--font-body)] whitespace-pre-wrap break-words text-left ${
                  m.role === 'user'
                    ? 'bg-sage/15 text-forest rounded-2xl rounded-br-sm px-3.5 py-2'
                    : 'bg-parchment text-forest/85 rounded-2xl rounded-bl-sm px-3.5 py-2 border border-forest/10'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="text-[12px] font-mono text-forest/40 tracking-wider pl-1">scoot is thinking…</div>
          )}
        </div>
      )}
    </div>
  )
}
