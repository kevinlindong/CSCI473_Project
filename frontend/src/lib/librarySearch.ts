/*
 * librarySearch — fuzzy lookup for drafts in the user's local library.
 *
 * The scoot agent emits queries like "CNN paper" or "the molecule one" or
 * "my self supervised draft". We score every draft against the query and
 * return a ranked list, so the chat can pick the best match (or surface a
 * shortlist when several drafts tie).
 *
 * Scoring inputs:
 *   - title          → strongest signal
 *   - body excerpt   → catches papers whose topic sits in the abstract or
 *                      introduction but not the title (e.g. ResNet's title
 *                      doesn't say "CNN", but the intro does).
 *
 * Scoring features (each 0..1, mixed via fixed weights):
 *   1. Exact substring  — full normalised query appears in the title.
 *   2. Token coverage   — fraction of query tokens that match a title token,
 *                          honouring synonyms and a soft prefix match.
 *   3. Order bonus      — query tokens appear in the title in the same order.
 *   4. Body coverage    — fraction of query tokens found in the body excerpt.
 *
 * Synonym expansion handles the cases the old fuzzy matcher missed:
 *   "CNN paper"          → ResNet  (cnn ↔ convolutional, residual)
 *   "LSTM paper"         → LSTM    (lstm ↔ recurrent, gated)
 *   "GNN paper"          → GNN     (gnn ↔ graph + neural network)
 *   "generative model"   → GAN     (generative ↔ gan, adversarial)
 *   "chemistry paper"    → GNN     (chemistry ↔ molecular)
 *   "self supervised"    → SSL     (ssl ↔ self-supervised)
 */

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

// ── Stop words ────────────────────────────────────────────────────────────
// Standard English stop words plus filler words that often surround a query
// inside scoot's [OPEN_DRAFT] tag ("my paper about X", "the one on Y").
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

// ── Synonym groups ────────────────────────────────────────────────────────
// Each group is a set of mutually-equivalent terms. Two tokens "match" if
// they share a group. Groups err on the side of capturing the topic family
// (CNN/ResNet/convolutional all describe the same paper in this corpus)
// rather than strict semantic equivalence.
const SYNONYM_GROUPS: string[][] = [
  // Convolutional models / image classification.
  ['cnn', 'convnet', 'convolutional', 'resnet', 'residual'],

  // Recurrent / sequence models.
  ['rnn', 'recurrent', 'lstm', 'gru', 'gated', 'sequence', 'sequential'],

  // Generative adversarial models.
  ['gan', 'generative', 'adversarial', 'synthesis', 'synthesise', 'synthesize'],

  // Graph neural networks.
  ['gnn', 'graph'],

  // Self-supervised / contrastive learning.
  ['ssl', 'selfsupervised', 'self-supervised', 'unsupervised', 'contrastive', 'siamese', 'pretraining', 'pretrain'],

  // Molecules / chemistry domain.
  ['molecule', 'molecular', 'chemistry', 'chemical', 'compound', 'qm9'],

  // Time-series / forecasting domain.
  ['timeseries', 'time-series', 'temporal', 'forecast', 'forecasting', 'prediction', 'horizon'],

  // Transformers / attention.
  ['transformer', 'attention', 'bert', 'gpt', 'llm', 'language'],

  // Classification synonyms.
  ['classification', 'classify', 'classifier', 'recognition', 'recognise', 'recognize'],

  // Vision / image synonyms.
  ['vision', 'visual', 'image', 'imaging', 'picture'],

  // Reinforcement learning.
  ['rl', 'reinforcement', 'policy', 'reward', 'agent'],

  // General ML/AI shorthand.
  ['ml', 'machine'],
  ['ai', 'artificial', 'intelligence'],
  ['nn', 'neural', 'network', 'networks'],
  ['nlp', 'linguistic', 'text'],
  ['cv', 'computer-vision'],
  ['vae', 'variational', 'autoencoder'],
]

// Build a lookup: term → set of terms in its group(s).
//
// We register both the raw form and the stemmed form of every term as a key,
// because the query side stems before lookup (so "convolutional" becomes
// "convolu" before it lands here, and the index has to know that key too).
// The stored set also includes both raw and stemmed forms so the value-side
// match against (stemmed) corpus tokens hits cleanly.
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
        // Merge groups when a term lives in more than one (e.g. "neural"
        // could plausibly belong to several families).
        for (const v of variants) existing.add(v)
      } else {
        index.set(key, new Set(variants))
      }
    }
  }
  return index
})()

// ── Helpers ───────────────────────────────────────────────────────────────

/** Lowercase + collapse whitespace + strip diacritics. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    // Strip combining diacritical marks (U+0300..U+036F).
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split into tokens. Hyphens are treated as both separators (so
 * "self-supervised" yields ["self", "supervised"]) and joiners (we also
 * keep the joined form "selfsupervised" as a token so it can match the
 * SSL synonym group).
 */
export function tokenise(text: string): string[] {
  const lower = normalise(text)
  const out: string[] = []
  for (const piece of lower.split(/[^a-z0-9-]+/).filter(Boolean)) {
    if (piece.includes('-')) {
      // Add the hyphen-joined form (e.g. "self-supervised") so it can match
      // the literal synonym entry, then add each side individually.
      out.push(piece.replace(/-/g, ''))
      for (const part of piece.split('-').filter(Boolean)) out.push(part)
    } else {
      out.push(piece)
    }
  }
  return out
}

/**
 * Lightweight English stemmer: strips the most common inflectional suffixes
 * so "networks", "network", "networking" all collapse to "network". Avoids
 * touching short tokens (which are usually acronyms) so we don't mangle
 * "gan" or "rnn".
 */
export function stem(token: string): string {
  if (token.length <= 4) return token
  // Order matters — try longer suffixes first.
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

/** Title-side tokens aren't filtered for stop words — we want every word. */
function prepareCorpusTokens(text: string): string[] {
  return tokenise(text).map(stem)
}

/**
 * Does query token `q` match any token in `corpus`?
 *   - exact (post-stem) match
 *   - one is a prefix of the other for tokens long enough to be meaningful
 *     (≥4 chars) — handles morphology the stemmer misses.
 *   - synonym-group match — covers acronym ↔ phrase pairs.
 */
function tokenMatches(q: string, corpus: Set<string>): boolean {
  if (corpus.has(q)) return true

  // Soft prefix match for tokens long enough to discriminate.
  if (q.length >= 4) {
    for (const c of corpus) {
      if (c.length >= 4 && (c.startsWith(q) || q.startsWith(c))) {
        // Require a 4-char overlap so "cat" doesn't match "category".
        const overlap = Math.min(q.length, c.length)
        if (overlap >= 4) return true
      }
    }
  }

  // Synonym expansion. Stem each synonym so it lines up with the
  // (also-stemmed) corpus tokens we're matching against.
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

/**
 * Order-preserving match score for a query against a title.
 * Returns 1.0 if all matched query tokens appear in the title in the same
 * order, falling toward 0 as the order diverges. This breaks ties between
 * "image classification" and "image synthesis" when the user said "image
 * classification" — the title with the same ordering wins.
 */
function orderScore(qTokens: string[], titleTokens: string[]): number {
  if (qTokens.length === 0) return 0
  let lastIdx = -1
  let preserved = 0
  let total = 0
  for (const q of qTokens) {
    // Find the first title position ≥ lastIdx where q matches.
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

/** Strip LaTeX commands and braces so the body is plain words for tokenising. */
export function extractBodyText(latex: string, maxChars = 4000): string {
  let body = latex
  // Restrict to between \begin{document} and \end{document} when present.
  const begin = body.search(/\\begin\{document\}/)
  if (begin !== -1) body = body.slice(begin + '\\begin{document}'.length)
  const end = body.search(/\\end\{document\}/)
  if (end !== -1) body = body.slice(0, end)

  body = body
    .replace(/(^|[^\\])%[^\n]*/g, '$1')                                      // line comments
    .replace(/\\begin\{(equation|align|gather|multline|displaymath|eqnarray|verbatim|lstlisting|tabular|array)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')                                        // display math
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')                                             // inline math
    .replace(/\\(cite|citep|citet|ref|eqref|label|includegraphics|input|include|usepackage|documentclass|maketitle|today|tableofcontents|bibliography|bibliographystyle)\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/\\(begin|end)\{[^}]*\}/g, ' ')                                  // env wrappers
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')                            // any remaining macro
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return body.length > maxChars ? body.slice(0, maxChars) : body
}

// ── Main scoring ──────────────────────────────────────────────────────────

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
  weightSubstring: 0.30, // additive — full-query substring is a strong signal
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

  // 1. Full-query substring in title — additive bonus, not a hard 1.0 ceiling
  //    so longer descriptive matches still rank above shorter ones.
  let substring = 0
  if (titleNorm.includes(qNorm)) {
    substring = 1
    reasons.push(`title contains "${qNorm}"`)
  }

  // 2. Title token coverage (with synonyms).
  const qTokens = prepareQueryTokens(qNorm)
  if (qTokens.length === 0) {
    // Query was all stop words — fall back to substring alone.
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

  // 3. Body coverage.
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

  // 4. Order bonus — only counted when title coverage is decent.
  const order = titleCoverage >= 0.5 ? orderScore(qTokens, titleTokens) : 0

  const score =
    weights.weightTitle    * titleCoverage +
    weights.weightBody     * bodyCoverage +
    weights.weightOrder    * order +
    weights.weightSubstring * substring

  return { draft, score, reasons }
}

// ── Search ─────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Minimum score for a result to be considered a match. */
  minScore?: number
  /** Score gap below #1 that still counts as a "tie" (ambiguous). */
  ambiguityWindow?: number
}

export interface SearchOutcome {
  status: 'opened' | 'ambiguous' | 'notfound'
  best?: ScoredDraft
  candidates: ScoredDraft[]
}

/**
 * Rank drafts against the query.
 *   - status="opened":     a single draft scored well above the rest.
 *   - status="ambiguous":  several drafts tied within ambiguityWindow.
 *   - status="notfound":   no draft cleared minScore.
 */
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

  // Find everyone within the ambiguity window of the leader.
  const tied = ranked.filter(r => r.score >= top.score - ambiguityWindow && r.score >= minScore)
  if (tied.length === 1) {
    return { status: 'opened', best: top, candidates: ranked.slice(0, 5) }
  }
  return { status: 'ambiguous', candidates: tied.slice(0, 5) }
}
