import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { KaTeX } from '../components/KaTeX'

/* ==========================================================================
   Paper Browse — "the reading room" — minimal zen botanical corpus.
   A calm cream chrome holds a question bar, a soft topography of the
   literature (round markers, soft halos), and a quiet catalogue beside it.
   ========================================================================== */

type Cluster = {
  id: number
  name: string
  color: string
}

const CLUSTERS: Cluster[] = [
  { id: 0, name: 'Efficient Attention',    color: '#7F9267' },
  { id: 1, name: 'Retrieval · RAG',        color: '#2C4B70' },
  { id: 2, name: 'Representation',         color: '#4A6741' },
  { id: 3, name: 'Reinforcement',          color: '#E0B13A' },
  { id: 4, name: 'Diffusion',              color: '#8B6E4E' },
  { id: 5, name: 'Interpretability',       color: '#A3B18A' },
  { id: 6, name: 'Graph Neural Nets',      color: '#264635' },
]

type Paper = {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  cluster: number
  abstract: string
  x: number
  y: number
  citations: number
}

const PAPERS: Paper[] = [
  // Efficient Attention — cluster 0
  { id: '1904.10509', title: 'Generating Long Sequences with Sparse Transformers', authors: ['R. Child', 'S. Gray', 'A. Radford', 'I. Sutskever'], year: 2019, venue: 'arXiv', cluster: 0, x: -0.58, y: 0.42, citations: 3182, abstract: 'We introduce sparse factorizations of the attention matrix that reduce self-attention cost from O(n²) to O(n√n), enabling Transformers to model sequences tens of thousands of tokens long.' },
  { id: '2004.05150', title: 'Longformer: The Long-Document Transformer', authors: ['I. Beltagy', 'M. Peters', 'A. Cohan'], year: 2020, venue: 'arXiv', cluster: 0, x: -0.62, y: 0.55, citations: 4012, abstract: 'Longformer replaces full attention with a drop-in combination of windowed local attention and task-motivated global tokens, scaling linearly with sequence length.' },
  { id: '2006.04768', title: 'Linformer: Self-Attention with Linear Complexity', authors: ['S. Wang', 'B. Li', 'M. Khabsa', 'H. Fang', 'H. Ma'], year: 2020, venue: 'arXiv', cluster: 0, x: -0.72, y: 0.28, citations: 1984, abstract: 'We project the key and value matrices to a lower dimension, demonstrating that self-attention can be approximated by a low-rank matrix and executed in linear time and memory.' },
  { id: '2009.14794', title: 'Rethinking Attention with Performers', authors: ['K. Choromanski', 'V. Likhosherstov', 'D. Dohan', 'X. Song'], year: 2020, venue: 'ICLR', cluster: 0, x: -0.54, y: 0.22, citations: 2201, abstract: 'Performers use FAVOR+ — a positive-definite kernel approximation — to estimate the softmax attention in linear space and time, retaining comparable accuracy.' },
  { id: '2205.14135', title: 'FlashAttention: Fast and Memory-Efficient Exact Attention', authors: ['T. Dao', 'D. Fu', 'S. Ermon', 'A. Rudra', 'C. Ré'], year: 2022, venue: 'NeurIPS', cluster: 0, x: -0.48, y: 0.48, citations: 2814, abstract: 'FlashAttention computes exact attention with I/O-aware tiling that minimises HBM reads and writes, giving 3× end-to-end speed-up over standard implementations.' },

  // RAG — cluster 1
  { id: '2005.11401', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP', authors: ['P. Lewis', 'E. Perez', 'A. Piktus'], year: 2020, venue: 'NeurIPS', cluster: 1, x: 0.18, y: 0.62, citations: 5118, abstract: 'RAG combines a parametric seq2seq model with a non-parametric memory (a dense vector index of Wikipedia) accessed via a neural retriever, yielding state-of-the-art open-domain QA.' },
  { id: '2004.04906', title: 'Dense Passage Retrieval for Open-Domain QA', authors: ['V. Karpukhin', 'B. Oguz'], year: 2020, venue: 'EMNLP', cluster: 1, x: 0.08, y: 0.72, citations: 3522, abstract: 'Dense Passage Retrieval uses a dual-encoder trained with in-batch negatives to retrieve relevant passages, substantially outperforming BM25 on open-domain QA benchmarks.' },
  { id: '2112.09118', title: 'Improving Language Models by Retrieving from Trillions of Tokens', authors: ['S. Borgeaud', 'A. Mensch'], year: 2022, venue: 'ICML', cluster: 1, x: 0.22, y: 0.48, citations: 1106, abstract: 'RETRO augments autoregressive language models with a chunked cross-attention over a 2-trillion-token retrieval database, matching 25× larger parametric models on benchmarks.' },
  { id: '2302.00083', title: 'In-Context Retrieval-Augmented Language Models', authors: ['O. Ram', 'Y. Levine', 'I. Dalmedigos'], year: 2023, venue: 'TACL', cluster: 1, x: 0.30, y: 0.66, citations: 412, abstract: 'We show that prepending retrieved passages to the context of an off-the-shelf LLM, without any fine-tuning, provides large perplexity improvements on language-modelling tasks.' },

  // Representation Learning — cluster 2
  { id: '2002.05709', title: 'A Simple Framework for Contrastive Learning (SimCLR)', authors: ['T. Chen', 'S. Kornblith', 'M. Norouzi', 'G. Hinton'], year: 2020, venue: 'ICML', cluster: 2, x: 0.62, y: -0.05, citations: 11842, abstract: 'SimCLR learns visual representations by maximising agreement between differently augmented views of the same image via a contrastive loss in latent space, with no specialised architectures.' },
  { id: '1911.05722', title: 'Momentum Contrast for Visual Representation Learning (MoCo)', authors: ['K. He', 'H. Fan', 'Y. Wu'], year: 2020, venue: 'CVPR', cluster: 2, x: 0.52, y: 0.12, citations: 9324, abstract: 'MoCo builds a dynamic dictionary with a queue and a moving-averaged encoder, enabling contrastive learning with large, consistent dictionaries on the fly.' },
  { id: '2103.00020', title: 'Learning Transferable Visual Models from Natural Language (CLIP)', authors: ['A. Radford', 'J. W. Kim'], year: 2021, venue: 'ICML', cluster: 2, x: 0.68, y: 0.08, citations: 18721, abstract: 'CLIP learns joint image-text representations from 400M web pairs via contrastive prediction, enabling zero-shot transfer to dozens of downstream vision tasks.' },
  { id: '2006.09882', title: 'Swapping Assignments between Views (SwAV)', authors: ['M. Caron', 'I. Misra', 'J. Mairal'], year: 2020, venue: 'NeurIPS', cluster: 2, x: 0.58, y: -0.22, citations: 3211, abstract: 'SwAV clusters features online and enforces consistency between cluster assignments for different views, avoiding pairwise comparisons required by contrastive methods.' },

  // Reinforcement Learning — cluster 3
  { id: '1707.06347', title: 'Proximal Policy Optimization Algorithms', authors: ['J. Schulman', 'F. Wolski', 'P. Dhariwal'], year: 2017, venue: 'arXiv', cluster: 3, x: -0.18, y: -0.58, citations: 22834, abstract: 'PPO is a family of policy-gradient methods that alternates between sampling data and performing multiple epochs of optimisation on a clipped surrogate objective.' },
  { id: '1801.01290', title: 'Soft Actor-Critic', authors: ['T. Haarnoja', 'A. Zhou', 'P. Abbeel'], year: 2018, venue: 'ICML', cluster: 3, x: -0.08, y: -0.68, citations: 8214, abstract: 'SAC is an off-policy actor-critic algorithm that maximises a trade-off between expected return and entropy, delivering state-of-the-art performance on continuous-control tasks.' },
  { id: '1509.02971', title: 'Continuous Control with Deep Reinforcement Learning', authors: ['T. Lillicrap', 'J. Hunt', 'A. Pritzel'], year: 2016, venue: 'ICLR', cluster: 3, x: -0.22, y: -0.78, citations: 11622, abstract: 'DDPG adapts deterministic policy gradients to deep networks with experience replay and target networks, enabling robust continuous-action control from pixels.' },

  // Diffusion & Generative — cluster 4
  { id: '2006.11239', title: 'Denoising Diffusion Probabilistic Models', authors: ['J. Ho', 'A. Jain', 'P. Abbeel'], year: 2020, venue: 'NeurIPS', cluster: 4, x: 0.72, y: -0.58, citations: 10214, abstract: 'DDPMs formulate image synthesis as a parameterised Markov chain trained via variational inference, producing samples of unprecedented quality.' },
  { id: '2112.10752', title: 'High-Resolution Image Synthesis with Latent Diffusion', authors: ['R. Rombach', 'A. Blattmann'], year: 2022, venue: 'CVPR', cluster: 4, x: 0.82, y: -0.48, citations: 8822, abstract: 'Latent diffusion applies the denoising process in a compressed latent space produced by an autoencoder, drastically reducing compute while retaining sample quality.' },
  { id: '2204.06125', title: 'Hierarchical Text-Conditional Image Generation (DALL-E 2)', authors: ['A. Ramesh', 'P. Dhariwal'], year: 2022, venue: 'arXiv', cluster: 4, x: 0.66, y: -0.44, citations: 3402, abstract: 'A two-stage model that first generates a CLIP image embedding from a caption, then decodes it into an image, offering explicit control over image similarity.' },

  // Interpretability — cluster 5
  { id: '2202.05262', title: 'Locating and Editing Factual Associations (ROME)', authors: ['K. Meng', 'D. Bau'], year: 2022, venue: 'NeurIPS', cluster: 5, x: -0.28, y: -0.12, citations: 512, abstract: 'ROME localises factual associations to specific MLP layers in GPT-style models and edits them via rank-one weight modifications, preserving surrounding knowledge.' },
  { id: '2209.11895', title: 'Mechanistic Interpretability of Grokking', authors: ['N. Nanda', 'L. Chan', 'T. Lieberum'], year: 2023, venue: 'ICLR', cluster: 5, x: -0.12, y: -0.22, citations: 318, abstract: 'We reverse-engineer a small transformer trained on modular addition, showing that grokking corresponds to the progressive emergence of a Fourier-basis circuit.' },
  { id: '2305.01610', title: 'Representation Engineering: A Top-Down Approach', authors: ['A. Zou', 'L. Phan'], year: 2023, venue: 'arXiv', cluster: 5, x: -0.32, y: -0.02, citations: 221, abstract: 'Representation Engineering applies tools from cognitive neuroscience to read and control high-level concepts in LLMs, offering a complementary view to circuit-level analyses.' },

  // GNNs — cluster 6
  { id: '1609.02907', title: 'Semi-Supervised Classification with GCNs', authors: ['T. Kipf', 'M. Welling'], year: 2017, venue: 'ICLR', cluster: 6, x: 0.02, y: 0.22, citations: 31215, abstract: 'GCNs approximate spectral graph convolutions via localised first-order filters, enabling scalable semi-supervised learning on citation and knowledge graphs.' },
  { id: '1710.10903', title: 'Graph Attention Networks', authors: ['P. Veličković', 'G. Cucurull'], year: 2018, venue: 'ICLR', cluster: 6, x: 0.12, y: 0.18, citations: 18744, abstract: 'GATs assign different importances to neighbouring nodes using masked self-attention, without requiring knowledge of the graph structure upfront.' },
  { id: '1806.01261', title: 'Relational Inductive Biases, Deep Learning, and Graph Networks', authors: ['P. Battaglia', 'J. Hamrick'], year: 2018, venue: 'arXiv', cluster: 6, x: -0.02, y: 0.12, citations: 5012, abstract: 'A position paper proposing graph networks as a unifying framework for relational reasoning, arguing that combinatorial generalisation requires explicit relational inductive biases.' },

  // more scatter fodder
  { id: '1706.03762', title: 'Attention Is All You Need', authors: ['A. Vaswani', 'N. Shazeer'], year: 2017, venue: 'NeurIPS', cluster: 0, x: -0.28, y: 0.38, citations: 102203, abstract: 'Introduces the Transformer, a sequence-transduction architecture based solely on self- and cross-attention mechanisms — the cornerstone of modern NLP.' },
  { id: '1810.04805', title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: ['J. Devlin', 'M.-W. Chang'], year: 2019, venue: 'NAACL', cluster: 2, x: 0.42, y: 0.18, citations: 84212, abstract: 'BERT pre-trains a deep bidirectional representation via masked language modelling and next-sentence prediction, establishing the pre-train-then-fine-tune paradigm.' },
  { id: '2005.14165', title: 'Language Models are Few-Shot Learners (GPT-3)', authors: ['T. Brown', 'B. Mann'], year: 2020, venue: 'NeurIPS', cluster: 2, x: 0.48, y: 0.32, citations: 37112, abstract: 'Scaling autoregressive language models to 175B parameters unlocks strong few-shot capabilities via in-context learning, without any task-specific fine-tuning.' },
  { id: '2302.13971', title: 'LLaMA: Open and Efficient Foundation Language Models', authors: ['H. Touvron', 'T. Lavril'], year: 2023, venue: 'arXiv', cluster: 2, x: 0.52, y: 0.40, citations: 9014, abstract: 'LLaMA is a collection of foundation models from 7B to 65B parameters trained on public data, matching the quality of proprietary models at a fraction of the compute.' },
]

// ─── component ──────────────────────────────────────────────────────────────

export default function PaperBrowse() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeCluster, setActiveCluster] = useState<number | 'all'>('all')
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null)
  const [hoveredPaper, setHoveredPaper] = useState<Paper | null>(null)
  const [answer, setAnswer] = useState<{ text: string; citations: number[] } | null>(null)
  const [answering, setAnswering] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 240)
    return () => clearTimeout(t)
  }, [query])

  const scoredPapers = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim()
    const toks = q.split(/\s+/).filter(w => w.length > 2)
    return PAPERS.map(p => {
      if (toks.length === 0) return { paper: p, score: 0 }
      const haystack = (p.title + ' ' + p.abstract).toLowerCase()
      let score = 0
      for (const t of toks) {
        const n = (haystack.match(new RegExp(t, 'g')) || []).length
        score += Math.min(n, 5) * (haystack.includes(t) ? 1 : 0)
      }
      const clusterMatch = CLUSTERS[p.cluster].name.toLowerCase().split(' ').some(w => toks.some(t => w.includes(t)))
      if (clusterMatch) score += 3
      return { paper: p, score }
    }).sort((a, b) => b.score - a.score)
  }, [debouncedQuery])

  const filtered = useMemo(() => {
    const base = debouncedQuery.trim()
      ? scoredPapers.filter(s => s.score > 0)
      : scoredPapers
    return activeCluster === 'all'
      ? base
      : base.filter(s => s.paper.cluster === activeCluster)
  }, [scoredPapers, activeCluster, debouncedQuery])

  const topResults = filtered.slice(0, 8)
  const maxScore = topResults[0]?.score || 1

  const queryPoint = useMemo(() => {
    if (!debouncedQuery.trim() || topResults.length === 0) return null
    const top = topResults.slice(0, 3).map(s => s.paper)
    if (top.length === 0) return null
    const x = top.reduce((a, p) => a + p.x, 0) / top.length
    const y = top.reduce((a, p) => a + p.y, 0) / top.length
    return { x, y }
  }, [debouncedQuery, topResults])

  const handleSynthesize = () => {
    if (!debouncedQuery.trim() || topResults.length === 0) return
    setAnswering(true)
    setAnswer(null)
    const cited = topResults.slice(0, 4).map((_, i) => i + 1)
    const snippets = topResults.slice(0, 4).map((s, i) => {
      const sentence = s.paper.abstract.split(/\.\s+/)[0]
      return sentence + ` [${i + 1}]`
    })
    const text = snippets.join('. ') + '.'
    setTimeout(() => {
      setAnswer({ text, citations: cited })
      setAnswering(false)
    }, 820)
  }

  const SAMPLE_QUERIES = [
    'efficient attention long context',
    'retrieval augmented language models',
    'contrastive visual representation',
    'denoising diffusion image synthesis',
  ]

  return (
    <div className="min-h-screen bg-cream relative">
      <Navbar variant="light" />

      {/* ── Masthead ─────────────────────────────────────────────── */}
      <Masthead />

      {/* ── Search ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-8 pt-10">
        <div className="flex items-baseline gap-3 mb-4">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
            ask the library
          </span>
          <span className="h-px flex-1 bg-forest/15" />
          <span className="font-[family-name:var(--font-editorial)] italic text-[15px] text-forest/55">
            what are we looking for today?
          </span>
        </div>

        <div className="flex items-stretch gap-0 bg-milk border border-forest/15 rounded-3xl shadow-[0_18px_36px_-22px_rgba(38,70,53,0.22)] overflow-hidden">
          <div className="flex items-center justify-center w-14 shrink-0 text-forest/55">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M21 21l-4.5-4.5" />
            </svg>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSynthesize()}
            placeholder="What methods have been proposed for efficient attention in long-context transformers?"
            className="flex-1 h-14 px-2 bg-transparent font-[family-name:var(--font-body)] text-[15px] text-forest placeholder-forest/35 focus:outline-none"
          />
          <button
            onClick={handleSynthesize}
            disabled={!debouncedQuery.trim() || answering}
            className={`h-14 px-6 my-1 mr-1 rounded-full font-[family-name:var(--font-body)] text-[12px] tracking-[0.16em] transition-all flex items-center gap-2 shrink-0 ${
              debouncedQuery.trim() && !answering
                ? 'bg-forest text-parchment hover:bg-forest-ink'
                : 'bg-forest/10 text-forest/35 cursor-not-allowed'
            }`}
          >
            {answering ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            <span>synthesise</span>
          </button>
        </div>

        {/* sample queries */}
        {!query.trim() && (
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <span className="font-[family-name:var(--font-editorial)] italic text-[14px] text-forest/55 mr-1">try asking —</span>
            {SAMPLE_QUERIES.map(q => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="px-3.5 py-1.5 rounded-full border border-forest/15 bg-milk hover:bg-sage/15 hover:border-forest/30 transition-colors font-[family-name:var(--font-editorial)] italic text-[13px] text-forest/70 hover:text-forest"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Cluster filter chips */}
        <div className="mt-8 flex flex-wrap gap-2 items-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mr-2">
            topics
          </span>
          <button
            onClick={() => setActiveCluster('all')}
            className={`h-9 px-4 rounded-full font-[family-name:var(--font-editorial)] italic text-[13px] transition-all border ${
              activeCluster === 'all'
                ? 'bg-forest text-parchment border-forest'
                : 'border-forest/15 text-forest/60 hover:border-forest/35 hover:text-forest bg-milk'
            }`}
          >
            all · <span className="tabular-nums">{PAPERS.length}</span>
          </button>
          {CLUSTERS.map(c => {
            const n = PAPERS.filter(p => p.cluster === c.id).length
            const active = activeCluster === c.id
            return (
              <button
                key={c.id}
                onClick={() => setActiveCluster(active ? 'all' : c.id)}
                className={`h-9 pl-3 pr-3.5 rounded-full flex items-center gap-2 font-[family-name:var(--font-editorial)] italic text-[13px] transition-all border ${
                  active
                    ? 'bg-milk border-forest/35 text-forest'
                    : 'text-forest/65 hover:text-forest bg-milk border-forest/15 hover:border-forest/35'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: c.color, opacity: active ? 1 : 0.7 }}
                />
                <span>{c.name}</span>
                <span className="font-[family-name:var(--font-mono)] text-[9px] opacity-55 tabular-nums">· {n}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Synthesised answer ──────────────────────────────────── */}
      {(answer || answering) && (
        <section className="max-w-6xl mx-auto px-8 pt-8 animate-fade-up">
          <div className="relative bg-milk border border-forest/15 rounded-3xl p-8 shadow-[0_18px_36px_-22px_rgba(38,70,53,0.18)] overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-sage-deep via-sage to-transparent opacity-70 absolute top-0 left-0 right-0" />
            <div className="flex items-start gap-7">
              <div className="shrink-0 w-12 h-12 rounded-full bg-sage/25 ring-1 ring-sage-deep/35 flex items-center justify-center font-[family-name:var(--font-editorial)] italic text-[22px] text-forest">
                A
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50">
                    synthesised response
                  </span>
                  <span className="font-[family-name:var(--font-editorial)] italic text-[14px] text-forest/55">
                    — assembled from top {topResults.slice(0, 4).length} passages
                  </span>
                </div>
                {answering ? (
                  <div className="space-y-2 animate-pulse mt-5">
                    <div className="h-3 rounded-full bg-forest/10 w-11/12" />
                    <div className="h-3 rounded-full bg-forest/10 w-10/12" />
                    <div className="h-3 rounded-full bg-forest/10 w-9/12" />
                  </div>
                ) : answer && (
                  <>
                    <p className="font-[family-name:var(--font-editorial)] text-[16px] leading-[1.85] text-forest/90 mt-2">
                      {renderAnswerWithCitations(answer.text)}
                    </p>
                    <div className="mt-5 pt-4 border-t border-forest/15 flex flex-wrap gap-2">
                      {topResults.slice(0, 4).map((s, i) => (
                        <button
                          key={s.paper.id}
                          onClick={() => setSelectedPaper(s.paper)}
                          className="inline-flex items-center gap-2 bg-parchment/40 border border-forest/15 rounded-full px-3.5 py-1.5 font-[family-name:var(--font-editorial)] italic text-[12.5px] text-forest hover:bg-sage/15 hover:border-forest/30 transition-colors"
                        >
                          <span className="font-[family-name:var(--font-mono)] not-italic text-[10px] text-forest/70 bg-milk border border-forest/20 rounded-full px-1.5 py-[1px]">{i + 1}</span>
                          <span>{s.paper.authors[0]?.replace(/\..*$/, '')} et al.</span>
                          <span className="opacity-55">{s.paper.year}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Two-column: topography + catalogue ────────────────── */}
      <section className="max-w-6xl mx-auto px-8 py-14 grid grid-cols-12 gap-8">
        {/* Topography */}
        <aside className="col-span-12 lg:col-span-5">
          <div className="sticky top-24">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-1">
                  figure I · topography
                </div>
                <h3 className="font-[family-name:var(--font-editorial)] italic text-[32px] text-forest leading-none">
                  the field, mapped.
                </h3>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] uppercase text-forest/50">PCA · 2-D</span>
            </div>
            <p className="font-[family-name:var(--font-editorial)] text-[14px] text-forest/65 leading-[1.7] mb-5 max-w-[44ch]">
              Each marker is a paper — colour identifies its constellation. Your query
              settles softly onto a sage halo as you type.
            </p>

            <ScatterMap
              papers={PAPERS}
              activeCluster={activeCluster}
              queryPoint={queryPoint}
              hoveredPaper={hoveredPaper}
              selectedPaper={selectedPaper}
              onHover={setHoveredPaper}
              onSelect={setSelectedPaper}
              topResultIds={new Set(topResults.map(r => r.paper.id))}
            />

            {/* legend */}
            <div className="mt-5 border border-forest/15 rounded-2xl p-5 bg-milk">
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-3">legend</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {CLUSTERS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCluster(activeCluster === c.id ? 'all' : c.id)}
                    className="flex items-center gap-2.5 font-[family-name:var(--font-editorial)] text-[13px] text-forest/70 hover:text-forest transition-colors text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="italic">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Catalogue */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-1">
                plate II · catalogue
              </div>
              <h3 className="font-[family-name:var(--font-editorial)] italic text-[32px] text-forest leading-none">
                {debouncedQuery.trim() ? 'nearest neighbours.' : 'the catalogue.'}
              </h3>
            </div>
            <div className="text-right">
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.24em] uppercase text-forest/50 tabular-nums">
                {filtered.length} / {PAPERS.length}
              </div>
              <div className="font-[family-name:var(--font-editorial)] italic text-[14px] text-forest/55 mt-1">
                click any to open ↓
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-milk border border-forest/15 border-dashed rounded-2xl py-16 px-8 text-center">
              <div className="font-[family-name:var(--font-editorial)] italic text-[26px] text-forest/55 mb-2">
                nothing in the stacks matched that.
              </div>
              <div className="font-[family-name:var(--font-editorial)] italic text-[13.5px] text-forest/50">
                try a broader query, or clear the active topic filter.
              </div>
            </div>
          ) : (
            <ol className="space-y-4">
              {filtered.slice(0, 20).map((s, idx) => (
                <CatalogueCard
                  key={s.paper.id}
                  rank={idx + 1}
                  paper={s.paper}
                  score={s.score}
                  maxScore={maxScore}
                  cluster={CLUSTERS[s.paper.cluster]}
                  query={debouncedQuery}
                  isSelected={selectedPaper?.id === s.paper.id}
                  onHover={setHoveredPaper}
                  onSelect={setSelectedPaper}
                />
              ))}
            </ol>
          )}
        </div>
      </section>

      {selectedPaper && (
        <DetailDrawer
          paper={selectedPaper}
          cluster={CLUSTERS[selectedPaper.cluster]}
          onClose={() => setSelectedPaper(null)}
        />
      )}
    </div>
  )
}

// ─── Masthead ───────────────────────────────────────────────────────────────

function Masthead() {
  return (
    <header className="relative border-b border-forest/12 overflow-hidden bg-cream">
      {/* soft botanical halos instead of sharp geometric shapes */}
      <div className="absolute inset-0 pointer-events-none -z-0">
        <div className="absolute -top-20 right-[8%] w-[420px] h-[420px] rounded-full bg-sage/20 blur-3xl" />
        <div className="absolute top-12 right-[42%] w-[260px] h-[260px] rounded-full bg-bau-yellow/10 blur-3xl" />
        <div className="absolute -bottom-10 left-[8%] w-[300px] h-[300px] rounded-full bg-sage-deep/12 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-8 pt-16 pb-12">
        <div className="flex items-baseline gap-4 mb-4">
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">
            volume I · no. 04
          </span>
          <div className="flex-1 h-px bg-forest/15" />
          <span className="font-[family-name:var(--font-editorial)] italic text-[16px] text-forest/55">anno MMXXVI</span>
        </div>

        <h1 className="font-[family-name:var(--font-editorial)] text-forest leading-[0.94] font-light">
          <span className="block text-[72px] md:text-[112px] italic">the corpus<span className="text-sage-deep">.</span></span>
          <span className="block text-[20px] md:text-[26px] italic text-forest/60 mt-3 max-w-[60ch]">
            — a topographical index of current literature, settled into a quiet shelf.
          </span>
        </h1>

        <div className="mt-9 flex items-baseline gap-6 flex-wrap">
          <p className="font-[family-name:var(--font-editorial)] text-[15px] leading-[1.8] text-forest/75 max-w-[58ch]">
            Pose a question in natural language. We search{' '}
            <span className="text-forest font-medium">{PAPERS.length.toLocaleString()}</span> curated arXiv preprints
            across <span className="text-forest font-medium">{CLUSTERS.length}</span> topic constellations and return
            synthesised answers — every claim pinned to the passage that taught it.
          </p>
          <div className="ml-auto shrink-0">
            <Link
              to="/editor/scratch"
              className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-forest text-parchment hover:bg-forest-ink transition-colors font-[family-name:var(--font-editorial)] italic text-[14px]"
            >
              begin a manuscript
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

// ─── subcomponents ──────────────────────────────────────────────────────────

function renderAnswerWithCitations(text: string) {
  const parts = text.split(/(\[\d+\])/)
  return parts.map((p, i) => {
    const m = p.match(/\[(\d+)\]/)
    if (m) return (
      <sup
        key={i}
        className="inline-flex items-baseline font-[family-name:var(--font-mono)] text-[10px] text-forest bg-sage/30 border border-sage-deep/40 rounded-full px-1.5 py-[1px] mx-[2px] align-super"
      >
        {m[1]}
      </sup>
    )
    return <span key={i}>{p}</span>
  })
}

function ScatterMap({
  papers, activeCluster, queryPoint, hoveredPaper, selectedPaper,
  onHover, onSelect, topResultIds,
}: {
  papers: Paper[]
  activeCluster: number | 'all'
  queryPoint: { x: number; y: number } | null
  hoveredPaper: Paper | null
  selectedPaper: Paper | null
  onHover: (p: Paper | null) => void
  onSelect: (p: Paper) => void
  topResultIds: Set<string>
}) {
  const W = 520
  const H = 420
  const pad = 30

  const px = (x: number) => pad + ((x + 1) / 2) * (W - pad * 2)
  const py = (y: number) => pad + ((1 - (y + 1) / 2)) * (H - pad * 2)

  const centers = useMemo(() => {
    const byC = new Map<number, { x: number; y: number; n: number }>()
    for (const p of papers) {
      const c = byC.get(p.cluster) ?? { x: 0, y: 0, n: 0 }
      c.x += p.x; c.y += p.y; c.n += 1
      byC.set(p.cluster, c)
    }
    return Array.from(byC.entries()).map(([id, v]) => ({
      id,
      x: v.x / v.n,
      y: v.y / v.n,
    }))
  }, [papers])

  return (
    <div className="relative bg-milk border border-forest/15 rounded-2xl overflow-hidden shadow-[0_14px_30px_-18px_rgba(38,70,53,0.2)]">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <defs>
          {CLUSTERS.map(c => (
            <radialGradient key={c.id} id={`cl-${c.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={c.color} stopOpacity="0.22" />
              <stop offset="70%" stopColor={c.color} stopOpacity="0.04" />
              <stop offset="100%" stopColor={c.color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {/* Axis frames */}
        <g fill="none" stroke="#264635" strokeWidth="0.5" opacity="0.22">
          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} />
          <line x1={pad} y1={pad}     x2={pad}     y2={H - pad} />
        </g>

        <text x={W - pad} y={H - 10} textAnchor="end" fontFamily="JetBrains Mono" fontSize="9" fill="#264635" opacity="0.45" letterSpacing="0.2em">PC₁ →</text>
        <text x={10} y={pad + 4}                    fontFamily="JetBrains Mono" fontSize="9" fill="#264635" opacity="0.45" letterSpacing="0.2em">↑ PC₂</text>

        {/* Cluster auras */}
        {centers.map(c => {
          const dim = activeCluster !== 'all' && activeCluster !== c.id
          return (
            <circle key={c.id} cx={px(c.x)} cy={py(c.y)} r={100} fill={`url(#cl-${c.id})`} opacity={dim ? 0.15 : 1} style={{ transition: 'opacity 200ms' }} />
          )
        })}

        {/* Soft threads from query to top 3 */}
        {queryPoint && papers.slice().sort((a, b) => {
          const qd = (p: Paper) => (p.x - queryPoint.x) ** 2 + (p.y - queryPoint.y) ** 2
          return qd(a) - qd(b)
        }).slice(0, 3).map((p, i) => (
          <line
            key={`th-${p.id}`}
            x1={px(queryPoint.x)} y1={py(queryPoint.y)}
            x2={px(p.x)} y2={py(p.y)}
            stroke="#7F9267" strokeWidth="0.8" strokeDasharray="2 4" opacity={0.55 - i * 0.12}
          />
        ))}

        {/* Cluster labels at centers — Fraunces italic, lowercase */}
        {centers.map(c => {
          const cl = CLUSTERS[c.id]
          const dim = activeCluster !== 'all' && activeCluster !== c.id
          return (
            <g key={`c-${c.id}`} opacity={dim ? 0.2 : 0.85} style={{ transition: 'opacity 200ms' }}>
              <text x={px(c.x)} y={py(c.y) - 14} textAnchor="middle" fontFamily="Fraunces" fontStyle="italic" fontSize="11.5" fill={cl.color}>
                {cl.name.toLowerCase()}
              </text>
            </g>
          )
        })}

        {/* Points — soft round markers */}
        {papers.map(p => {
          const dim = activeCluster !== 'all' && activeCluster !== p.cluster
          const isTop = topResultIds.has(p.id)
          const isHovered = hoveredPaper?.id === p.id
          const isSelected = selectedPaper?.id === p.id
          const cl = CLUSTERS[p.cluster]
          const base = isSelected ? 5.5 : isHovered ? 5 : isTop ? 4.5 : 3.2
          const cx = px(p.x)
          const cy = py(p.y)
          return (
            <g
              key={p.id}
              style={{ cursor: 'pointer', opacity: dim ? 0.22 : 1, transition: 'opacity 200ms' }}
              onMouseEnter={() => onHover(p)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(p)}
            >
              {(isHovered || isSelected) && <circle cx={cx} cy={cy} r={base + 5} fill={cl.color} opacity="0.18" />}
              <circle cx={cx} cy={cy} r={base} fill={cl.color} opacity={isTop ? 0.95 : 0.78} />
              {isSelected && <circle cx={cx} cy={cy} r={base + 1.5} fill="none" stroke="#FBF9F1" strokeWidth="1" />}
            </g>
          )
        })}

        {/* Query point — sage halo */}
        {queryPoint && (
          <g>
            <circle cx={px(queryPoint.x)} cy={py(queryPoint.y)} r="18" fill="#7F9267" opacity="0.18">
              <animate attributeName="r" values="14;22;14" dur="2.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.28;0.08;0.28" dur="2.6s" repeatCount="indefinite" />
            </circle>
            <circle cx={px(queryPoint.x)} cy={py(queryPoint.y)} r="5" fill="#7F9267" />
            <text x={px(queryPoint.x)} y={py(queryPoint.y) - 12} textAnchor="middle" fontFamily="Fraunces" fontStyle="italic" fontSize="13" fill="#264635">your query</text>
          </g>
        )}

        {/* hovered tag */}
        {hoveredPaper && (() => {
          const cx = px(hoveredPaper.x)
          const cy = py(hoveredPaper.y)
          const right = cx < W - 220
          const anchor = right ? 'start' : 'end'
          const tx = right ? cx + 12 : cx - 12
          return (
            <g pointerEvents="none">
              <rect x={right ? cx + 8 : cx - 220} y={cy - 28} width={212} height={42} rx="10" ry="10" fill="#264635" opacity="0.94" />
              <text x={tx} y={cy - 12} fontFamily="Fraunces" fontStyle="italic" fontSize="12" fill="#E9E4D4" textAnchor={anchor}>
                {hoveredPaper.title.slice(0, 32)}{hoveredPaper.title.length > 32 ? '…' : ''}
              </text>
              <text x={tx} y={cy + 4} fontFamily="JetBrains Mono" fontSize="9" fill="#A3B18A" textAnchor={anchor}>
                {hoveredPaper.id} · {hoveredPaper.year} · {hoveredPaper.citations.toLocaleString()} c.
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

function CatalogueCard({
  rank, paper, score, maxScore, cluster, query, isSelected, onHover, onSelect,
}: {
  rank: number
  paper: Paper
  score: number
  maxScore: number
  cluster: Cluster
  query: string
  isSelected: boolean
  onHover: (p: Paper | null) => void
  onSelect: (p: Paper) => void
}) {
  const similarity = maxScore > 0 ? Math.min(0.98, 0.52 + 0.46 * (score / maxScore)) : 0
  const hasQuery = query.trim().length > 0

  return (
    <li
      onMouseEnter={() => onHover(paper)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(paper)}
      className={`relative bg-milk border border-forest/15 rounded-2xl pl-7 pr-6 py-5 cursor-pointer transition-all duration-200 group ${
        isSelected
          ? 'shadow-[0_18px_36px_-18px_rgba(38,70,53,0.28)] -translate-y-0.5'
          : 'hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(38,70,53,0.22)]'
      }`}
    >
      {/* soft cluster accent stripe on the left */}
      <span
        className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full"
        style={{ background: cluster.color, opacity: 0.7 }}
      />

      {/* corner rank — soft round badge */}
      <div className="absolute -left-3 -top-3 w-7 h-7 rounded-full bg-cream border border-forest/15 flex items-center justify-center font-[family-name:var(--font-editorial)] italic text-[12px] text-forest/70 tabular-nums">
        {rank}
      </div>

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] text-forest/55">arXiv:{paper.id}</span>
        <span className="text-forest/20">·</span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 uppercase tracking-wider">{paper.venue} {paper.year}</span>
        <span className="text-forest/20">·</span>
        <span className="flex items-center gap-1.5 font-[family-name:var(--font-editorial)] italic text-[12.5px]" style={{ color: cluster.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cluster.color }} />
          {cluster.name}
        </span>
        {hasQuery && (
          <span className="ml-auto flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] text-forest/55">
            <span>cos ≈</span>
            <span className="text-forest font-medium tabular-nums">{similarity.toFixed(3)}</span>
            <SimilarityBar value={similarity} color={cluster.color} />
          </span>
        )}
      </div>

      <h4 className="font-[family-name:var(--font-editorial)] text-[22px] text-forest leading-[1.22] mb-1.5 tracking-[-0.005em]">
        {hasQuery ? highlightQuery(paper.title, query) : paper.title}
      </h4>

      <div className="font-[family-name:var(--font-mono)] text-[11px] text-forest/55 mb-3 tracking-tight">
        {paper.authors.join(' · ')}
      </div>

      <p className="font-[family-name:var(--font-editorial)] text-[14px] text-forest/75 leading-[1.75] line-clamp-3">
        {hasQuery ? highlightQuery(paper.abstract, query) : paper.abstract}
      </p>

      <div className="mt-4 pt-3 border-t border-forest/12 flex items-center gap-5 font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tracking-wider">
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M17.657 18.657A8 8 0 016.343 7.343M12 5v6l3 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="tabular-nums">{paper.citations.toLocaleString()}</span>
          <span className="opacity-65">cites</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sage" />
          <span>3 chunks · 2 captions</span>
        </span>
        <span className="ml-auto font-[family-name:var(--font-editorial)] italic text-[14px] text-forest/65 group-hover:text-forest transition-colors">
          open it ↗
        </span>
      </div>
    </li>
  )
}

function SimilarityBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="relative inline-block w-20 h-[4px] rounded-full bg-forest/10 overflow-hidden">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${value * 100}%`, background: color }}
      />
    </span>
  )
}

function highlightQuery(text: string, query: string) {
  const toks = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  if (toks.length === 0) return text
  const re = new RegExp(`(${toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((p, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-sage/30 text-forest px-0.5 rounded-sm">{p}</mark>
      : p
  )
}

function DetailDrawer({ paper, cluster, onClose }: { paper: Paper; cluster: Cluster; onClose: () => void }) {
  const drawerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-forest/45 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={drawerRef}
        className="relative w-full max-w-xl bg-milk paper-grain shadow-[0_30px_80px_-30px_rgba(38,70,53,0.5)] overflow-y-auto animate-slide-in-right border-l border-forest/15"
      >
        {/* soft cluster accent line */}
        <div className="h-[3px]" style={{ background: cluster.color, opacity: 0.6 }} />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-milk/95 backdrop-blur border-b border-forest/12 px-7 py-4 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: cluster.color }} />
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.24em] uppercase text-forest/60">arxiv:{paper.id}</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-forest/55 hover:text-forest hover:bg-sage/20 border border-forest/15 transition-colors"
            title="Close (esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-8 py-8">
          <div className="flex items-baseline gap-3 mb-5">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">now reading</span>
            <span className="h-px flex-1 bg-forest/12" />
          </div>

          <h2 className="font-[family-name:var(--font-editorial)] text-[34px] leading-[1.1] text-forest font-light mb-4 tracking-[-0.01em]">
            {paper.title}
          </h2>
          <div className="font-[family-name:var(--font-mono)] text-[12px] text-forest/65 mb-2">
            {paper.authors.join(' · ')}
          </div>
          <div className="flex items-center gap-2.5 mb-7 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-[family-name:var(--font-editorial)] italic text-[12.5px]"
              style={{ color: cluster.color, borderColor: `${cluster.color}55` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cluster.color }} />
              {cluster.name}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 tracking-[0.22em] uppercase">
              {paper.venue} · {paper.year} · {paper.citations.toLocaleString()} cites
            </span>
          </div>

          {/* Abstract */}
          <div className="mb-8 bg-parchment/40 border border-forest/10 rounded-2xl pl-5 pr-5 pt-4 pb-5 relative">
            <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-sage-deep/55" />
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/50 mb-2">abstract</div>
            <p className="font-[family-name:var(--font-editorial)] text-[14.5px] text-forest/85 leading-[1.85]">
              {paper.abstract}
            </p>
          </div>

          {/* Chunks */}
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55">retrieved chunks</span>
              <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/45 tracking-widest">cos · sim</span>
            </div>
            {[
              { section: 'Background',  snippet: 'Prior work has explored both sparse and linear approximations to the attention matrix, each trading exactness for asymptotic speed-up.', sim: 0.841 },
              { section: 'Methodology', snippet: 'We derive a closed-form factorisation in which local windows handle fine structure while a shared global memory mediates long-range dependencies.', sim: 0.812 },
              { section: 'Results',     snippet: 'On the PG-19 benchmark, our hybrid variant attains perplexity within 0.4 of the dense baseline at 3.2× the throughput.', sim: 0.774 },
            ].map((c, i) => (
              <div key={i} className="relative bg-milk border border-forest/12 rounded-2xl px-5 py-4 mb-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-sage-deep tracking-[0.2em] uppercase">§ {c.section}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/55 tabular-nums">{c.sim.toFixed(3)}</span>
                </div>
                <p className="font-[family-name:var(--font-editorial)] italic text-[13.5px] text-forest/80 leading-snug">"{c.snippet}"</p>
              </div>
            ))}
          </div>

          {/* Figure */}
          <div className="mb-8">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-3">figure · X-ref</div>
            <figure className="border border-forest/15 rounded-2xl bg-milk overflow-hidden">
              <div className="aspect-[5/3] relative">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="dg" x1="0" x2="1">
                      <stop offset="0" stopColor={cluster.color} stopOpacity="0.08" />
                      <stop offset="1" stopColor={cluster.color} stopOpacity="0.28" />
                    </linearGradient>
                  </defs>
                  <rect width="300" height="180" fill="url(#dg)" />
                  <g fill="none" stroke={cluster.color} strokeWidth="1.4" opacity="0.78">
                    <path d="M20 150 Q 80 120, 140 90 T 280 30" />
                    <path d="M20 160 Q 80 140, 140 110 T 280 70" strokeDasharray="2 4" />
                  </g>
                  {[40, 80, 140, 200, 260].map((x, i) => (
                    <circle key={i} cx={x} cy={150 - i * 20} r="3" fill={cluster.color} />
                  ))}
                  <text x="15" y="170"  fontFamily="JetBrains Mono" fontSize="8" fill="#264635" opacity="0.5">seq length (log)</text>
                  <text x="285" y="20"  fontFamily="JetBrains Mono" fontSize="8" fill="#264635" opacity="0.5" textAnchor="end">throughput</text>
                </svg>
              </div>
              <figcaption className="px-5 py-3 border-t border-forest/12 font-[family-name:var(--font-editorial)] italic text-[12.5px] text-forest/70 leading-snug">
                <span className="not-italic font-[family-name:var(--font-mono)] text-[9.5px] tracking-[0.22em] uppercase mr-2 text-sage-deep">figure 2.</span>
                Throughput vs. sequence length, comparing dense attention against the proposed hybrid across 5 scales.
              </figcaption>
            </figure>
          </div>

          {/* Key equation */}
          <div className="mb-8">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-3">key equation</div>
            <div className="bg-parchment/40 border border-forest/12 rounded-2xl px-5 py-5 flex items-center justify-between gap-4">
              <KaTeX
                math="\mathrm{Attn}(Q, K, V) = \mathrm{softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right) V"
                display
                className="flex-1 text-center"
              />
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 shrink-0">(2)</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Link
              to="/editor/scratch"
              className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 h-11 rounded-full bg-forest text-parchment hover:bg-forest-ink transition-colors font-[family-name:var(--font-editorial)] italic text-[14px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              cite in manuscript
            </Link>
            <button className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-milk border border-forest/20 hover:bg-sage/15 hover:border-forest/40 transition-colors font-[family-name:var(--font-editorial)] italic text-[14px] text-forest/75 hover:text-forest">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              open on arXiv
            </button>
          </div>

          {/* BibTeX */}
          <div className="mt-8">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.3em] uppercase text-forest/55 mb-3">bibtex</div>
            <div className="codebox">
              <div className="codebox-titlebar">
                <span className="codebox-dots"><span className="codebox-dot" /><span className="codebox-dot" /><span className="codebox-dot" /></span>
                <span>bibtex · {paper.id}.bib</span>
              </div>
              <pre className="p-4 overflow-x-auto leading-[1.7]">
<span className="tok-kw">@article</span>&#123;<span className="tok-fn">{paper.authors[0]?.split('.')[0]?.toLowerCase() || 'anon'}{paper.year}{paper.title.split(' ')[0].toLowerCase()}</span>,{'\n'}
{'  '}<span className="tok-sym">title</span>   = &#123;<span className="tok-str">{paper.title}</span>&#125;,{'\n'}
{'  '}<span className="tok-sym">author</span>  = &#123;<span className="tok-str">{paper.authors.join(' and ')}</span>&#125;,{'\n'}
{'  '}<span className="tok-sym">journal</span> = &#123;<span className="tok-str">{paper.venue}</span>&#125;,{'\n'}
{'  '}<span className="tok-sym">year</span>    = &#123;<span className="tok-num">{paper.year}</span>&#125;,{'\n'}
{'  '}<span className="tok-sym">eprint</span>  = &#123;<span className="tok-str">{paper.id}</span>&#125;,{'\n'}
&#125;
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
