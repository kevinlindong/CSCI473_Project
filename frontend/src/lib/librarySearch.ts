export interface SearchableDraft {
  id: string
  title: string
  body?: string
}

export interface ScoredDraft {
  draft: SearchableDraft
  score: number
  reasons: string[]
}

const STOP_WORDS = new Set<string>([
  'a', 'an', 'the', 'of', 'on', 'in', 'for', 'to', 'and', 'or', 'with',
  'my', 'our', 'your', 'their', 'his', 'her', 'its',
  'paper', 'papers', 'draft', 'drafts', 'document', 'documents', 'file',
  'files', 'article', 'articles', 'manuscript', 'manuscripts', 'thesis',
  'pdf', 'one', 'ones', 'work', 'study', 'project',
  'about', 'regarding', 'related', 'concerning', 'around',
  'open', 'find', 'show', 'load', 'pull', 'bring', 'locate', 'where',
  'is', 'was', 'are', 'were', 'i', 'we', 'me', 'us',
  'that', 'this', 'these', 'those', 'it',
])

const SYNONYM_GROUPS: string[][] = [
  ['cnn', 'convnet', 'convolutional', 'resnet', 'residual'],
  ['rnn', 'recurrent', 'lstm', 'gru', 'gated', 'sequence', 'sequential'],
  ['gan', 'generative', 'adversarial', 'synthesis', 'synthesise', 'synthesize'],
  ['gnn', 'graph'],
  ['ssl', 'selfsupervised', 'self-supervised', 'unsupervised', 'contrastive', 'siamese', 'pretraining', 'pretrain'],
  ['molecule', 'molecular', 'chemistry', 'chemical', 'compound', 'qm9'],

  // Time-series / forecasting domain.
  ['timeseries', 'time-series', 'temporal', 'forecast', 'forecasting', 'prediction', 'horizon'],

  ['transformer', 'attention', 'bert', 'gpt', 'llm', 'language'],
  ['classification', 'classify', 'classifier', 'recognition', 'recognise', 'recognize'],
  ['vision', 'visual', 'image', 'imaging', 'picture'],
  ['rl', 'reinforcement', 'policy', 'reward', 'agent'],
  ['ml', 'machine'],
  ['ai', 'artificial', 'intelligence'],
  ['nn', 'neural', 'network', 'networks'],
  ['nlp', 'linguistic', 'text'],
  ['cv', 'computer-vision'],
  ['vae', 'variational', 'autoencoder'],
]

// Index both raw and stemmed forms — the query is stemmed before lookup.
const SYNONYM_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>()
  for (const group of SYNONYM_GROUPS) {
    const variants = new Set<string>()
    for (const term of group) {
      variants.add(term)
      variants.add(stem(term))
    }
    for (const key of variants) {
      const existing = index.get(key)
      if (existing) {
        for (const v of variants) existing.add(v)
      } else {
        index.set(key, new Set(variants))
      }
    }
  }
  return index
})()

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenise(text: string): string[] {
  const lower = normalise(text)
  const out: string[] = []
  for (const piece of lower.split(/[^a-z0-9-]+/).filter(Boolean)) {
    if (piece.includes('-')) {
      out.push(piece.replace(/-/g, ''))
      for (const part of piece.split('-').filter(Boolean)) out.push(part)
    } else {
      out.push(piece)
    }
  }
  return out
}

export function stem(token: string): string {
  if (token.length <= 4) return token
  // Longer suffixes must be tried first.
  const suffixes = ['ization', 'isation', 'ational', 'tional', 'ements',
                    'ments', 'ation', 'ition', 'ising', 'izing',
                    'ment', 'ness', 'tion', 'sion', 'ies', 'ing',
                    'ers', 'ed', 'es', 'ly', 's']
  for (const suffix of suffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      let stripped = token.slice(0, -suffix.length)
      // Restore "ies" → "y" (e.g. "memories" → "memori" → "memory").
      if (suffix === 'ies') stripped += 'y'
      return stripped
    }
  }
  return token
}

/** Filter out stop words and stem each remaining token. */
function prepareQueryTokens(text: string): string[] {
  return tokenise(text)
    .filter(t => !STOP_WORDS.has(t))
    .map(stem)
    .filter(Boolean)
}

function prepareCorpusTokens(text: string): string[] {
  return tokenise(text).map(stem)
}

function tokenMatches(q: string, corpus: Set<string>): boolean {
  if (corpus.has(q)) return true

  if (q.length >= 4) {
    for (const c of corpus) {
      if (c.length >= 4 && (c.startsWith(q) || q.startsWith(c))) {
        const overlap = Math.min(q.length, c.length)
        if (overlap >= 4) return true
      }
    }
  }

  const synSet = SYNONYM_INDEX.get(q)
  if (synSet) {
    for (const raw of synSet) {
      const s = stem(raw)
      if (corpus.has(s)) return true
      if (s.length >= 4) {
        for (const c of corpus) {
          if (c.length >= 4 && (c.startsWith(s) || s.startsWith(c))) {
            const overlap = Math.min(s.length, c.length)
            if (overlap >= 4) return true
          }
        }
      }
    }
  }

  return false
}

function orderScore(qTokens: string[], titleTokens: string[]): number {
  if (qTokens.length === 0) return 0
  let lastIdx = -1
  let preserved = 0
  let total = 0
  for (const q of qTokens) {
    const idx = titleTokens.findIndex((t, i) =>
      i > lastIdx && tokenMatches(q, new Set([t])),
    )
    if (idx !== -1) {
      preserved++
      lastIdx = idx
    }
    total++
  }
  return total === 0 ? 0 : preserved / total
}

export function extractBodyText(latex: string, maxChars = 4000): string {
  let body = latex
  const begin = body.search(/\\begin\{document\}/)
  if (begin !== -1) body = body.slice(begin + '\\begin{document}'.length)
  const end = body.search(/\\end\{document\}/)
  if (end !== -1) body = body.slice(0, end)

  body = body
    .replace(/(^|[^\\])%[^\n]*/g, '$1')
    .replace(/\\begin\{(equation|align|gather|multline|displaymath|eqnarray|verbatim|lstlisting|tabular|array)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\(cite|citep|citet|ref|eqref|label|includegraphics|input|include|usepackage|documentclass|maketitle|today|tableofcontents|bibliography|bibliographystyle)\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/\\(begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return body.length > maxChars ? body.slice(0, maxChars) : body
}

interface ScoreOpts {
  weightTitle?: number
  weightBody?: number
  weightOrder?: number
  weightSubstring?: number
}

const DEFAULT_WEIGHTS: Required<ScoreOpts> = {
  weightTitle:     0.55,
  weightBody:      0.20,
  weightOrder:     0.10,
  weightSubstring: 0.30,
}

export function scoreDraft(
  query: string,
  draft: SearchableDraft,
  opts: ScoreOpts = {},
): ScoredDraft {
  const weights = { ...DEFAULT_WEIGHTS, ...opts }
  const reasons: string[] = []

  const qNorm = normalise(query)
  const titleNorm = normalise(draft.title)
  if (!qNorm) return { draft, score: 0, reasons }

  let substring = 0
  if (titleNorm.includes(qNorm)) {
    substring = 1
    reasons.push(`title contains "${qNorm}"`)
  }

  const qTokens = prepareQueryTokens(qNorm)
  if (qTokens.length === 0) {
    return {
      draft,
      score: weights.weightSubstring * substring,
      reasons,
    }
  }

  const titleTokens = prepareCorpusTokens(titleNorm)
  const titleSet = new Set(titleTokens)
  let titleHits = 0
  const matchedQueryTokens: string[] = []
  for (const q of qTokens) {
    if (tokenMatches(q, titleSet)) {
      titleHits++
      matchedQueryTokens.push(q)
    }
  }
  const titleCoverage = titleHits / qTokens.length
  if (titleHits > 0) {
    reasons.push(`title matches ${titleHits}/${qTokens.length} term${titleHits === 1 ? '' : 's'} (${matchedQueryTokens.join(', ')})`)
  }

  let bodyCoverage = 0
  if (draft.body && draft.body.length > 0) {
    const bodyTokens = prepareCorpusTokens(draft.body)
    const bodySet = new Set(bodyTokens)
    let bodyHits = 0
    for (const q of qTokens) {
      if (tokenMatches(q, bodySet)) bodyHits++
    }
    bodyCoverage = bodyHits / qTokens.length
    if (bodyHits > 0 && bodyHits > titleHits) {
      reasons.push(`body matches ${bodyHits}/${qTokens.length} terms`)
    }
  }

  const order = titleCoverage >= 0.5 ? orderScore(qTokens, titleTokens) : 0

  const score =
    weights.weightTitle    * titleCoverage +
    weights.weightBody     * bodyCoverage +
    weights.weightOrder    * order +
    weights.weightSubstring * substring

  return { draft, score, reasons }
}

export interface SearchOptions {
  minScore?: number
  ambiguityWindow?: number
}

export interface SearchOutcome {
  status: 'opened' | 'ambiguous' | 'notfound'
  best?: ScoredDraft
  candidates: ScoredDraft[]
}

export function searchLibrary(
  query: string,
  drafts: SearchableDraft[],
  opts: SearchOptions = {},
): SearchOutcome {
  const minScore = opts.minScore ?? 0.30
  const ambiguityWindow = opts.ambiguityWindow ?? 0.12

  if (!query.trim() || drafts.length === 0) {
    return { status: 'notfound', candidates: [] }
  }

  const ranked = drafts
    .map(d => scoreDraft(query, d))
    .sort((a, b) => b.score - a.score)

  const top = ranked[0]
  if (!top || top.score < minScore) {
    return { status: 'notfound', candidates: ranked.slice(0, 5) }
  }

  const tied = ranked.filter(r => r.score >= top.score - ambiguityWindow && r.score >= minScore)
  if (tied.length === 1) {
    return { status: 'opened', best: top, candidates: ranked.slice(0, 5) }
  }
  return { status: 'ambiguous', candidates: tied.slice(0, 5) }
}
