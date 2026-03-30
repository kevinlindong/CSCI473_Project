import { useState } from "react";
import { postQuery } from "../api/client";

interface Props {
  onResult: (data: { answer: string; citations: Array<{ paper_id: string; title: string; url: string; passage: string }> }) => void;
}

export default function QueryInput({ onResult }: Props) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    try {
      const data = await postQuery(question);
      onResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Ask a Research Question</h2>
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="e.g., What methods have been proposed for efficient attention in long-context transformers?"
      />
      <button type="submit" disabled={loading}>
        {loading ? "Searching..." : "Search"}
      </button>
    </form>
  );
}
