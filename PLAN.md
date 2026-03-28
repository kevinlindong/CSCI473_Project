# Design Document — ArXiv Research Assistant

## Written Proposal

Modern researchers struggle to deal with the sheer volume of papers published in their respective field, making it difficult to keep up with modern literature. Finding which papers address a specific method, comparing approaches across studies, or locating a particular figure or result currently requires manually reading through dozens of abstracts and papers. We propose a retrieval augmented system over a curated corpus of Arxiv papers. A user can pose a natural language question, e.g., "what methods have been proposed for efficient attention in long-context transformers?", and receive an answer synthesized from relevant papers, along with citations, links to the specific sections, and figures that support it. The application will also provide an interactive topic map where users can visually explore clusters of related papers in the corpus, helping them discover relevant work they might not have found through keyword search alone.

We will organize each paper into three embedding spaces: an abstract space (one vector per paper for fast initial retrieval), a chunk space (sections such as Background, Methodology, and Results embedded individually for passage-level detail), and a caption space (figure captions embedded for figure-level retrieval). All three spaces use a shared sentence-transformer encoder. The primary retrieval path searches the abstract space using cosine similarity nearest-neighbor search, which we will implement from scratch. Retrieved paper IDs then serve as metadata keys to look up corresponding chunks and captions in the other two spaces for finer-grained results. As fallbacks, we use a pretrained cross-encoder reranker when abstracts are missing or low-quality, and CLIP-based image encoding when figure captions are absent. Retrieved passages, figures, and captions are assembled into a context window and passed alongside the user's query to an LLM (interfaced via HuggingFace or LangChain) to generate a cited answer. For visualization, we will use k-means clustering over the abstract embeddings to assign topic labels to each paper, then project the abstract vectors to two dimensions using PCA for an interactive scatter plot, allowing users to browse the corpus by topic cluster, click into individual papers, and see how their query relates spatially to different research areas.

---

## Repo Structure

```
CSCI473_Project/
├── app.py                        # Streamlit entry point — UI pages, layout, and navigation
├── config.py                     # Central config (paths, model names, hyperparameters)
├── scripts/
│   ├── fetch_papers.py           # Download papers from Arxiv API → data/raw/
│   └── build_embeddings.py       # Encode corpus into three embedding spaces → data/embeddings/
├── src/
│   ├── data.py                   # Parse raw Arxiv JSON into structured Paper records
│   ├── encoder.py                # Sentence-transformer wrapper — shared encoder for all spaces
│   ├── retrieval.py              # FROM-SCRATCH cosine similarity nearest-neighbor search
│   ├── clustering.py             # FROM-SCRATCH k-means clustering over abstract embeddings
│   ├── pca.py                    # FROM-SCRATCH PCA projection to 2D
│   ├── reranker.py               # Cross-encoder reranking fallback
│   ├── figures.py                # CLIP-based figure encoding fallback
│   └── llm.py                    # LLM answer generation with citation formatting
├── data/
│   ├── raw/                      # Raw JSON from Arxiv API
│   ├── processed/                # Parsed paper records as parquet
│   └── embeddings/               # Pre-computed .npy embedding matrices
├── tests/
│   ├── test_retrieval.py         # Tests for cosine similarity correctness
│   ├── test_clustering.py        # Tests for k-means convergence and output shapes
│   └── test_pca.py               # Tests for PCA dimensionality reduction
├── notebooks/
│   └── exploration.ipynb         # Prototyping and sanity checks
├── requirements.txt              # Pinned dependencies
├── .gitignore                    # Python, data, env, IDE ignores
├── .env.example                  # Template for API keys
├── README.md                     # Setup instructions, usage, team credits
└── LICENSE                       # MIT
```

---

## Division of Labor

| Person | Role | Owned Files | Deliverable |
|--------|------|-------------|-------------|
| Person 1 | Data Engineer | `scripts/fetch_papers.py`, `scripts/build_embeddings.py`, `src/data.py`, `src/encoder.py` | Data ingestion pipeline and embedding generation |
| Person 2 | Retrieval Engineer | `src/retrieval.py`, `src/reranker.py` | From-scratch cosine similarity search + reranker fallback |
| Person 3 | Clustering/Viz | `src/clustering.py`, `src/pca.py` | From-scratch k-means and PCA + topic map rendering |
| Person 4 | LLM/Generation | `src/llm.py`, `src/figures.py` | Answer synthesis with citations + CLIP fallback |
| Person 5 | Frontend/Integration | `app.py`, `config.py`, `tests/`, `README.md` | Streamlit UI, end-to-end wiring, testing, deployment |
