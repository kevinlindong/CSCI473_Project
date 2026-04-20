import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { KaTeX } from '../components/KaTeX'

/* ==========================================================================
   Paper Browse — Corpus explorer with topic scatter map, RAG-style answer
   synthesis, and library-catalog-card results. Seeded with fake ML papers
   so the UI is fully interactive without a backend.
   ========================================================================== */

type Cluster = {
  id: number
  name: string
  color: string
  glyph: string
}

const CLUSTERS: Cluster[] = [
  { id: 0, name: 'Efficient Attention',    color: '#8B6E4E', glyph: '∑' },
  { id: 1, name: 'Retrieval-Augmented LMs', color: '#4A6741', glyph: '⇌' },
  { id: 2, name: 'Representation Learning', color: '#5C7A6B', glyph: '○' },
  { id: 3, name: 'Reinforcement Learning',  color: '#D4A843', glyph: '△' },
  { id: 4, name: 'Diffusion & Generative',  color: '#8B4513', glyph: '≋' },
  { id: 5, name: 'Interpretability',        color: '#8a9b75', glyph: '◇' },
  { id: 6, name: 'Graph Neural Networks',   color: '#1a2f26', glyph: '⎔' },
]

type Paper = {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  cluster: number
  abstract: string
  x: number  // PCA coord, [-1, 1]
  y: number  // PCA coord, [-1, 1]
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

  // debounce for nicer vibe
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 240)
    return () => clearTimeout(t)
  }, [query])

  // ── scoring: simple keyword match, stand-in for cosine similarity ────
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
      // modest cluster boost to simulate embedding space
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

  // Query pseudo-position in PCA space (projects the query toward relevant cluster)
  const queryPoint = useMemo(() => {
    if (!debouncedQuery.trim() || topResults.length === 0) return null
    // average coords of top 3 results → approximate query embedding location
    const top = topResults.slice(0, 3).map(s => s.paper)
    if (top.length === 0) return null
    const x = top.reduce((a, p) => a + p.x, 0) / top.length
    const y = top.reduce((a, p) => a + p.y, 0) / top.length
    return { x, y }
  }, [debouncedQuery, topResults])

  // ── "synthesise answer" — fake RAG pipeline for demo ───────────────
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
    // simulate streaming
    setTimeout(() => {
      setAnswer({ text, citations: cited })
      setAnswering(false)
    }, 820)
  }

  // ── sample queries to seed discovery ────────────────────────────────
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
      <header className="relative border-b border-forest/10 overflow-hidden">
        <div className="absolute inset-0 paper-texture opacity-70" />
        {/* Classical frame */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" preserveAspectRatio="none">
          <pattern id="ms-rule" width="10" height="1" patternUnits="userSpaceOnUse">
            <rect width="10" height="1" fill="#8B6E4E" opacity="0.2" />
          </pattern>
        </svg>
        <div className="relative max-w-6xl mx-auto px-8 pt-14 pb-10">
          <div className="flex items-baseline gap-4 mb-3">
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.4em] uppercase text-sienna">Volume&nbsp;I · No.&nbsp;4</span>
            <div className="flex-1 h-px bg-sienna/30" />
            <span className="font-[family-name:var(--font-serif)] italic text-[12px] text-forest/60">anno 2026</span>
          </div>
          <h1 className="font-[family-name:var(--font-editorial)] text-[64px] leading-[0.95] text-forest font-semibold tracking-tight">
            The <em className="text-sienna/90 font-[family-name:var(--font-editorial)] italic">Corpus</em>
            <span className="block text-[36px] font-normal italic text-forest/60 mt-1">— a topographical index of current literature</span>
          </h1>
          <div className="flex items-baseline gap-6 mt-6">
            <span className="font-[family-name:var(--font-serif)] italic text-[15px] text-forest/65 max-w-xl leading-snug">
              Pose a question in natural language. We search {PAPERS.length.toLocaleString()} curated arXiv preprints
              across {CLUSTERS.length} topic constellations and return synthesised answers with citations, passages,
              and the figures that ground them.
            </span>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <Link
                to="/editor/scratch"
                className="group flex items-center gap-2 px-4 py-2 border border-forest/20 hover:border-forest/50 squircle-sm font-[family-name:var(--font-body)] text-[11px] tracking-[0.22em] uppercase text-forest/60 hover:text-forest transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 013.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Begin manuscript
              </Link>
            </div>
          </div>
        </div>

        {/* decorative rule */}
        <div className="max-w-6xl mx-auto px-8 pb-4">
          <svg className="w-full h-3" preserveAspectRatio="none" viewBox="0 0 800 12">
            <path d="M0 6 Q 200 -4, 400 6 T 800 6" stroke="#8B6E4E" strokeWidth="0.8" opacity="0.4" fill="none" />
            <circle cx="400" cy="6" r="2.4" fill="#8B6E4E" opacity="0.6" />
          </svg>
        </div>
      </header>

      {/* ── Search bar + cluster filter ───────────────────────────── */}
      <section className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-stretch gap-3">
          <div className="flex-1 relative">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 font-[family-name:var(--font-editorial)] italic text-sienna text-[20px] select-none pointer-events-none">Q.</div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSynthesize()}
              placeholder="What methods have been proposed for efficient attention in long-context transformers?"
              className="w-full h-14 pl-12 pr-5 bg-cream border border-forest/20 squircle-sm font-[family-name:var(--font-serif)] text-[17px] text-forest placeholder-forest/35 italic focus:outline-none focus:border-sienna/60 focus:bg-[#FBF7EA] transition-colors"
            />
          </div>
          <button
            onClick={handleSynthesize}
            disabled={!debouncedQuery.trim() || answering}
            className={`h-14 px-8 squircle-sm font-[family-name:var(--font-body)] text-[12px] tracking-[0.3em] uppercase transition-all flex items-center gap-2 shrink-0 ${
              debouncedQuery.trim() && !answering
                ? 'bg-forest text-parchment hover:bg-forest-deep'
                : 'bg-forest/15 text-forest/40 cursor-not-allowed'
            }`}
          >
            {answering ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M8.757 15.243l-2.121 2.121m0-12.728l2.121 2.121M15.243 15.243l2.121 2.121" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            )}
            <span>Synthesize</span>
          </button>
        </div>

        {/* sample queries */}
        {!query.trim() && (
          <div className="mt-4 flex items-baseline gap-3 flex-wrap">
            <span className="font-[family-name:var(--font-serif)] italic text-[12px] text-forest/45">try —</span>
            {SAMPLE_QUERIES.map(q => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="font-[family-name:var(--font-serif)] italic text-[13px] text-sienna/80 hover:text-sienna border-b border-dotted border-sienna/40 hover:border-sienna"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Cluster filter chips */}
        <div className="mt-6 flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setActiveCluster('all')}
            className={`h-8 px-3 squircle-sm font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] uppercase transition-colors ${
              activeCluster === 'all' ? 'bg-forest text-parchment' : 'border border-forest/15 text-forest/50 hover:text-forest hover:border-forest/35'
            }`}
          >
            All · {PAPERS.length}
          </button>
          {CLUSTERS.map(c => {
            const n = PAPERS.filter(p => p.cluster === c.id).length
            const active = activeCluster === c.id
            return (
              <button
                key={c.id}
                onClick={() => setActiveCluster(active ? 'all' : c.id)}
                className={`h-8 pl-2 pr-3 flex items-center gap-2 squircle-sm font-[family-name:var(--font-body)] text-[11px] transition-all border ${
                  active ? 'border-transparent shadow-sm' : 'border-forest/10 hover:border-forest/25'
                }`}
                style={{
                  backgroundColor: active ? c.color + '22' : 'transparent',
                  color: active ? c.color : 'rgba(26,47,38,0.6)',
                }}
              >
                <span className="w-5 h-5 flex items-center justify-center rounded-full text-[11px]" style={{ backgroundColor: c.color + '30', color: c.color }}>{c.glyph}</span>
                <span>{c.name}</span>
                <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/35">{n}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Synthesised answer panel (appears after Synthesize) ──── */}
      {(answer || answering) && (
        <section className="max-w-6xl mx-auto px-8 pb-6 animate-fade-up">
          <div className="relative bg-[#FBF7EA] border border-forest/15 squircle-xl p-8 paper-grain overflow-hidden">
            {/* Ornament */}
            <div className="absolute top-5 right-6 flex items-center gap-2 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.3em] uppercase text-forest/40">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1 L8.4 5.3 L13 5.7 L9.5 8.6 L10.7 13 L7 10.7 L3.3 13 L4.5 8.6 L1 5.7 L5.6 5.3 Z" fill="#8B6E4E" opacity="0.7" /></svg>
              Synthesised response
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-[family-name:var(--font-editorial)] italic text-[32px] text-sienna leading-none">A.</span>
              <span className="font-[family-name:var(--font-serif)] italic text-[13px] text-forest/50">assembled from top {topResults.slice(0, 4).length} passages</span>
            </div>
            {answering ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-forest/10 rounded w-11/12" />
                <div className="h-4 bg-forest/10 rounded w-10/12" />
                <div className="h-4 bg-forest/10 rounded w-9/12" />
              </div>
            ) : answer && (
              <>
                <p className="font-[family-name:var(--font-serif)] text-[16px] leading-[1.8] text-forest/85">
                  {renderAnswerWithCitations(answer.text)}
                </p>
                <div className="mt-6 pt-4 border-t border-forest/10 flex flex-wrap gap-3">
                  {topResults.slice(0, 4).map((s, i) => (
                    <button
                      key={s.paper.id}
                      onClick={() => setSelectedPaper(s.paper)}
                      className="inline-flex items-baseline gap-2 font-[family-name:var(--font-serif)] text-[12px] text-forest/70 hover:text-forest border-b border-dotted border-forest/30 hover:border-forest"
                    >
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-sienna">[{i + 1}]</span>
                      <span className="italic">{s.paper.authors[0]?.replace(/\..*$/, '')} et al., {s.paper.year}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Two-column: scatter map + results ────────────────────── */}
      <section className="max-w-6xl mx-auto px-8 pb-16 grid grid-cols-12 gap-6">
        {/* ── SCATTER MAP ─────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-5">
          <div className="sticky top-20">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-[family-name:var(--font-editorial)] italic text-[20px] text-forest">Topography</h3>
              <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.25em] uppercase text-forest/40">PCA · 2-D</span>
            </div>
            <div className="font-[family-name:var(--font-serif)] italic text-[12px] text-forest/55 mb-3">
              Each point: one paper. Hue: k-means cluster. Your query projects onto the shaded circle.
            </div>

            <ScatterMap
              papers={PAPERS}
              clusters={CLUSTERS}
              activeCluster={activeCluster}
              queryPoint={queryPoint}
              hoveredPaper={hoveredPaper}
              selectedPaper={selectedPaper}
              onHover={setHoveredPaper}
              onSelect={setSelectedPaper}
              topResultIds={new Set(topResults.map(r => r.paper.id))}
            />

            {/* legend strip */}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
              {CLUSTERS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveCluster(activeCluster === c.id ? 'all' : c.id)}
                  className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[9px] text-forest/50 hover:text-forest transition-colors"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RESULTS ────────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-[family-name:var(--font-editorial)] italic text-[20px] text-forest">
              {debouncedQuery.trim() ? 'Nearest neighbours' : 'Catalogue'}
            </h3>
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/45 tabular-nums">
              {filtered.length} of {PAPERS.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-parchment/60 border border-dashed border-forest/20 squircle-xl py-16 px-8 text-center">
              <div className="font-[family-name:var(--font-editorial)] italic text-[20px] text-forest/55 mb-2">No matches in the corpus.</div>
              <div className="font-[family-name:var(--font-serif)] text-[13px] text-forest/40">Try a broader query, or remove the active topic filter.</div>
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

      {/* ── Detail drawer for selected paper ──────────────────────── */}
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

// ─── subcomponents ──────────────────────────────────────────────────────────

function renderAnswerWithCitations(text: string) {
  const parts = text.split(/(\[\d+\])/)
  return parts.map((p, i) => {
    const m = p.match(/\[(\d+)\]/)
    if (m) return (
      <sup key={i} className="inline-flex items-baseline font-[family-name:var(--font-mono)] text-[9px] text-rust bg-amber/15 border border-amber/30 rounded px-1 py-[1px] mx-[1px] align-super">{m[1]}</sup>
    )
    return <span key={i}>{p}</span>
  })
}

function ScatterMap({
  papers, clusters, activeCluster, queryPoint, hoveredPaper, selectedPaper,
  onHover, onSelect, topResultIds,
}: {
  papers: Paper[]
  clusters: Cluster[]
  activeCluster: number | 'all'
  queryPoint: { x: number; y: number } | null
  hoveredPaper: Paper | null
  selectedPaper: Paper | null
  onHover: (p: Paper | null) => void
  onSelect: (p: Paper) => void
  topResultIds: Set<string>
}) {
  void clusters
  const W = 520
  const H = 420
  const pad = 30

  // project -1..1 → svg
  const px = (x: number) => pad + ((x + 1) / 2) * (W - pad * 2)
  const py = (y: number) => pad + ((1 - (y + 1) / 2)) * (H - pad * 2)

  // Radial gradient per cluster center (kmeans mean)
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
    <div className="relative bg-[#FBF7EA] border border-forest/15 squircle-xl overflow-hidden paper-grain">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <defs>
          {CLUSTERS.map(c => (
            <radialGradient key={c.id} id={`cl-${c.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={c.color} stopOpacity="0.32" />
              <stop offset="70%" stopColor={c.color} stopOpacity="0.04" />
              <stop offset="100%" stopColor={c.color} stopOpacity="0" />
            </radialGradient>
          ))}
          <pattern id="grid-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="#1a2f26" opacity="0.12" />
          </pattern>
        </defs>

        {/* dotted grid */}
        <rect width={W} height={H} fill="url(#grid-dots)" />

        {/* Axis labels — minimal, editorial */}
        <text x={pad} y={H - 8} fontFamily="JetBrains Mono" fontSize="9" fill="#1a2f26" opacity="0.35">PC₁ →</text>
        <text x={8} y={H / 2} fontFamily="JetBrains Mono" fontSize="9" fill="#1a2f26" opacity="0.35" transform={`rotate(-90 8 ${H / 2})`}>PC₂ →</text>

        {/* Cluster auras */}
        {centers.map(c => {
          const cl = CLUSTERS[c.id]
          const dim = activeCluster !== 'all' && activeCluster !== c.id
          return (
            <circle
              key={c.id}
              cx={px(c.x)} cy={py(c.y)} r={100}
              fill={`url(#cl-${c.id})`}
              opacity={dim ? 0.15 : 1}
              style={{ transition: 'opacity 200ms' }}
            />
          )
        })}

        {/* Threads from query point to top 3 results */}
        {queryPoint && papers.slice().sort((a, b) => {
          const qd = (p: Paper) => (p.x - queryPoint.x) ** 2 + (p.y - queryPoint.y) ** 2
          return qd(a) - qd(b)
        }).slice(0, 3).map((p, i) => (
          <line
            key={`th-${p.id}`}
            x1={px(queryPoint.x)} y1={py(queryPoint.y)}
            x2={px(p.x)} y2={py(p.y)}
            stroke="#8B6E4E"
            strokeWidth="0.9"
            strokeDasharray="2 3"
            opacity={0.6 - i * 0.12}
            className="thread-line"
          />
        ))}

        {/* Cluster centers — faint anchor cross */}
        {centers.map(c => {
          const cl = CLUSTERS[c.id]
          const dim = activeCluster !== 'all' && activeCluster !== c.id
          return (
            <g key={`c-${c.id}`} opacity={dim ? 0.2 : 0.75} style={{ transition: 'opacity 200ms' }}>
              <text
                x={px(c.x)}
                y={py(c.y) - 16}
                textAnchor="middle"
                fontFamily="EB Garamond"
                fontStyle="italic"
                fontSize="12"
                fill={cl.color}
              >{cl.name}</text>
            </g>
          )
        })}

        {/* Points */}
        {papers.map(p => {
          const dim = activeCluster !== 'all' && activeCluster !== p.cluster
          const isTop = topResultIds.has(p.id)
          const isHovered = hoveredPaper?.id === p.id
          const isSelected = selectedPaper?.id === p.id
          const cl = CLUSTERS[p.cluster]
          const r = isSelected ? 6.5 : isHovered ? 5.5 : isTop ? 4.5 : 3
          return (
            <g
              key={p.id}
              style={{
                cursor: 'pointer',
                opacity: dim ? 0.22 : 1,
                transition: 'opacity 200ms',
              }}
              onMouseEnter={() => onHover(p)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(p)}
            >
              <circle cx={px(p.x)} cy={py(p.y)} r={r + 4} fill={cl.color} opacity={isHovered || isSelected ? 0.18 : 0} />
              <circle
                cx={px(p.x)} cy={py(p.y)} r={r}
                fill={cl.color}
                stroke={isSelected ? '#1a2f26' : isTop ? '#FBF7EA' : 'none'}
                strokeWidth={isSelected ? 1.5 : 1}
                opacity={isTop ? 1 : 0.78}
              />
            </g>
          )
        })}

        {/* Query point — pulsing amber */}
        {queryPoint && (
          <g>
            <circle cx={px(queryPoint.x)} cy={py(queryPoint.y)} r="18" fill="#D4A843" opacity="0.16">
              <animate attributeName="r" values="12;22;12" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.05;0.3" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={px(queryPoint.x)} cy={py(queryPoint.y)} r="5" fill="#D4A843" stroke="#8B4513" strokeWidth="1.2" />
            <text
              x={px(queryPoint.x)}
              y={py(queryPoint.y) - 12}
              textAnchor="middle"
              fontFamily="EB Garamond"
              fontStyle="italic"
              fontSize="11"
              fill="#8B4513"
            >your query</text>
          </g>
        )}

        {/* Hovered label */}
        {hoveredPaper && (() => {
          const cx = px(hoveredPaper.x)
          const cy = py(hoveredPaper.y)
          const right = cx < W - 180
          const tx = right ? cx + 10 : cx - 10
          const anchor = right ? 'start' : 'end'
          return (
            <g pointerEvents="none">
              <rect
                x={right ? cx + 8 : cx - 192}
                y={cy - 24}
                width={184}
                height={36}
                rx={4}
                fill="#1a2f26"
                opacity="0.93"
              />
              <text x={tx} y={cy - 10} fontFamily="EB Garamond" fontSize="12" fill="#E9E4D4" textAnchor={anchor}>
                {hoveredPaper.title.slice(0, 32)}{hoveredPaper.title.length > 32 ? '…' : ''}
              </text>
              <text x={tx} y={cy + 4} fontFamily="JetBrains Mono" fontSize="8" fill="#A3B18A" textAnchor={anchor}>
                {hoveredPaper.id} · {hoveredPaper.year}
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
      className={`relative bg-[#FBF7EA] border squircle-xl px-6 py-5 cursor-pointer transition-all duration-200 hover:shadow-[0_10px_30px_-18px_rgba(26,47,38,0.4)] ${
        isSelected ? 'border-sienna/50 bg-[#FBF4E0]' : 'border-forest/10 hover:border-forest/25'
      }`}
    >
      {/* corner rank */}
      <div className="absolute -left-3 top-5 bg-forest text-parchment w-7 h-7 rounded-full flex items-center justify-center font-[family-name:var(--font-mono)] text-[10px] font-medium tabular-nums">
        {rank}
      </div>

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] text-sienna/80">arXiv:{paper.id}</span>
        <span className="text-forest/15">·</span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50">{paper.venue} {paper.year}</span>
        <span className="text-forest/15">·</span>
        <span className="flex items-center gap-1 font-[family-name:var(--font-mono)] text-[10px] text-forest/45">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cluster.color }} />
          {cluster.name}
        </span>
        {hasQuery && (
          <span className="ml-auto flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] text-forest/50">
            <span className="smcp">cos ≈</span>
            <span className="text-forest/70 font-medium">{similarity.toFixed(3)}</span>
            <SimilarityBar value={similarity} />
          </span>
        )}
      </div>

      <h4 className="font-[family-name:var(--font-editorial)] text-[20px] text-forest font-semibold leading-[1.2] mb-1.5">
        {hasQuery ? highlightQuery(paper.title, query) : paper.title}
      </h4>

      <div className="font-[family-name:var(--font-serif)] italic text-[13px] text-forest/60 mb-3">
        {paper.authors.join(' · ')}
      </div>

      <p className="font-[family-name:var(--font-serif)] text-[13.5px] text-forest/75 leading-[1.65] line-clamp-3">
        {hasQuery ? highlightQuery(paper.abstract, query) : paper.abstract}
      </p>

      <div className="mt-3 pt-3 border-t border-forest/[0.08] flex items-center gap-4 font-[family-name:var(--font-mono)] text-[10px] text-forest/40">
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M17.657 18.657A8 8 0 016.343 7.343M12 5v6l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {paper.citations.toLocaleString()} cites
        </span>
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          3 chunks · 2 captions
        </span>
        <span className="ml-auto italic font-[family-name:var(--font-serif)] text-forest/50 text-[11px]">open →</span>
      </div>
    </li>
  )
}

function SimilarityBar({ value }: { value: number }) {
  return (
    <span className="relative inline-block w-16 h-[6px] bg-forest/8 rounded-full overflow-hidden">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${value * 100}%`,
          background: `linear-gradient(90deg, #4A6741, #8B6E4E)`,
        }}
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
      ? <mark key={i} className="bg-amber/25 text-forest px-0.5 rounded-[2px]">{p}</mark>
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
      <div className="absolute inset-0 bg-forest/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={drawerRef}
        className="relative w-full max-w-xl bg-[#FBF7EA] paper-grain shadow-2xl overflow-y-auto animate-slide-in-right border-l border-forest/15"
      >
        {/* Catalogue card header */}
        <div className="sticky top-0 z-10 bg-[#FBF7EA] border-b border-forest/10 px-8 py-5 flex items-center gap-3">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-[family-name:var(--font-editorial)]" style={{ backgroundColor: cluster.color + '25', color: cluster.color }}>
            {cluster.glyph}
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] uppercase text-sienna/80">arxiv:{paper.id}</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center squircle-sm text-forest/40 hover:text-forest hover:bg-forest/[0.06] transition-colors"
            title="Close (esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-8 py-8">
          <h2 className="font-[family-name:var(--font-editorial)] text-[30px] leading-[1.1] text-forest font-semibold mb-3">
            {paper.title}
          </h2>
          <div className="font-[family-name:var(--font-serif)] italic text-[15px] text-forest/65 mb-1">
            {paper.authors.join(' · ')}
          </div>
          <div className="font-[family-name:var(--font-mono)] text-[10px] text-forest/50 tracking-[0.2em] uppercase mb-6">
            {paper.venue} · {paper.year} · {paper.citations.toLocaleString()} cites
          </div>

          {/* Abstract */}
          <div className="mb-8">
            <div className="smcp text-forest/50 text-[11px] mb-2 tracking-[0.22em]">Abstract</div>
            <p className="font-[family-name:var(--font-serif)] text-[15px] text-forest/80 leading-[1.8] text-justify">
              {paper.abstract}
            </p>
          </div>

          {/* Chunk preview */}
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-3">
              <div className="smcp text-forest/50 text-[11px] tracking-[0.22em]">Retrieved chunks</div>
              <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/35">chunk space · cos-sim</span>
            </div>
            {[
              { section: 'Background', snippet: 'Prior work has explored both sparse and linear approximations to the attention matrix, each trading exactness for asymptotic speed-up.', sim: 0.841 },
              { section: 'Methodology', snippet: 'We derive a closed-form factorisation in which local windows handle fine structure while a shared global memory mediates long-range dependencies.', sim: 0.812 },
              { section: 'Results', snippet: 'On the PG-19 benchmark, our hybrid variant attains perplexity within 0.4 of the dense baseline at 3.2× the throughput.', sim: 0.774 },
            ].map((c, i) => (
              <div key={i} className="relative bg-cream border border-forest/10 squircle-sm px-4 py-3 mb-2.5">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="font-[family-name:var(--font-mono)] text-[9px] text-sienna tracking-[0.2em] uppercase">§ {c.section}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/45">{c.sim.toFixed(3)}</span>
                </div>
                <p className="font-[family-name:var(--font-serif)] italic text-[13px] text-forest/75 leading-snug">"{c.snippet}"</p>
              </div>
            ))}
          </div>

          {/* Captioned figure (fake) */}
          <div className="mb-8">
            <div className="smcp text-forest/50 text-[11px] mb-3 tracking-[0.22em]">Figures cross-referenced</div>
            <figure className="bg-cream border border-forest/10 squircle-sm overflow-hidden">
              <div className="aspect-[5/3] relative">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="dg" x1="0" x2="1">
                      <stop offset="0" stopColor={cluster.color} stopOpacity="0.1" />
                      <stop offset="1" stopColor={cluster.color} stopOpacity="0.35" />
                    </linearGradient>
                  </defs>
                  <rect width="300" height="180" fill="url(#dg)" />
                  <g fill="none" stroke={cluster.color} strokeWidth="1.4" opacity="0.8">
                    <path d="M20 150 Q 80 120, 140 90 T 280 30" />
                    <path d="M20 160 Q 80 140, 140 110 T 280 70" strokeDasharray="2 4" />
                  </g>
                  {[40, 80, 140, 200, 260].map((x, i) => (
                    <circle key={i} cx={x} cy={150 - i * 20} r="3" fill={cluster.color} />
                  ))}
                  <text x="15" y="170" fontFamily="JetBrains Mono" fontSize="8" fill="#1a2f26" opacity="0.45">seq length (log)</text>
                  <text x="285" y="20" fontFamily="JetBrains Mono" fontSize="8" fill="#1a2f26" opacity="0.45" textAnchor="end">throughput</text>
                </svg>
              </div>
              <figcaption className="px-4 py-3 font-[family-name:var(--font-serif)] italic text-[12px] text-forest/65 leading-snug">
                <span className="smcp not-italic text-sienna mr-2 tracking-[0.18em] text-[0.9em]">Figure 2.</span>
                Throughput vs. sequence length, comparing dense attention against the proposed hybrid across 5 scales.
              </figcaption>
            </figure>
          </div>

          {/* Key equation */}
          <div className="mb-8">
            <div className="smcp text-forest/50 text-[11px] mb-3 tracking-[0.22em]">Key equation</div>
            <div className="bg-cream border border-forest/10 squircle-sm px-5 py-4 flex items-center justify-between gap-4">
              <KaTeX
                math="\mathrm{Attn}(Q, K, V) = \mathrm{softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right) V"
                display
                className="flex-1 text-center"
              />
              <span className="font-[family-name:var(--font-mono)] text-[9px] text-forest/40 shrink-0">(2)</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Link
              to="/editor/scratch"
              className="flex-1 min-w-[180px] flex items-center justify-center gap-2 h-10 bg-forest text-parchment squircle-sm font-[family-name:var(--font-body)] text-[11px] tracking-[0.22em] uppercase hover:bg-forest-deep transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Cite in manuscript
            </Link>
            <button className="flex items-center gap-2 h-10 px-4 border border-forest/20 text-forest/70 hover:text-forest hover:border-forest/40 squircle-sm font-[family-name:var(--font-body)] text-[11px] tracking-[0.22em] uppercase transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              Open on arXiv
            </button>
          </div>

          {/* BibTeX stub */}
          <div className="mt-8">
            <div className="smcp text-forest/50 text-[11px] mb-3 tracking-[0.22em]">BibTeX</div>
            <pre className="bg-forest text-parchment/90 font-[family-name:var(--font-mono)] text-[10.5px] leading-snug p-4 squircle-sm overflow-x-auto">
{`@article{${paper.authors[0]?.split('.')[0]?.toLowerCase() || 'anon'}${paper.year}${paper.title.split(' ')[0].toLowerCase()},
  title   = {${paper.title}},
  author  = {${paper.authors.join(' and ')}},
  journal = {${paper.venue}},
  year    = {${paper.year}},
  eprint  = {${paper.id}},
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
