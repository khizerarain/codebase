/** Lightweight token relevance scoring for context assembly. */

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 2);
}

export function scoreRelevance(query: string, candidate: string): number {
  const qTokens = new Set(tokenize(query));
  if (!qTokens.size) return 0;
  const cTokens = tokenize(candidate);
  if (!cTokens.length) return 0;

  let hits = 0;
  for (const t of cTokens) {
    if (qTokens.has(t)) hits += 1;
  }
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c.includes(q) && q.length > 4) hits += 4;

  return hits / Math.sqrt(cTokens.length);
}

export function pickTopByRelevance<T>(
  items: T[],
  query: string,
  textOf: (item: T) => string,
  limit: number,
  minScore = 0.05,
): T[] {
  return items
    .map((item) => ({ item, score: scoreRelevance(query, textOf(item)) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}
