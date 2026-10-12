/** Inclusive user dates become a half-open UTC date interval for SQL. */
export function kpiDateRange(from?: string, to?: string, now = new Date()) {
  function parse(value: string | undefined, end: boolean): Date {
    if (!value) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (end ? 1 : -5), 1));
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(value)) throw new Error("Use YYYY-MM-DD dates");
    const [year, month, day = 1] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Invalid date");
    if (end) {
      if (value.length === 7) date.setUTCMonth(date.getUTCMonth() + 1);
      else date.setUTCDate(date.getUTCDate() + 1);
    }
    return date;
  }
  const fromDate = parse(from, false), toDate = parse(to, true);
  if (fromDate >= toDate) throw new Error("Start date must not be after end date");
  return { fromDate, toDate };
}

/** Allowlist public metrics so internal values never enter customer charts or exports. */
export function publicKpiRow<T extends { jobCount: number; tonnage: number; invoiceValue: number; avgDaysToPay: number; month?: string }>(row: T) {
  return {
    ...(row.month !== undefined ? { month: row.month } : {}),
    jobCount: row.jobCount, tonnage: row.tonnage,
    invoiceValue: row.invoiceValue, avgDaysToPay: row.avgDaysToPay,
  };
}
