export function formatReportingNetWeight(value: string | null | undefined): string {
  if (value == null || value.trim() === "" || !Number.isFinite(Number(value))) return "—";
  return (Number(value) * 1000).toLocaleString("en-GB", { maximumFractionDigits: 3 });
}
