/** Saved Customer financial values only; never substitute collector weights. */
export function formatCustomerPbWeight(traction: string | null | undefined, blocs: string | null | undefined): string {
  const supplied = [traction, blocs].filter((value): value is string => value != null && value.trim() !== "");
  if (!supplied.length) return "—";
  const values = supplied.map(Number);
  if (values.some(value => !Number.isFinite(value))) return "—";
  return `${values.reduce((sum, value) => sum + value, 0).toFixed(3)}t`;
}
