"""
config.py — Central configuration for the ArXiv Research Assistant.

All configurable values (paths, model names, hyperparameters) live here.
Other modules import from this file rather than hardcoding values.
"""

import os

# --- Paths ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_DIR = os.path.join(DATA_DIR, "raw", "enriched")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
EMBEDDINGS_DIR = os.path.join(DATA_DIR, "embeddings")

# --- Encoder ---
ENCODER_MODEL_NAME = "all-mpnet-base-v2"
EMBEDDING_DIM = 768

# --- Retrieval ---
N_RETRIEVAL_RESULTS = 20
N_RERANK_RESULTS = 5

# --- Clustering ---
# N_CLUSTERS=13 chosen via external-validation sweep over k ∈ [4, 30]:
#   - silhouette is uninformative on 768-d sentence-transformer embeddings
#     (flat at 0.06–0.08 across the whole range); used NMI against arXiv
#     primary_category as the objective instead
#   - NMI rises with k but degenerates into singleton clusters starting at k=14
#   - k=13 is the largest non-degenerate k before singletons appear
#     (NMI=0.344, ARI=0.085, min_cluster_size=9)
#   - captures sub-cluster structure within cs.LG (attention / RL / generative)
#   - re-run the sweep after any significant corpus change
N_CLUSTERS = 13
KMEANS_MAX_ITER = 100
KMEANS_SEED = 42

# --- k-NN graph ---
KNN_NEIGHBORS = 8

# --- PCA ---
N_PCA_COMPONENTS = 2

# --- LLM ---
# Instruction-tuned causal LM used for (a) cluster topic labeling at pipeline
# time and (b) RAG answer generation. Qwen2.5-1.5B-Instruct was chosen after
# flan-T5-base (250M) produced extractive / single-word labels even with
# few-shot prompting; the 6× param bump plus a modern chat template gives
# coherent 2-5 word topic phrases.
LLM_MODEL_NAME = "Qwen/Qwen2.5-1.5B-Instruct"
MAX_CONTEXT_LENGTH = 2048

# --- Arxiv Fetch ---
ARXIV_CATEGORIES = ["cs.CL", "cs.LG"]
MAX_PAPERS = 500

# --- ar5iv Scraping ---
AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html"
FETCH_DELAY_SECONDS = 3.0
# ar5iv coverage ends 2026-03-31; fetch the last 7 days of that window
AR5IV_END_DATE = "2026-03-31"
ARXIV_FETCH_DAYS = 7
FIGURE_DIR = os.path.join(RAW_DIR, "figures")
