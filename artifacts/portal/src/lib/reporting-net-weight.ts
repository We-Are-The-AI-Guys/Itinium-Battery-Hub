export function formatReportingNetWeight(value: string | null | undefined): string {
  if (value == null || value.trim() === "" || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(3)}t`;
}
