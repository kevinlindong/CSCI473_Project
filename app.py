"""
app.py — Streamlit entry point for the ArXiv Research Assistant.

Run with: streamlit run app.py

Pages:
1. Query — Ask a question, get a cited answer from relevant papers.
2. Topic Map — Interactive PCA scatter plot colored by k-means clusters.
3. Paper Detail — View full abstract, sections, and figures for a paper.
"""

import streamlit as st


def main():
    st.set_page_config(
        page_title="ArXiv Research Assistant",
        page_icon="📚",
        layout="wide",
    )

    st.title("ArXiv Research Assistant")
    st.markdown(
        "Ask a natural language question and get answers synthesized from "
        "relevant Arxiv papers, with citations and an interactive topic map."
    )

    # Sidebar navigation
    page = st.sidebar.radio("Navigate", ["Query", "Topic Map", "Paper Browser"])

    if page == "Query":
        query_page()
    elif page == "Topic Map":
        topic_map_page()
    elif page == "Paper Browser":
        paper_browser_page()


def query_page():
    """Query page: text input → retrieval → LLM answer with citations."""
    st.header("Ask a Research Question")
    query = st.text_input("Enter your question:", placeholder="e.g., What methods have been proposed for efficient attention in long-context transformers?")

    if query:
        st.info("Retrieval and answer generation not yet implemented.")
        # TODO: encode query, retrieve papers, generate answer, display results


def topic_map_page():
    """Topic map: interactive PCA scatter plot colored by k-means clusters."""
    st.header("Topic Map")
    st.info("Topic map visualization not yet implemented.")
    # TODO: load embeddings, run clustering + PCA, render Plotly scatter plot


def paper_browser_page():
    """Paper browser: browse and view individual papers."""
    st.header("Paper Browser")
    st.info("Paper browser not yet implemented.")
    # TODO: load corpus, display searchable list, show paper details on click


if __name__ == "__main__":
    main()
