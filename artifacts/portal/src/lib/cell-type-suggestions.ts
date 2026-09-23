export interface CellModelLite {
  manufacturer: string;
  modelName: string;
  cellFamily?: string;
}

export interface CellTypeSuggestion {
  modelName: string;
  manufacturer: string;
  score: number;
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalizeVoltageInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const numericOnly = trimmed.match(/^(\d+)$/);
  if (!numericOnly) return trimmed.toUpperCase();
  return `${parseInt(numericOnly[1], 10)}V`;
}

export function isPositiveIntegerInput(value: string | number | null | undefined): boolean {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return false;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

export function parsePositiveWeightInput(
  value: string | number | null | undefined
): number | null {
  const text = String(value ?? "").trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isProvisionalLooseCellInput(input: {
  isLooseCells: boolean;
  looseCellsQty: string | number | null | undefined;
  estimatedWeightKg: string | number | null | undefined;
  weightManual: boolean;
  hasUnknownCellType: boolean;
}): boolean {
  return (
    input.isLooseCells &&
    input.weightManual &&
    input.hasUnknownCellType &&
    isPositiveIntegerInput(input.looseCellsQty) &&
    parsePositiveWeightInput(input.estimatedWeightKg) !== null
  );
}

// Reduce a normalized cell model to a "core" key that ignores manufacturer
// prefix letters before the standard family, so "4epzs460" and "4ipzs460"
// both reduce to "4pzs460" and match a typed "4 PzS 460".
export function coreKey(normalized: string): string {
  const m = normalized.match(/^(\d+)([a-z]+)(\d+.*)$/);
  if (!m) return normalized;
  const [, cells, letters, rest] = m;
  const pzIdx = letters.indexOf("pz");
  const family = pzIdx > 0 ? letters.slice(pzIdx) : letters;
  return `${cells}${family}${rest}`;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

// Catalogue manufacturers can be combined names ("Exide / GNB"), so treat it
// as a match when either name contains the other or they share a token.
export function manufacturerMatches(
  batteryMfr: string | null | undefined,
  catalogueMfr: string
): boolean {
  const mfr = (batteryMfr || "").trim().toLowerCase();
  if (!mfr || mfr === "unknown") return false;
  const c = catalogueMfr.toLowerCase();
  if (c === mfr || c.includes(mfr) || mfr.includes(c)) return true;
  const mfrTokens = mfr.split("/").map((t) => t.trim()).filter(Boolean);
  const cTokens = c.split("/").map((t) => t.trim()).filter(Boolean);
  return mfrTokens.some((t) => cTokens.includes(t));
}

export function selectPreferredCatalogueModel<T extends CellModelLite>(
  models: T[],
  manufacturer: string | null | undefined,
  cellModel: string
): T | undefined {
  const modelKey = coreKey(normalize(cellModel));
  const matches = models.filter(
    (model) => coreKey(normalize(model.modelName)) === modelKey
  );
  return (
    matches.find((model) => manufacturerMatches(manufacturer, model.manufacturer)) ||
    matches.find((model) => model.manufacturer.toLowerCase() === "tab")
  );
}

/**
 * Rank catalogue models against a typed cell type. Exact normalized matches
 * score 1, prefix-letter variants (PzS vs EPzS/IPzS) score 0.9, and fuzzy
 * matches use Levenshtein similarity. Models from the battery's manufacturer
 * are preferred, then TAB, then others. Deduped by model name.
 */
export function rankCellTypeSuggestions(
  typedValue: string,
  manufacturer: string | null | undefined,
  models: CellModelLite[],
  limit = 5,
  minScore = 0.72
): CellTypeSuggestion[] {
  const normV = normalize(typedValue || "");
  if (!normV) return [];
  const coreV = coreKey(normV);
  const isMfrMatch = (catalogueMfr: string): boolean =>
    manufacturerMatches(manufacturer, catalogueMfr);

  const byModel = new Map<string, CellTypeSuggestion & { mfrRank: number }>();

  for (const m of models) {
    const normM = normalize(m.modelName);
    if (!normM) continue;
    let score: number;
    if (normM === normV) {
      // Identical to typed value — not a useful suggestion by itself, but
      // still offer it (flag may be due to manufacturer mismatch).
      score = 1;
    } else if (coreKey(normM) === coreV) {
      score = 0.9;
    } else {
      score = similarity(normM, normV);
    }
    if (score < minScore) continue;

    const mfrRank = isMfrMatch(m.manufacturer)
      ? 0
      : m.manufacturer.toLowerCase() === "tab"
      ? 1
      : 2;

    const key = normM;
    const existing = byModel.get(key);
    if (
      !existing ||
      score > existing.score ||
      (score === existing.score && mfrRank < existing.mfrRank)
    ) {
      byModel.set(key, {
        modelName: m.modelName,
        manufacturer: m.manufacturer,
        score,
        mfrRank,
      });
    }
  }

  return Array.from(byModel.values())
    .sort((a, b) =>
      a.mfrRank !== b.mfrRank ? a.mfrRank - b.mfrRank : b.score - a.score
    )
    .slice(0, limit)
    .map(({ modelName, manufacturer: mf, score }) => ({
      modelName,
      manufacturer: mf,
      score,
    }));
}
