/** Job collection tonnage is stored in tonnes; dashboard tables display kg. */
export function formatGrossWeightKg(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === "" || !Number.isFinite(Number(value))) return "—";
  return (Number(value) * 1000).toLocaleString("en-GB", { maximumFractionDigits: 3 });
}
