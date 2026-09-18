export function formatPbKg(value: string | null) {
  if (!value) return "—";
  const kilograms = parseFloat(value);
  if (!Number.isFinite(kilograms)) return "—";
  return `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kilograms)} kg`;
}