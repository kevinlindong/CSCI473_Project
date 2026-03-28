# ArXiv Research Assistant

A retrieval-augmented research tool that answers natural language questions
using a curated corpus of Arxiv papers, with an interactive topic map.

Built for CSCI-UA 473 (Fundamentals of Machine Learning) at NYU, Spring 2026.

## Features

- Natural language question answering over Arxiv papers with citations
- Three-tier retrieval: abstract → section chunks → figure captions
- From-scratch implementations: cosine similarity search, k-means clustering, PCA
- Interactive topic map with cluster visualization

## Quick Start

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Full Setup (from scratch)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. (Optional) Set up environment variables
cp .env.example .env
# Edit .env with your HuggingFace token if needed

# 3. Fetch papers from Arxiv
python scripts/fetch_papers.py

# 4. Build embedding matrices
python scripts/build_embeddings.py

# 5. Run the app
streamlit run app.py
```

## Project Structure

```
├── app.py                   # Streamlit entry point
├── config.py                # Central configuration
├── scripts/
│   ├── fetch_papers.py      # Download papers from Arxiv API
│   └── build_embeddings.py  # Encode corpus into embedding spaces
├── src/
│   ├── data.py              # Parse raw Arxiv data into structured records
│   ├── encoder.py           # Sentence-transformer encoding wrapper
│   ├── retrieval.py         # From-scratch cosine similarity NN search
│   ├── clustering.py        # From-scratch k-means clustering
│   ├── pca.py               # From-scratch PCA dimensionality reduction
│   ├── reranker.py          # Cross-encoder reranking fallback
│   ├── figures.py           # CLIP-based figure encoding fallback
│   └── llm.py               # LLM answer generation with citations
├── data/
│   ├── raw/                 # Raw Arxiv API responses
│   ├── processed/           # Parsed paper records
│   └── embeddings/          # Precomputed embedding matrices
├── tests/                   # Unit tests for from-scratch algorithms
└── notebooks/               # Exploratory analysis
```

## From-Scratch Algorithms

- **Cosine Similarity Search** (`src/retrieval.py`): Nearest-neighbor retrieval using dot product over L2-normalized vectors.
- **K-Means Clustering** (`src/clustering.py`): Iterative centroid assignment and update for topic discovery.
- **PCA** (`src/pca.py`): Eigendecomposition-based projection for 2D visualization.

## Team

- Person 1 — Data Pipeline
- Person 2 — Retrieval System
- Person 3 — Clustering & Visualization
- Person 4 — LLM Answer Generation
- Person 5 — Frontend & Integration

## License

MIT
