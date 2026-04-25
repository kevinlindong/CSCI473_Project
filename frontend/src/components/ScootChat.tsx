import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditorBridge, type BlockSpec } from '../contexts/EditorBridgeContext'
import { useDrafts, SCRATCH_ID } from '../hooks/useDrafts'
import type { BlockType } from '../hooks/useDocument'

/* ==========================================================================
   ScootChat — draggable chat overlay for the scoot agent.
   - Hits POST /api/scoot (local Qwen model) for replies.
   - Parses [OPEN_DRAFT], [INSERT_BLOCK], [SEARCH_CORPUS] tags from replies
     and dispatches actions via react-router, EditorBridge, and /api/query.
   ========================================================================== */

type ChatMsg = { role: 'user' | 'assistant'; content: string }

interface Props {
  open: boolean
  onClose: () => void
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

const apiUrl = (path: string) => {
  const base = API_BASE.replace(/\/$/, '')
  if (base.endsWith('/api')) return `${base}${path}`
  return `${base}/api${path}`
}

// Map scoot's INSERT_BLOCK type strings → editor BlockType.
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

// Tag regex: captures attribute string and inner content. Tags are not nested.
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

export function ScootChat({ open, onClose }: Props) {
  const navigate = useNavigate()
  const editorBridge = useEditorBridge()
  const { drafts } = useDrafts()

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  // Position (bottom-right anchored). Persisted across opens within session.
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 })
  const dragging = useRef(false)
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, busy])

  // ── Drag handling ──────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !dragStart.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    // Right/bottom anchored — dragging right/down decreases the offset.
    setPos({
      x: Math.max(8, dragStart.current.px - dx),
      y: Math.max(8, dragStart.current.py - dy),
    })
  }
  const onPointerUp = () => { dragging.current = false; dragStart.current = null }

  // ── Action dispatchers ─────────────────────────────────────────────────
  const dispatchOpenDraft = useCallback((query: string) => {
    const q = query.toLowerCase().trim()
    if (!q) return false
    const match = drafts.find(d => d.title.toLowerCase().includes(q))
    if (match) {
      navigate(`/editor/${match.id}`)
      return true
    }
    // Fall back to scratch draft when nothing matches.
    navigate(`/editor/${SCRATCH_ID}`)
    return false
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

  // ── Submit a turn ──────────────────────────────────────────────────────
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
        const ok = dispatchOpenDraft(q)
        sideEffects.push(ok ? `opened "${q}"` : `couldn't find "${q}" — opened scratch instead`)
      }

      if (parsed.insertBlocks.length) {
        const ok = dispatchInsertBlocks(parsed.insertBlocks)
        sideEffects.push(ok ? `inserted ${parsed.insertBlocks.length} block(s) into editor` : 'open the editor first to insert blocks')
      }

      let corpusAppendix = ''
      for (const q of parsed.searchCorpus) {
        const ans = await dispatchCorpusSearch(q)
        corpusAppendix += `\n\n📚 corpus search: "${q}"\n${ans}`
      }

      const assistantText = [
        parsed.cleaned,
        sideEffects.length ? `\n_${sideEffects.join(' · ')}_` : '',
        corpusAppendix,
      ].filter(Boolean).join('\n').trim() || '(scoot replied with only actions)'

      setMessages(m => [...m, { role: 'assistant', content: assistantText }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages(m => [...m, { role: 'assistant', content: `scoot is offline (${msg})` }])
    } finally {
      setBusy(false)
    }
  }, [input, busy, messages, dispatchOpenDraft, dispatchInsertBlocks, dispatchCorpusSearch])

  if (!open) return null

  return (
    <div
      className="fixed z-[60] w-[400px] max-w-[92vw] h-[520px] max-h-[80vh] flex flex-col rounded-2xl
                 bg-cream border border-forest/15 shadow-[0_24px_60px_-20px_rgba(38,70,53,0.45)]"
      style={{ right: pos.x, bottom: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Header / drag handle */}
      <div
        data-drag-handle
        className="flex items-center justify-between px-4 h-11 border-b border-forest/10 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <span className="font-[family-name:var(--font-display)] text-[15px] text-forest leading-none">scoot</span>
          <span className="font-mono text-[9px] text-forest/40 tracking-[0.2em] uppercase ml-1">research agent</span>
        </div>
        <button
          onClick={onClose}
          className="text-forest/50 hover:text-forest transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-forest/[0.06]"
          aria-label="Close scoot"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-forest/55 font-[family-name:var(--font-body)] text-[13px] leading-relaxed">
            <div className="font-[family-name:var(--font-display)] text-[18px] text-forest mb-2">hi — i'm scoot.</div>
            <div>i help you write research papers. try:</div>
            <ul className="list-none mt-2 space-y-1.5 text-[12.5px]">
              <li className="text-forest/65">› open my quantitative finance paper</li>
              <li className="text-forest/65">› insert a latex block for the navier-stokes equation</li>
              <li className="text-forest/65">› what does the corpus say about contrastive learning?</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-[13px] leading-relaxed font-[family-name:var(--font-body)] whitespace-pre-wrap break-words ${
              m.role === 'user'
                ? 'bg-sage/15 text-forest rounded-2xl rounded-br-sm px-3 py-2 ml-8 self-end'
                : 'bg-parchment text-forest/85 rounded-2xl rounded-bl-sm px-3 py-2 mr-8 border border-forest/10'
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="text-[12px] font-mono text-forest/40 tracking-wider">scoot is thinking…</div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-forest/10 p-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="ask scoot anything…"
          rows={2}
          className="w-full resize-none bg-parchment/60 border border-forest/12 rounded-xl px-3 py-2
                     text-[13px] font-[family-name:var(--font-body)] text-forest placeholder:text-forest/35
                     focus:outline-none focus:border-forest/30 transition-colors"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="font-mono text-[9px] text-forest/35 tracking-[0.2em] uppercase">
            {editorBridge.isEditorActive ? 'editor connected' : 'open editor for inserts'}
          </span>
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="px-3 h-7 rounded-full bg-forest text-parchment text-[12px] font-[family-name:var(--font-body)]
                       hover:bg-forest-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            send
          </button>
        </div>
      </div>
    </div>
  )
}
