/*
 * librarySearch.test.ts — exercise the fuzzy lookup against a corpus that
 * mirrors the seeded sample papers in the user's library, plus a battery
 * of natural prompts that scoot is likely to forward as [OPEN_DRAFT] queries.
 *
 * Run with:  bun test frontend/src/lib/librarySearch.test.ts
 */

import { describe, expect, test } from 'bun:test'
import {
  searchLibrary,
  scoreDraft,
  tokenise,
  stem,
  extractBodyText,
  type SearchableDraft,
} from './librarySearch'

// ── Corpus mirrors frontend/src/sample-papers/index.ts ───────────────────
const drafts: SearchableDraft[] = [
  {
    id: 'cnn',
    title: 'Deep Residual Learning for Image Classification',
    body: `We revisit residual learning for large-scale image classification. Convolutional
    networks dominate visual recognition. Each residual block contains two convolutions
    with batch normalisation and a ReLU non-linearity. ResNet outperforms plain networks
    on ImageNet validation.`,
  },
  {
    id: 'lstm',
    title: 'Gated Recurrent Memory for Long-Horizon Time-Series Forecasting',
    body: `We study LSTM-based forecasters for hourly load and meteorological signals
    spanning multi-year horizons. A two-layer stacked LSTM with peephole connections
    reduces forecast MAPE on the seven-day horizon. Recurrent neural networks remain a
    strong baseline for sequential data.`,
  },
  {
    id: 'gnn',
    title: 'Message-Passing Graph Neural Networks for Molecular Property Prediction',
    body: `We benchmark message-passing graph neural networks against fingerprint and
    descriptor baselines for predicting eight quantum-chemical properties of small
    organic molecules. A GNN reaches chemical accuracy on six of the eight QM9
    targets. Atoms are nodes, bonds are edges.`,
  },
  {
    id: 'gan',
    title: 'Progressive Growing GANs for High-Fidelity Image Synthesis',
    body: `We describe a training procedure that grows generator and discriminator
    symmetrically. End-to-end GAN training at high resolution is unstable.
    Progressive growing yields the first generative model to produce uncurated
    megapixel face images.`,
  },
  {
    id: 'ssl',
    title: 'Contrastive Self-Supervised Pretraining without Negative Pairs',
    body: `Most contrastive frameworks for visual representation learning rely on a large
    pool of negative samples. We show that a stop-gradient asymmetric Siamese network,
    trained only on positive pairs, matches or exceeds the linear-probe accuracy of much
    larger contrastive baselines on ImageNet.`,
  },
]

// Scenarios: (query, expectedDraftId) — expectedDraftId === null means
// "should not confidently open any draft".
const SCENARIOS: Array<[string, string | null]> = [
  // ── Acronyms ────────────────────────────────────────────────────────────
  ['CNN',                                'cnn'],
  ['cnn paper',                          'cnn'],
  ['my CNN draft',                       'cnn'],
  ['LSTM',                               'lstm'],
  ['LSTM paper',                         'lstm'],
  ['my RNN paper',                       'lstm'],   // RNN family lives here
  ['GNN',                                'gnn'],
  ['GNN paper',                          'gnn'],
  ['GAN',                                'gan'],
  ['GAN paper',                          'gan'],
  ['SSL',                                'ssl'],
  ['SSL paper',                          'ssl'],

  // ── Topic descriptions ─────────────────────────────────────────────────
  ['residual learning',                  'cnn'],
  ['resnet',                             'cnn'],
  ['my image classification draft',      'cnn'],
  ['convolutional network paper',        'cnn'],
  ['convnet paper',                      'cnn'],
  ['recurrent paper',                    'lstm'],
  ['time series',                        'lstm'],
  ['time series forecasting',            'lstm'],
  ['my forecasting paper',               'lstm'],
  ['long horizon paper',                 'lstm'],
  ['graph neural network',               'gnn'],
  ['molecule paper',                     'gnn'],
  ['molecular paper',                    'gnn'],
  ['chemistry paper',                    'gnn'],
  ['my chemical property draft',         'gnn'],
  ['generative model paper',             'gan'],
  ['adversarial paper',                  'gan'],
  ['image synthesis',                    'gan'],
  ['high fidelity image generation',     'gan'],
  ['contrastive learning',               'ssl'],
  ['self supervised',                    'ssl'],
  ['self-supervised',                    'ssl'],
  ['siamese network paper',              'ssl'],
  ['pretraining paper',                  'ssl'],

  // ── Casual / awkward phrasing ──────────────────────────────────────────
  ['the one about molecules',            'gnn'],
  ['the GAN one',                        'gan'],
  ['my paper on residual networks',      'cnn'],

  // ── Negative cases ─────────────────────────────────────────────────────
  ['transformer paper',                  null],
  ['quantitative finance',               null],
]

describe('searchLibrary', () => {
  for (const [query, expected] of SCENARIOS) {
    const label = expected === null
      ? `"${query}" → should not confidently open`
      : `"${query}" → ${expected}`
    test(label, () => {
      const result = searchLibrary(query, drafts)
      if (expected === null) {
        // Either notfound, or — at worst — ambiguous (never a confident "opened").
        expect(result.status).not.toBe('opened')
      } else {
        if (result.status === 'opened') {
          expect(result.best?.draft.id).toBe(expected)
        } else if (result.status === 'ambiguous') {
          // Acceptable as long as the expected paper is ranked first or
          // tightly tied at the top.
          const top = result.candidates[0]
          expect(top?.draft.id).toBe(expected)
        } else {
          throw new Error(
            `expected ${expected} for "${query}", got notfound. ` +
            `top scores: ${result.candidates.slice(0, 3).map(c => `${c.draft.id}=${c.score.toFixed(2)}`).join(', ')}`,
          )
        }
      }
    })
  }
})

describe('helpers', () => {
  test('tokenise splits hyphens both ways', () => {
    const t = tokenise('Self-Supervised Learning')
    expect(t).toContain('self')
    expect(t).toContain('supervised')
    expect(t).toContain('selfsupervised')
  })

  test('stem leaves short tokens alone', () => {
    expect(stem('cnn')).toBe('cnn')
    expect(stem('gan')).toBe('gan')
    expect(stem('rnn')).toBe('rnn')
  })

  test('stem strips common suffixes', () => {
    expect(stem('networks')).toBe('network')
    expect(stem('learning')).toBe('learn')
    expect(stem('classification')).toBe('classific')
    expect(stem('memories')).toBe('memory')
  })

  test('extractBodyText drops LaTeX commands', () => {
    const input = `\\title{Foo}\n\\begin{document}\nHello \\textbf{world}, $x = 1$.\n\\end{document}`
    const text = extractBodyText(input)
    expect(text).toContain('Hello')
    expect(text).toContain('world')
    expect(text).not.toContain('\\textbf')
    expect(text).not.toContain('\\title')
    expect(text).not.toContain('$')
  })
})

describe('scoreDraft', () => {
  test('exact title substring beats partial token match', () => {
    const exact = scoreDraft('image classification', drafts[0])
    const partial = scoreDraft('image classification', drafts[3]) // GAN paper
    expect(exact.score).toBeGreaterThan(partial.score)
  })

  test('synonym expansion finds CNN paper from "convolutional"', () => {
    const result = scoreDraft('convolutional network paper', drafts[0])
    expect(result.score).toBeGreaterThan(0.4)
  })
})
