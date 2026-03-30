const BASE_URL = "/api";

export async function postQuery(question: string) {
  const res = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status}`);
  return res.json();
}

export async function getTopicMap() {
  const res = await fetch(`${BASE_URL}/topic-map`);
  if (!res.ok) throw new Error(`Topic map failed: ${res.status}`);
  return res.json();
}

export async function getPapers() {
  const res = await fetch(`${BASE_URL}/papers`);
  if (!res.ok) throw new Error(`Papers failed: ${res.status}`);
  return res.json();
}

export async function getPaper(paperId: string) {
  const res = await fetch(`${BASE_URL}/papers/${paperId}`);
  if (!res.ok) throw new Error(`Paper failed: ${res.status}`);
  return res.json();
}
