import { describe, expect, it } from "vitest";
import { kpiDateRange, publicKpiRow } from "../kpi-policy";

describe("KPI date ranges", () => {
  it("includes both days without expanding to whole months", () => {
    const range = kpiDateRange("2026-10-06", "2026-10-12");
    expect(range.fromDate.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(range.toDate.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });
  it("preserves month-based preset ranges", () => {
    expect(kpiDateRange("2026-01", "2026-10").toDate.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("allows one day and leap days", () => {
    expect(kpiDateRange("2028-02-29", "2028-02-29").toDate.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });
  it.each([["2026-02-29", "2026-03-02"], ["2026-10-13", "2026-10-12"], ["wrong", "2026-10-12"]])(
    "rejects invalid range %s to %s", (from, to) => expect(() => kpiDateRange(from, to)).toThrow());
  it("omits all internal fields, not just their visible labels", () => {
    expect(publicKpiRow({ month: "2026-10", jobCount: 1, tonnage: 2, invoiceValue: 3, avgDaysToPay: 4,
      grossProfit: 99, grossMarginPct: 99, overdueCount: 99, overdueValue: 99, avgCblLmePct: 99,
    })).toEqual({ month: "2026-10", jobCount: 1, tonnage: 2, invoiceValue: 3, avgDaysToPay: 4 });
  });
});
