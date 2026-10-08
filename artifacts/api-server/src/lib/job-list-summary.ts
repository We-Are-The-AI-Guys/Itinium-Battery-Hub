import type { JobBattery } from "@workspace/db/schema";

type Row = Pick<JobBattery, "palletNumber" | "pbContentKg" | "estimatedWeightKg" | "receiptReviewed" | "receiptConfirmed">;

export function jobListSummary(rows: readonly Row[], tonnage: string) {
  const weightConfirmed = rows.length > 0 && rows.every(row => row.receiptReviewed);
  const included = weightConfirmed ? rows.filter(row => row.receiptConfirmed) : rows;
  // Pb excludes the 1.4 safe-loading factor used by collection weight.
  const weights = included.map(row => {
    if (row.pbContentKg != null && Number.isFinite(Number(row.pbContentKg))) return Number(row.pbContentKg);
    if (row.estimatedWeightKg != null && Number.isFinite(Number(row.estimatedWeightKg))) return Number(row.estimatedWeightKg) / 1.4;
    return null;
  });
  const known = weights.filter((weight): weight is number => weight !== null);
  const fallback = Number(tonnage) * 1000 / 1.4;
  const pb = known.length ? known.reduce((sum, weight) => sum + weight, 0)
    : weightConfirmed && !included.length ? 0
    : !weightConfirmed && Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  return {
    pbContentKgSum: pb === null ? null : pb.toFixed(3),
    weightConfirmed,
    palletCount: new Set(rows.map(row => row.palletNumber?.trim().toLowerCase()).filter(Boolean)).size,
  };
}
