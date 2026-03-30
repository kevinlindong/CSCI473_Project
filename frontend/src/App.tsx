import { useState } from "react";
import QueryInput from "./components/QueryInput";
import AnswerDisplay from "./components/AnswerDisplay";
import TopicMap from "./components/TopicMap";
import PaperBrowser from "./components/PaperBrowser";

type Page = "query" | "topic-map" | "papers";

export default function App() {
  const [page, setPage] = useState<Page>("query");

  return (
    <div className="app">
      <header>
        <h1>ArXiv Research Assistant</h1>
        <nav>
          <button onClick={() => setPage("query")}>Query</button>
          <button onClick={() => setPage("topic-map")}>Topic Map</button>
          <button onClick={() => setPage("papers")}>Papers</button>
        </nav>
      </header>
      <main>
        {page === "query" && <QueryPage />}
        {page === "topic-map" && <TopicMap />}
        {page === "papers" && <PaperBrowser />}
      </main>
    </div>
  );
}

function QueryPage() {
  const [answer, setAnswer] = useState<{
    answer: string;
    citations: Array<{
      paper_id: string;
      title: string;
      url: string;
      passage: string;
    }>;
  } | null>(null);

  return (
    <div>
      <QueryInput onResult={setAnswer} />
      {answer && <AnswerDisplay data={answer} />}
    </div>
  );
}
