import { useEffect, useState } from "react";
import { getPapers } from "../api/client";

interface PaperSummary {
  paper_id: string;
  title: string;
  authors: string[];
  abstract: string;
}

export default function PaperBrowser() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPapers()
      .then(setPapers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading papers...</p>;

  return (
    <div>
      <h2>Paper Browser</h2>
      {papers.map((p) => (
        <div key={p.paper_id} className="paper-card">
          <h3>{p.title}</h3>
          <p className="authors">{p.authors.join(", ")}</p>
          <p className="abstract">{p.abstract}</p>
        </div>
      ))}
    </div>
  );
}
