interface Citation {
  paper_id: string;
  title: string;
  url: string;
  passage: string;
}

interface Props {
  data: {
    answer: string;
    citations: Citation[];
  };
}

export default function AnswerDisplay({ data }: Props) {
  return (
    <div className="answer-display">
      <h2>Answer</h2>
      <p>{data.answer}</p>
      {data.citations.length > 0 && (
        <div>
          <h3>Citations</h3>
          <ol>
            {data.citations.map((c, i) => (
              <li key={i}>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.title}
                </a>
                <p className="passage">{c.passage}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
