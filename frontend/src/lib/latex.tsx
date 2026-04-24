import { type ReactNode } from 'react'
import katex from 'katex'

/* ==========================================================================
   Minimal LaTeX → React renderer.
   Supports: \documentclass, preamble (\title, \author, \date, \affiliation),
   \maketitle, \begin{abstract}, \section, \subsection, \subsubsection,
   \textbf, \textit, \emph, \underline, \texttt, \textsc, \cite, \ref,
   \begin{itemize|enumerate}, \item, \begin{figure}, \caption,
   \begin{equation}, \begin{align}, \begin{displaymath}, \[ \], $...$, $$...$$,
   \LaTeX, \TeX, \&, \%, \_, ``...'', \\, and citation/figure numbering.
   ========================================================================== */

export type PaperMeta = {
  title?: string
  authors?: string[]
  affiliations?: string[]
  date?: string
  abstract?: string
  keywords?: string[]
}

type Env = {
  name: string
  body: string
  argKey?: string
}

// ─── utilities ──────────────────────────────────────────────────────────────

const stripComments = (src: string): string =>
  src.replace(/(?<!\\)%.*$/gm, '')

// Strip balanced {…}, supports one level of nested braces
const takeBraceArg = (s: string, start: number): { arg: string; end: number } => {
  let i = start
  while (i < s.length && /\s/.test(s[i])) i++
  if (s[i] !== '{') return { arg: '', end: start }
  let depth = 1
  let j = i + 1
  while (j < s.length && depth > 0) {
    if (s[j] === '\\' && j + 1 < s.length) { j += 2; continue }
    if (s[j] === '{') depth++
    else if (s[j] === '}') depth--
    j++
  }
  return { arg: s.slice(i + 1, j - 1), end: j }
}

const takeOptionalArg = (s: string, start: number): { arg: string; end: number } => {
  let i = start
  while (i < s.length && /\s/.test(s[i])) i++
  if (s[i] !== '[') return { arg: '', end: start }
  let depth = 1
  let j = i + 1
  while (j < s.length && depth > 0) {
    if (s[j] === '[') depth++
    else if (s[j] === ']') depth--
    j++
  }
  return { arg: s.slice(i + 1, j - 1), end: j }
}

// ─── preamble extraction ────────────────────────────────────────────────────

export function extractMeta(source: string): { meta: PaperMeta; body: string } {
  const src = stripComments(source)
    .replace(/[\uFF3C\u2216\u29F5\uFE68]/g, '\\')
    .replace(/[\u200B-\u200F\u061C\u2060-\u206F\uFEFF]/g, '')
  const meta: PaperMeta = {}
  const preamble = src.match(/^[\s\S]*?(?=\\begin\{document\}|$)/)?.[0] ?? src

  const grab = (cmd: string): string | undefined => {
    const re = new RegExp(`\\\\${cmd}(?![a-zA-Z@])\\s*(?:\\[[^\\]]*\\]\\s*)*\\{`)
    const m = src.match(re)
    if (!m || m.index === undefined) return undefined
    // Scan for the matching '}', but bail out if we hit \begin{document} or
    // \maketitle — a preamble command with a runaway closing brace would
    // otherwise slurp the entire document body. We don't bail on blank
    // lines: some users put multi-line keyword lists with blank lines for
    // readability, and the document-start guard is already sufficient.
    const openIdx = m.index + m[0].length - 1
    let depth = 1
    let j = openIdx + 1
    while (j < src.length && depth > 0) {
      const ch = src[j]
      if (ch === '\\') {
        if (/^\\(?:begin\{document\}|maketitle\b)/.test(src.slice(j))) return undefined
        if (j + 1 < src.length) { j += 2; continue }
      }
      if (ch === '{') depth++
      else if (ch === '}') depth--
      j++
    }
    if (depth !== 0) return undefined
    const arg = src.slice(openIdx + 1, j - 1).trim()
    return arg || undefined
  }

  const grabAny = (...cmds: string[]): string | undefined => {
    for (const cmd of cmds) {
      const value = grab(cmd)
      if (value) return value
    }
    return undefined
  }

  const grabLine = (...cmds: string[]): string | undefined => {
    const commandSet = new Set(cmds.map(c => c.toLowerCase()))
    for (const rawLine of preamble.split(/\r?\n/)) {
      const line = rawLine.trim()
      const slashIdx = line.indexOf('\\')
      if (slashIdx < 0) continue
      const cmdMatch = line.slice(slashIdx).match(/^\\([a-zA-Z@]+)\*?(.*)$/)
      if (!cmdMatch) continue
      if (!commandSet.has(cmdMatch[1].toLowerCase())) continue
      const withNoOpt = cmdMatch[2].trim().replace(/^\[[^\]]*\]\s*/, '')
      if (!withNoOpt || withNoOpt.startsWith('{')) continue
      const value = withNoOpt.replace(/^\s*[:=]\s*/, '').trim()
      if (value) return value
    }
    return undefined
  }

  const splitList = (raw: string, splitter: RegExp): string[] =>
    raw
      .split(splitter)
      .map(item => item.trim())
      .filter(Boolean)

  const titleRaw = grab('title') ?? grabLine('title')
  if (titleRaw) meta.title = titleRaw

  const authorRaw = grabAny('author', 'authors') ?? grabLine('author', 'authors')
  if (authorRaw) {
    const authors = splitList(
      authorRaw.replace(/\\\\(?:\[[^\]]*\])?/g, '\n'),
      /\\and\b|\s+and\s+|,\s*|;\s*|\n+/i,
    )
    if (authors.length > 0) meta.authors = authors
  }

  const dateRaw = grab('date') ?? grabLine('date')
  if (dateRaw) {
    meta.date = /^\\today\b/.test(dateRaw.trim())
      ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
      : dateRaw
  }

  const affilRaw = grabAny('affiliation', 'affil') ?? grabLine('affiliation', 'affil')
  if (affilRaw) {
    const affiliations = splitList(
      affilRaw.replace(/\\\\(?:\[[^\]]*\])?/g, '\n'),
      /\\and\b|,\s*|;\s*|\n+/i,
    )
    if (affiliations.length > 0) meta.affiliations = affiliations
  }

  const keywordEnvRaw = src.match(/\\begin\{keywords?\}([\s\S]*?)\\end\{keywords?\}/)?.[1]
  const keywordLooseRaw = preamble.match(/\\keywords?(?![a-zA-Z@])(?:\s*\[[^\]]*\])?\s*[:=]?\s*([^\r\n%]*)/i)?.[1]
  const keywordRaw = grabAny('keywords', 'keyword') ?? keywordEnvRaw ?? grabLine('keywords', 'keyword') ?? keywordLooseRaw
  if (keywordRaw) {
    const keywords = splitList(
      keywordRaw
        .replace(/^\{\s*|\s*\}$/g, '')
        .replace(/\\\\(?:\[[^\]]*\])?/g, '\n'),
      /\\sep\b|,\s*|;\s*|\n+/i,
    )
    if (keywords.length > 0) meta.keywords = keywords
  }

  const abstractMatch = src.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/)
  let abstractRaw = abstractMatch?.[1].trim()
  if (abstractRaw) {
    const abstractKeywordLabel = /(?:\\vspace\{[^}]*\}\s*)*(?:\\noindent\s*)?(?:\\textbf\{)?\s*keywords?\s*[:\-]\s*(?:\})?/i
    const keywordLineIdx = abstractRaw.search(abstractKeywordLabel)
    if (keywordLineIdx >= 0) {
      const keywordTail = abstractRaw.slice(keywordLineIdx).replace(abstractKeywordLabel, '').trim()
      if (!meta.keywords || meta.keywords.length === 0) {
        const keywords = splitList(
          keywordTail
            .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, ' ')
            .replace(/[{}]/g, ' ')
            .replace(/[.\s\\]+$/, ''),
          /\\sep\b|,\s*|;\s*|\n+/i,
        ).map(k => k.replace(/\s+/g, ' ').trim().replace(/[.\s\\]+$/, ''))
        if (keywords.length > 0) meta.keywords = keywords
      }
      abstractRaw = abstractRaw.slice(0, keywordLineIdx).trim()
    }
    if (abstractRaw) meta.abstract = abstractRaw
  }

  const bodyMatch = src.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/)
  let body = bodyMatch ? bodyMatch[1] : src
  // Abstract is hoisted into meta and rendered above the body, so strip it
  // from the body to avoid rendering it twice.
  body = body.replace(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/g, '')
  return { meta, body }
}

// ─── math rendering ─────────────────────────────────────────────────────────

function renderMath(expr: string, display: boolean, key: string | number): ReactNode {
  try {
    const html = katex.renderToString(expr.trim(), {
      displayMode: display,
      throwOnError: false,
      trust: true,
      strict: false,
      output: 'html',
    })
    return (
      <span
        key={key}
        className={display ? 'block my-5 text-[1.02em]' : 'inline-block align-middle'}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  } catch {
    return <code key={key} className="text-sienna">{expr}</code>
  }
}

// ─── inline parser ──────────────────────────────────────────────────────────
// Handles commands inside paragraph text: math, \textbf, \textit, \cite, etc.

type Refs = {
  citations: Map<string, number>
  figures: Map<string, number>
  sections: Map<string, string>
  citationList: string[]
}

function parseInline(src: string, refs: Refs, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  let textBuf = ''
  let pushText = () => {
    if (!textBuf) return
    const cooked = textBuf
      .replace(/``/g, '\u201C')
      .replace(/''/g, '\u201D')
      .replace(/`/g, '\u2018')
      .replace(/~/g, '\u00A0')
      .replace(/---/g, '\u2014')
      .replace(/--/g, '\u2013')
    out.push(cooked)
    textBuf = ''
  }

  let ctr = 0

  while (i < src.length) {
    const ch = src[i]

    // Display math: $$...$$ or \[...\]
    if (src.startsWith('$$', i)) {
      pushText()
      const end = src.indexOf('$$', i + 2)
      if (end < 0) { textBuf += ch; i++; continue }
      out.push(renderMath(src.slice(i + 2, end), true, `${keyBase}-m${ctr++}`))
      i = end + 2
      continue
    }
    if (src.startsWith('\\[', i)) {
      pushText()
      const end = src.indexOf('\\]', i + 2)
      if (end < 0) { textBuf += ch; i++; continue }
      out.push(renderMath(src.slice(i + 2, end), true, `${keyBase}-m${ctr++}`))
      i = end + 2
      continue
    }

    // Inline math: $...$ or \(...\)
    if (ch === '$' && src[i - 1] !== '\\') {
      pushText()
      const end = src.indexOf('$', i + 1)
      if (end < 0) { textBuf += ch; i++; continue }
      out.push(renderMath(src.slice(i + 1, end), false, `${keyBase}-m${ctr++}`))
      i = end + 1
      continue
    }
    if (src.startsWith('\\(', i)) {
      pushText()
      const end = src.indexOf('\\)', i + 2)
      if (end < 0) { textBuf += ch; i++; continue }
      out.push(renderMath(src.slice(i + 2, end), false, `${keyBase}-m${ctr++}`))
      i = end + 2
      continue
    }

    // Line break \\
    if (src.startsWith('\\\\', i)) {
      pushText()
      out.push(<br key={`${keyBase}-br${ctr++}`} />)
      i += 2
      continue
    }

    // Backslash command
    if (ch === '\\') {
      // Command name
      const m = src.slice(i).match(/^\\([a-zA-Z@]+)\*?/)
      if (!m) {
        // Escaped character like \& \% \_ \$ \{ \}
        const next = src[i + 1]
        if (next && /[&%_$#{}]/.test(next)) {
          pushText()
          out.push(next)
          i += 2
          continue
        }
        textBuf += ch
        i++
        continue
      }
      const cmd = m[1]
      const afterCmd = i + m[0].length

      // Special zero-arg commands
      if (cmd === 'LaTeX') { pushText(); out.push(<span key={`${keyBase}-${ctr++}`} className="font-[family-name:var(--font-body)]">L<span className="text-[0.75em] align-[0.25em] -mx-[0.12em]">A</span>T<span className="align-[-0.2em] -mx-[0.06em]">E</span>X</span>); i = afterCmd; continue }
      if (cmd === 'TeX')   { pushText(); out.push(<span key={`${keyBase}-${ctr++}`} className="font-[family-name:var(--font-body)]">T<span className="align-[-0.2em] -mx-[0.06em]">E</span>X</span>); i = afterCmd; continue }
      if (cmd === 'today') { pushText(); textBuf += new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); i = afterCmd; continue }
      if (cmd === 'maketitle' || cmd === 'tableofcontents' || cmd === 'bigskip' || cmd === 'medskip' || cmd === 'smallskip' || cmd === 'newpage' || cmd === 'clearpage' || cmd === 'par') {
        pushText(); i = afterCmd; continue
      }

      // Commands taking one brace argument
      pushText()
      const { arg: optArg, end: afterOpt } = takeOptionalArg(src, afterCmd)
      const { arg, end } = takeBraceArg(src, afterOpt)

      const inner = parseInline(arg, refs, `${keyBase}-${cmd}${ctr}`)
      switch (cmd) {
        case 'textbf':
        case 'mathbf':
        case 'bm':
          out.push(<strong key={`${keyBase}-${ctr++}`} className="font-semibold">{inner}</strong>); break
        case 'textit':
        case 'emph':
        case 'textsl':
          out.push(<em key={`${keyBase}-${ctr++}`}>{inner}</em>); break
        case 'underline':
          out.push(<span key={`${keyBase}-${ctr++}`} className="underline decoration-forest/40 underline-offset-2">{inner}</span>); break
        case 'texttt':
        case 'verb':
          out.push(<code key={`${keyBase}-${ctr++}`} className="font-[family-name:var(--font-mono)] text-[0.88em] bg-forest/[0.05] px-1 py-[1px] squircle-sm text-forest/80">{inner}</code>); break
        case 'textsc':
          out.push(<span key={`${keyBase}-${ctr++}`} className="smcp">{inner}</span>); break
        case 'uppercase':
          out.push(<span key={`${keyBase}-${ctr++}`} className="uppercase">{inner}</span>); break
        case 'cite':
        case 'citep':
        case 'citet': {
          const keys = arg.split(/,\s*/).map(k => k.trim()).filter(Boolean)
          const nums = keys.map(k => {
            if (!refs.citations.has(k)) {
              refs.citations.set(k, refs.citations.size + 1)
              refs.citationList.push(k)
            }
            return refs.citations.get(k)!
          })
          out.push(
            <span key={`${keyBase}-${ctr++}`} className="inline-flex items-baseline font-[family-name:var(--font-body)] text-[0.82em] text-rust bg-amber/10 border border-amber/30 rounded px-1 py-[1px] mx-[1px] align-baseline">
              [{nums.join(', ')}]
            </span>
          )
          break
        }
        case 'ref':
        case 'eqref':
          out.push(<span key={`${keyBase}-${ctr++}`} className="text-moss font-medium">§{arg}</span>); break
        case 'label':
          // swallow labels — they're for refs, not display
          break
        case 'footnote':
          out.push(<sup key={`${keyBase}-${ctr++}`} className="text-forest/50 font-[family-name:var(--font-body)] text-[0.72em] mx-[1px]">*</sup>); break
        case 'url':
        case 'href':
          out.push(<a key={`${keyBase}-${ctr++}`} href={arg} className="text-moss underline decoration-moss/40 underline-offset-2 hover:text-forest" target="_blank" rel="noreferrer">{optArg ? optArg : arg}</a>); break
        case 'textcolor': {
          // \textcolor{color}{text} — consume color then keep text
          const { arg: text2, end: e2 } = takeBraceArg(src, end)
          out.push(<span key={`${keyBase}-${ctr++}`}>{parseInline(text2, refs, `${keyBase}-c${ctr}`)}</span>)
          i = e2
          continue
        }
        case 'S':
          out.push('§'); break
        case 'ldots':
        case 'dots':
          out.push('…'); break
        default:
          // Unknown command — render its arg as plain text
          if (arg) out.push(<span key={`${keyBase}-${ctr++}`}>{inner}</span>)
      }
      i = end
      continue
    }

    textBuf += ch
    i++
  }
  pushText()
  return out
}

// ─── block parser ───────────────────────────────────────────────────────────
// Splits body into structural blocks: sections, environments, paragraphs.

type Block =
  | { kind: 'section'; level: 1 | 2 | 3; text: string; number: string }
  | { kind: 'env'; env: Env }
  | { kind: 'paragraph'; text: string }
  | { kind: 'rule' }

function findMatchingEnv(src: string, start: number, name: string): number {
  // Escape regex specials in name — notably '*' for starred envs like equation*.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Tolerate optional whitespace between \begin / \end and the brace-wrapped name,
  // since LaTeX treats `\begin {tabular}` and `\begin{tabular}` identically.
  const re = new RegExp(`\\\\(begin|end)\\s*\\{${escaped}\\}`, 'g')
  re.lastIndex = start
  let depth = 0
  let m
  while ((m = re.exec(src)) !== null) {
    if (m[1] === 'begin') depth++
    else {
      if (depth === 0) return m.index
      depth--
    }
  }
  return -1
}

function parseBlocks(body: string): Block[] {
  const src = stripComments(body)
  const blocks: Block[] = []
  let i = 0
  let paragraphBuf = ''
  const flush = () => {
    const t = paragraphBuf.trim()
    if (t) blocks.push({ kind: 'paragraph', text: t })
    paragraphBuf = ''
  }

  // section counters
  let h1 = 0, h2 = 0, h3 = 0

  while (i < src.length) {
    // Paragraph break — two newlines
    const nlMatch = src.slice(i).match(/^\n\s*\n/)
    if (nlMatch) {
      flush()
      i += nlMatch[0].length
      continue
    }

    // \section / \subsection / \subsubsection
    const sec = src.slice(i).match(/^\\(section|subsection|subsubsection)\*?\s*\{/)
    if (sec) {
      flush()
      const cmd = sec[1]
      const { arg, end } = takeBraceArg(src, i + sec[0].length - 1)
      let num = ''
      if (cmd === 'section') { h1++; h2 = 0; h3 = 0; num = `${h1}` }
      else if (cmd === 'subsection') { h2++; h3 = 0; num = `${h1}.${h2}` }
      else { h3++; num = `${h1}.${h2}.${h3}` }
      blocks.push({ kind: 'section', level: cmd === 'section' ? 1 : cmd === 'subsection' ? 2 : 3, text: arg.trim(), number: num })
      i = end
      continue
    }

    // \begin{env}
    const envM = src.slice(i).match(/^\\begin\s*\{([a-zA-Z*]+)\}/)
    if (envM) {
      const name = envM[1]
      const afterBegin = i + envM[0].length
      const endIdx = findMatchingEnv(src, afterBegin, name)
      if (endIdx < 0) {
        // Runaway \begin with no matching \end — emit a single synthetic block
        // for everything up to end of source so the content still renders
        // instead of leaking as a wall of raw LaTeX.
        flush()
        blocks.push({ kind: 'env', env: { name, body: src.slice(afterBegin) } })
        i = src.length
        continue
      }
      flush()
      // Strip any [optional] and {required} args that follow \begin{env} on
      // the same line (e.g. \begin{tabular}{lrr}, \begin{figure}[h!],
      // \begin{minipage}[t]{0.5\textwidth}). We only consume args on the
      // same line so we don't accidentally swallow body content that happens
      // to start with '{'.
      let bodyStart = afterBegin
      while (bodyStart < endIdx) {
        let peek = bodyStart
        while (peek < endIdx && (src[peek] === ' ' || src[peek] === '\t')) peek++
        if (peek >= endIdx) break
        const ch = src[peek]
        if (ch !== '[' && ch !== '{') break
        const result = ch === '[' ? takeOptionalArg(src, peek) : takeBraceArg(src, peek)
        if (result.end <= peek) break
        bodyStart = result.end
      }
      const content = src.slice(bodyStart, endIdx)
      blocks.push({ kind: 'env', env: { name, body: content } })
      // findMatchingEnv tolerates whitespace in "\end  {name}", so walk past
      // the actual closing brace instead of assuming a fixed length.
      const closeBrace = src.indexOf('}', endIdx)
      i = closeBrace >= 0 ? closeBrace + 1 : endIdx + `\\end{${name}}`.length
      continue
    }

    // Horizontal rule via \hrulefill or \rule
    if (src.slice(i).match(/^\\(hrulefill|hline)\b/)) {
      flush()
      blocks.push({ kind: 'rule' })
      i += src.slice(i).match(/^\\[a-zA-Z]+/)![0].length
      continue
    }

    paragraphBuf += src[i]
    i++
  }
  flush()
  return blocks
}

// ─── environment renderers ──────────────────────────────────────────────────

// Render a container env's body recursively as blocks. Used by wrapper envs
// (center, flushleft, quote, theorem, …) so a nested \begin{tabular} or
// \begin{equation} renders properly instead of leaking as raw LaTeX through
// parseInline.
function renderContainerBody(
  body: string,
  refs: Refs,
  figNum: { n: number },
  key: string,
  paragraphClass: string,
): ReactNode[] {
  const inner = parseBlocks(body)
  return inner.map((b, idx) => {
    if (b.kind === 'env') return renderEnv(b.env, refs, figNum, `${key}-x${idx}`)
    if (b.kind === 'rule') return <hr key={`${key}-x${idx}`} className="my-3 border-forest/15" />
    if (b.kind === 'section') {
      return (
        <h4 key={`${key}-x${idx}`} className="font-[family-name:var(--font-body)] text-forest text-[1.05em] font-medium mt-4 mb-2">
          {b.text}
        </h4>
      )
    }
    return (
      <p key={`${key}-x${idx}`} className={paragraphClass}>
        {parseInline(b.text, refs, `${key}-xp${idx}`)}
      </p>
    )
  })
}

function renderEnv(env: Env, refs: Refs, figNum: { n: number }, key: string): ReactNode {
  const n = env.name
  // Strip trailing '*' for env-type matching (equation*, figure*, align*, …).
  // The starred form is still observable via n.endsWith('*') — we use that
  // below to hide equation labels for starred math envs.
  const base = n.replace(/\*$/, '')
  if (base === 'abstract') {
    return (
      <div key={key} className="my-8 mx-auto max-w-[560px] text-[0.96em]">
        <div className="text-center smcp text-forest/55 text-[0.78em] mb-3">Abstract</div>
        <div className="text-forest/80 leading-[1.75] text-justify">
          {parseInline(env.body.trim(), refs, `${key}-abs`)}
        </div>
        <div className="flex justify-center mt-4">
          <svg width="56" height="6" viewBox="0 0 56 6" fill="none">
            <path d="M0 3 Q 14 -1, 28 3 T 56 3" stroke="#8B6E4E" strokeWidth="0.8" opacity="0.5" />
          </svg>
        </div>
      </div>
    )
  }
  if (base === 'equation' || base === 'displaymath' || base === 'align' || base === 'gather' || base === 'multline') {
    const labelMatch = env.body.match(/\\label\{([^}]+)\}/)
    const cleaned = env.body.replace(/\\label\{[^}]+\}/g, '').trim()
    const isAlign = base === 'align'
    const expr = isAlign ? `\\begin{aligned}${cleaned}\\end{aligned}` : cleaned
    return (
      <div key={key} className="my-6 flex items-center justify-between gap-6 px-2">
        <div className="flex-1 text-center">{renderMath(expr, true, `${key}-eqnbody`)}</div>
        {!n.endsWith('*') && labelMatch && (
          <div className="font-[family-name:var(--font-mono)] text-[11px] text-forest/40 shrink-0">({labelMatch[1].replace(/^eq:/, '')})</div>
        )}
      </div>
    )
  }
  if (base === 'itemize' || base === 'enumerate') {
    const items = env.body.split(/\\item\b/).slice(1).map(s => s.trim())
    const Tag = base === 'itemize' ? 'ul' : 'ol'
    return (
      <Tag key={key} className={`my-4 pl-6 ${base === 'itemize' ? 'list-none' : 'list-decimal'} text-forest/85 leading-[1.75]`}>
        {items.map((it, idx) => (
          <li key={idx} className={`mb-1.5 relative ${base === 'itemize' ? 'before:content-[\'\'] before:absolute before:-left-4 before:top-[0.7em] before:w-1.5 before:h-1.5 before:bg-sage/60 before:rotate-45' : ''}`}>
            {parseInline(it, refs, `${key}-it${idx}`)}
          </li>
        ))}
      </Tag>
    )
  }
  if (base === 'figure') {
    figNum.n++
    const captionMatch = env.body.match(/\\caption\{([\s\S]*?)\}(?=\s*(\\label|\\end|$))/)
    const graphicsMatch = env.body.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/)
    return (
      <figure key={key} className="my-8 mx-auto max-w-[540px]">
        <div className="relative border border-forest/15 aspect-[4/2.6] bg-cream flex items-center justify-center overflow-hidden squircle-sm">
          {/* stylised figure placeholder */}
          <svg width="100%" height="100%" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid meet" fill="none">
            <defs>
              <pattern id={`hatch-${key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#8B6E4E" strokeWidth="0.5" opacity="0.18" />
              </pattern>
            </defs>
            <rect width="400" height="260" fill={`url(#hatch-${key})`} />
            <g opacity="0.55" stroke="#1a2f26" strokeWidth="1.2" fill="none">
              <path d="M 40 200 C 80 160, 120 80, 180 100 S 260 180, 320 60" />
              <circle cx="180" cy="100" r="3" fill="#8B4513" />
              <circle cx="260" cy="180" r="3" fill="#8B4513" />
              <circle cx="320" cy="60" r="3" fill="#8B4513" />
            </g>
            <text x="20" y="240" fontFamily="JetBrains Mono" fontSize="9" fill="#1a2f26" opacity="0.4">{graphicsMatch?.[1] ?? 'figure'}</text>
            <text x="20" y="30" fontFamily="JetBrains Mono" fontSize="9" fill="#1a2f26" opacity="0.4">[illustration]</text>
          </svg>
        </div>
        <figcaption className="mt-3 text-[0.88em] text-forest/65 leading-snug text-center">
          <span className="smcp text-[0.82em] text-sienna mr-2">Figure {figNum.n}.</span>
          {captionMatch ? parseInline(captionMatch[1].trim(), refs, `${key}-cap`) : null}
        </figcaption>
      </figure>
    )
  }
  if (base === 'quote' || base === 'quotation') {
    return (
      <blockquote key={key} className="my-5 pl-6 border-l-2 border-sage/40 text-forest/75 font-[family-name:var(--font-body)] leading-[1.7]">
        {renderContainerBody(env.body, refs, figNum, key, 'leading-[1.7] my-2')}
      </blockquote>
    )
  }
  if (base === 'center' || base === 'flushleft' || base === 'flushright') {
    const align = base === 'flushleft' ? 'text-left' : base === 'flushright' ? 'text-right' : 'text-center'
    return (
      <div key={key} className={`my-5 ${align} text-forest/85 leading-[1.75]`}>
        {renderContainerBody(env.body, refs, figNum, key, 'leading-[1.75] my-2')}
      </div>
    )
  }
  if (base === 'verbatim' || base === 'lstlisting' || base === 'minted') {
    return (
      <pre key={key} className="my-5 p-4 rounded-md bg-forest-deep/95 text-parchment font-[family-name:var(--font-mono)] text-[0.82em] leading-[1.6] overflow-x-auto border border-forest/20">
        {env.body.replace(/^\n/, '').replace(/\n$/, '')}
      </pre>
    )
  }
  if (base === 'theorem' || base === 'lemma' || base === 'proposition' || base === 'corollary' || base === 'definition' || base === 'proof' || base === 'remark' || base === 'example') {
    const label = base.charAt(0).toUpperCase() + base.slice(1)
    // The most common shape — a single paragraph of italic prose — keeps the
    // label inline with the text. Anything richer (multiple paragraphs, a
    // nested equation/tabular) falls back to recursive block rendering so
    // the nested env actually renders.
    const inner = parseBlocks(env.body)
    if (inner.length <= 1 && (inner.length === 0 || inner[0].kind === 'paragraph')) {
      return (
        <div key={key} className="my-5 pl-4 border-l-2 border-amber/50">
          <span className="smcp text-sienna text-[0.82em] mr-2">{label}.</span>
          <span className="text-forest/85 leading-[1.75] italic">
            {parseInline(inner[0]?.kind === 'paragraph' ? inner[0].text : env.body.trim(), refs, `${key}-thm`)}
          </span>
        </div>
      )
    }
    return (
      <div key={key} className="my-5 pl-4 border-l-2 border-amber/50 text-forest/85">
        <div className="mb-1"><span className="smcp text-sienna text-[0.82em]">{label}.</span></div>
        {renderContainerBody(env.body, refs, figNum, key, 'leading-[1.75] my-2 italic')}
      </div>
    )
  }
  // \begin{table}[h] is a float wrapper — its body is typically another
  // environment (tabular / tabularx / longtable) plus \caption and \label.
  // Render the children by re-running the block parser on the body so the
  // inner tabular gets its proper table rendering instead of paragraph text.
  if (base === 'table' || base === 'table*') {
    const captionMatch = env.body.match(/\\caption\{([\s\S]*?)\}(?=\s*(?:\\label|\\end|$))/)
    const innerSource = env.body
      .replace(/\\caption\{[\s\S]*?\}/g, '')
      .replace(/\\label\{[^}]+\}/g, '')
      .replace(/\\centering\b/g, '')
    const innerBlocks = parseBlocks(innerSource)
    const inner: ReactNode[] = innerBlocks.map((b, idx) => {
      if (b.kind === 'env') return renderEnv(b.env, refs, figNum, `${key}-t${idx}`)
      if (b.kind === 'paragraph') return <p key={`${key}-t${idx}`} className="text-forest/80 leading-[1.7] my-2">{parseInline(b.text, refs, `${key}-tp${idx}`)}</p>
      if (b.kind === 'rule') return <hr key={`${key}-t${idx}`} className="my-3 border-forest/15" />
      return null
    })
    return (
      <figure key={key} className="my-8">
        {inner}
        {captionMatch && (
          <figcaption className="mt-2 text-[0.88em] text-forest/65 text-center">
            <span className="smcp text-[0.82em] text-sienna mr-2">Table.</span>
            {parseInline(captionMatch[1].trim(), refs, `${key}-tcap`)}
          </figcaption>
        )}
      </figure>
    )
  }
  if (base === 'tabular' || base === 'array') {
    const lines = env.body.trim().split(/\\\\\s*/).filter(Boolean)
    const rows = lines.map(l => l.split(/(?<!\\)&/).map(c => c.trim()))
    return (
      <div key={key} className="my-6 mx-auto max-w-full overflow-x-auto">
        <table className="mx-auto border-collapse font-[family-name:var(--font-body)] text-[0.95em]">
          <thead>
            <tr className="border-t-2 border-b border-forest/70">
              {rows[0]?.map((c, j) => (
                <th key={j} className="px-4 py-2 text-left text-forest font-medium smcp text-[0.85em]">
                  {parseInline(c, refs, `${key}-h${j}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, ri) => (
              <tr key={ri} className={ri === rows.length - 2 ? 'border-b-2 border-forest/70' : 'border-b border-forest/10'}>
                {row.map((c, j) => (
                  <td key={j} className="px-4 py-1.5 text-forest/80">
                    {parseInline(c, refs, `${key}-c${ri}-${j}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (base === 'thebibliography') {
    // very light-weight — each \bibitem is a reference
    const items = env.body.split(/\\bibitem/).slice(1).map(s => s.trim())
    return (
      <div key={key} className="mt-12 pt-6 border-t border-forest/15">
        <h3 className="smcp text-sienna text-[0.85em] mb-4">References</h3>
        <ol className="text-[0.9em] text-forest/75 space-y-2 font-[family-name:var(--font-body)]">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="text-forest/40 shrink-0 w-5 text-right">{idx + 1}.</span>
              <span className="leading-snug">{parseInline(it.replace(/^\{[^}]*\}/, '').trim(), refs, `${key}-b${idx}`)}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  // Fallback: recursively parse the inner body as blocks so unknown wrappers
  // (\begin{document}, custom float envs, …) still render their contents
  // instead of dumping raw LaTeX or a dim `[env-name]` tag into the page.
  const innerBlocks = parseBlocks(env.body)
  const innerNodes: ReactNode[] = innerBlocks.map((b, idx) => {
    if (b.kind === 'env') return renderEnv(b.env, refs, figNum, `${key}-f${idx}`)
    if (b.kind === 'section') {
      const common = 'font-[family-name:var(--font-body)] text-forest tracking-tight mt-6 mb-3'
      return <h3 key={`${key}-f${idx}`} className={`${common} text-[1.2em] font-medium`}>{b.text}</h3>
    }
    if (b.kind === 'rule') return <hr key={`${key}-f${idx}`} className="my-3 border-forest/15" />
    return <p key={`${key}-f${idx}`} className="text-forest/80 leading-[1.75] my-3 font-[family-name:var(--font-body)]">{parseInline(b.text, refs, `${key}-fp${idx}`)}</p>
  })
  // If the recursion produced nothing (empty body), show a quiet placeholder.
  if (innerNodes.length === 0) {
    return (
      <div key={key} className="my-3 text-forest/60 leading-[1.75] text-[0.9em]">
        {parseInline(env.body.trim(), refs, `${key}-def`)}
      </div>
    )
  }
  return <div key={key} className="my-2">{innerNodes}</div>
}

// ─── top-level renderer ─────────────────────────────────────────────────────

export function RenderPaper({ source, showLineNumbers = false }: { source: string; showLineNumbers?: boolean }) {
  void showLineNumbers
  const { meta, body } = extractMeta(source)
  const blocks = parseBlocks(body)
  const refs: Refs = { citations: new Map(), figures: new Map(), sections: new Map(), citationList: [] }
  const figNum = { n: 0 }

  const elements: ReactNode[] = []
  blocks.forEach((b, idx) => {
    if (b.kind === 'section') {
      const common = 'font-[family-name:var(--font-body)] text-forest tracking-tight mt-10 mb-4'
      if (b.level === 1) {
        elements.push(
          <h2 key={`b${idx}`} className={`${common} text-[1.6em] font-semibold flex items-baseline gap-3 ink-bloom`}>
            <span className="smcp text-sienna text-[0.58em] tabular-nums tracking-[0.2em]">{b.number}</span>
            <span>{b.text}</span>
          </h2>
        )
      } else if (b.level === 2) {
        elements.push(
          <h3 key={`b${idx}`} className={`${common} text-[1.25em] font-medium flex items-baseline gap-3`}>
            <span className="smcp text-sienna/80 text-[0.62em] tabular-nums">{b.number}</span>
            <span>{b.text}</span>
          </h3>
        )
      } else {
        elements.push(
          <h4 key={`b${idx}`} className={`${common} text-[1.05em] font-medium flex items-baseline gap-3`}>
            <span className="smcp text-sienna/70 text-[0.65em] tabular-nums">{b.number}</span>
            <span>{b.text}</span>
          </h4>
        )
      }
    } else if (b.kind === 'env') {
      elements.push(renderEnv(b.env, refs, figNum, `b${idx}`))
    } else if (b.kind === 'rule') {
      elements.push(<hr key={`b${idx}`} className="my-6 border-forest/15" />)
    } else {
      const isFirstAfterSection = idx > 0 && blocks[idx - 1]?.kind === 'section'
      elements.push(
        <p
          key={`b${idx}`}
          className={`text-forest/88 leading-[1.8] text-justify hyphens-auto mb-3 font-[family-name:var(--font-body)] text-[1.02em] ${isFirstAfterSection ? 'drop-cap' : ''}`}
        >
          {parseInline(b.text, refs, `b${idx}`)}
        </p>
      )
    }
  })

  return (
    <article className="paper-body">
      {/* Title block */}
      {meta.title && (
        <header className="text-center mb-10 pb-8 border-b border-forest/15">
          <h1 className="font-[family-name:var(--font-display)] text-[2.4em] leading-[1.1] text-forest font-semibold tracking-tight">
            {parseInline(meta.title, refs, 'title')}
          </h1>
          {meta.authors && meta.authors.length > 0 && (
            <div className="mt-5 smcp text-forest/70 text-[0.92em] tracking-[0.14em]">
              {meta.authors.join(' · ')}
            </div>
          )}
          {meta.affiliations && meta.affiliations.length > 0 && (
            <div className="mt-2 text-forest/55 text-[0.85em] font-[family-name:var(--font-body)]">
              {meta.affiliations.join(' ; ')}
            </div>
          )}
          {meta.date && (
            <div className="mt-3 font-[family-name:var(--font-mono)] text-[10px] text-forest/40 tracking-[0.3em] uppercase">
              {meta.date}
            </div>
          )}
          <div className="flex justify-center mt-6">
            <svg width="96" height="8" viewBox="0 0 96 8" fill="none">
              <path d="M0 4 Q 24 -2, 48 4 T 96 4" stroke="#8B6E4E" strokeWidth="0.9" opacity="0.55" />
            </svg>
          </div>
        </header>
      )}

      {/* Abstract — always drawn from meta; extractMeta strips the env from body. */}
      {meta.abstract && (
        <div className="mt-8 mx-auto max-w-[560px] text-[0.96em]">
          <div className="text-center smcp text-forest/55 text-[0.78em] mb-3">Abstract</div>
          <div className="text-forest/80 leading-[1.75] text-justify font-[family-name:var(--font-body)]">
            {parseInline(meta.abstract, refs, 'abs')}
          </div>
          <div className="flex justify-center mt-4">
            <svg width="56" height="6" viewBox="0 0 56 6" fill="none">
              <path d="M0 3 Q 14 -1, 28 3 T 56 3" stroke="#8B6E4E" strokeWidth="0.8" opacity="0.5" />
            </svg>
          </div>
        </div>
      )}

      {/* Keywords — sit immediately below the abstract, academic-paper style. */}
      {meta.keywords && meta.keywords.length > 0 && (
        <div className="mt-5 mb-10 mx-auto max-w-[560px] flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 font-[family-name:var(--font-body)] text-[0.9em]">
          <span className="smcp text-forest/55 text-[0.78em] tracking-[0.14em] mr-1">Keywords</span>
          {meta.keywords.map((k, idx) => (
            <span key={k} className="text-forest/80 italic">
              {k}
              {idx < meta.keywords!.length - 1 && <span className="not-italic text-forest/40 ml-1.5">·</span>}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="paper-columns">{elements}</div>

      {/* Auto-generated references if \cite used but no \begin{thebibliography} */}
      {refs.citationList.length > 0 && !blocks.some(b => b.kind === 'env' && b.env.name === 'thebibliography') && (
        <div className="mt-12 pt-6 border-t border-forest/15">
          <h3 className="smcp text-sienna text-[0.85em] mb-4">References</h3>
          <ol className="text-[0.9em] text-forest/75 space-y-2 font-[family-name:var(--font-body)]">
            {refs.citationList.map((k, idx) => (
              <li key={k} className="flex gap-3">
                <span className="text-forest/40 shrink-0 w-5 text-right">{idx + 1}.</span>
                <span className="leading-snug">{k} <span className="text-forest/40">— reference pending</span></span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  )
}

// ─── syntax highlighting for the source textarea overlay ────────────────────

export function highlightTeX(src: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Tokenize
  const parts: string[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    const cm = rest.match(/^%[^\n]*/)
    if (cm) { parts.push(`<span class="tex-comment">${escape(cm[0])}</span>`); i += cm[0].length; continue }
    const envStart = rest.match(/^\\(begin|end)\{([^}]+)\}/)
    if (envStart) {
      parts.push(`<span class="tex-cmd">\\${envStart[1]}</span><span class="tex-brace">{</span><span class="tex-env">${escape(envStart[2])}</span><span class="tex-brace">}</span>`)
      i += envStart[0].length; continue
    }
    const cmd = rest.match(/^\\[a-zA-Z@]+\*?/)
    if (cmd) { parts.push(`<span class="tex-cmd">${escape(cmd[0])}</span>`); i += cmd[0].length; continue }
    const math = rest.match(/^\$\$[\s\S]*?\$\$/) || rest.match(/^\$[^\n$]*\$/)
    if (math) { parts.push(`<span class="tex-math">${escape(math[0])}</span>`); i += math[0].length; continue }
    const brace = rest.match(/^[{}]/)
    if (brace) { parts.push(`<span class="tex-brace">${brace[0]}</span>`); i++; continue }
    const text = rest.match(/^[^\\${}%]+/)
    if (text) { parts.push(escape(text[0])); i += text[0].length; continue }
    parts.push(escape(src[i])); i++
  }
  return parts.join('')
}

export const DEFAULT_LATEX = `\\documentclass[11pt]{article}

\\title{Efficient Attention Mechanisms\\\\ for Long-Context Transformers}
\\author{Ada Kovalenko \\and Mirra Chen \\and R.~Okonkwo}
\\affiliation{Department of Computer Science, Example University}
\\date{\\today}
\\keywords{attention mechanisms, transformers, long-context modeling, sparse attention, linear attention, efficient deep learning}

\\begin{document}
\\maketitle

\\begin{abstract}
Transformer models have revolutionised natural language processing, yet their
quadratic attention complexity remains a bottleneck for long-context
applications. We survey recent proposals---sparse, linear, and recurrent
attention variants---and benchmark their trade-offs on retrieval-heavy tasks.
Our experiments suggest that hybrid schemes combining local windowing with
low-rank global tokens \\cite{child2019sparse} offer the best quality-latency
frontier for sequences beyond 32k tokens.
\\end{abstract}

\\section{Introduction}
The self-attention mechanism \\cite{vaswani2017attention} computes, for each
query $q_i$, a weighted sum over all keys:
\\begin{equation}
\\mathrm{Attn}(Q, K, V) = \\mathrm{softmax}\\!\\left(\\frac{QK^{\\top}}{\\sqrt{d_k}}\\right) V.
\\label{eq:attention}
\\end{equation}
While expressive, equation~\\ref{eq:attention} scales as $\\mathcal{O}(n^2)$ in
sequence length $n$, which prohibits direct application to book-length
documents. Recent work proposes several remedies, summarised in
figure~\\ref{fig:taxonomy}.

\\begin{figure}[h]
\\includegraphics[width=0.8\\textwidth]{taxonomy.pdf}
\\caption{A taxonomy of efficient attention methods, organised along the axes of
\\textit{sparsity pattern} and \\textit{approximation type}.}
\\label{fig:taxonomy}
\\end{figure}

\\section{Methods}

\\subsection{Sparse attention}
Sparse methods restrict each query to attend to a learned or fixed subset of
keys. Representative schemes include \\textbf{block-sparse} patterns
\\cite{child2019sparse} and \\textbf{strided} windows.

\\subsection{Linear attention}
Linearised variants rewrite the softmax using kernel feature maps $\\phi(\\cdot)$:
\\[
\\mathrm{Attn}(Q,K,V) \\approx \\phi(Q)\\,\\bigl(\\phi(K)^{\\top} V\\bigr),
\\]
reducing cost to $\\mathcal{O}(n d^2)$.

\\section{Results}
We evaluate on three long-document benchmarks. Our findings are summarised in
the table below.

\\begin{tabular}{lrr}
Method & Throughput & Recall@5 \\\\
Dense baseline & 1.00$\\times$ & 0.62 \\\\
Block-sparse & 2.4$\\times$ & 0.61 \\\\
Linear attention & 3.8$\\times$ & 0.54 \\\\
Hybrid (ours) & 2.9$\\times$ & 0.66
\\end{tabular}

\\section{Conclusion}
We showed that carefully combining local and global attention yields robust
long-context recall at a fraction of the dense cost. Future work should
integrate retrieval directly into the attention pathway.

\\end{document}
`
