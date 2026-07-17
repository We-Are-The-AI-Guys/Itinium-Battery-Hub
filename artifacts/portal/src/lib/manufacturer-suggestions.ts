import { normalize, similarity } from "./cell-type-suggestions";

export interface ManufacturerSuggestion {
  name: string;
  score: number;
}

/**
 * Rank the known manufacturers list against a typed value. Tolerant of case
 * differences and partial names ("enersys" or "hawker" → "EnerSys / Hawker"),
 * with alias support (e.g. "GNB" → "Exide / GNB") and a fuzzy fallback for
 * typos. Returns canonical list entries only, deduped and sorted by score.
 */
export function rankManufacturerSuggestions(
  typedValue: string,
  manufacturers: string[],
  aliases: Record<string, string> = {},
  limit = 3,
  minScore = 0.72
): ManufacturerSuggestion[] {
  const normV = normalize(typedValue || "");
  if (!normV) return [];

  const best = new Map<string, number>();
  const consider = (canonical: string, score: number) => {
    if (score < minScore) return;
    const existing = best.get(canonical);
    if (existing === undefined || score > existing) best.set(canonical, score);
  };

  const scoreAgainst = (candidate: string): number => {
    const parts = candidate
      .split("/")
      .map((p) => normalize(p))
      .filter(Boolean);
    let score = 0;
    for (const p of [normalize(candidate), ...parts]) {
      if (!p) continue;
      if (p === normV) score = Math.max(score, 1);
      else if (p.includes(normV) || normV.includes(p))
        score = Math.max(score, 0.9);
      else score = Math.max(score, similarity(p, normV));
    }
    return score;
  };

  for (const m of manufacturers) {
    if (m.toLowerCase() === "other") continue;
    consider(m, scoreAgainst(m));
  }
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (!manufacturers.includes(canonical)) continue;
    consider(canonical, scoreAgainst(alias));
  }

  return Array.from(best.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, score]) => ({ name, score }));
}
