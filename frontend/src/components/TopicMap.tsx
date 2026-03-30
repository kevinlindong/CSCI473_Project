import { useEffect, useState } from "react";
import { getTopicMap } from "../api/client";

interface PaperPoint {
  paper_id: string;
  title: string;
  x: number;
  y: number;
  cluster: number;
  cluster_label: string;
}

export default function TopicMap() {
  const [points, setPoints] = useState<PaperPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopicMap()
      .then((data) => setPoints(data.points))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading topic map...</p>;

  // TODO: render interactive Plotly scatter plot using react-plotly.js
  return (
    <div>
      <h2>Topic Map</h2>
      <p>Interactive scatter plot not yet implemented. {points.length} papers loaded.</p>
    </div>
  );
}
