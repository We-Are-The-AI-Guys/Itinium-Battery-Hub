import { describe, expect, it } from "vitest";
import { averageGbpPrice, previousCalendarMonth } from "../lme";

describe("previous-month LME average", () => {
  it("uses the previous calendar month across a year boundary", () => {
    expect(previousCalendarMonth(new Date("2026-01-15T12:00:00Z"))).toEqual({
      startDate: "2025-12-01",
      endDate: "2026-01-01",
      label: "December 2025",
    });
  });

  it("averages all finite stored GBP prices to two decimal places", () => {
    expect(averageGbpPrice([
      { gbpPrice: "1700.10" },
      { gbpPrice: "1800.20" },
      { gbpPrice: "1900.30" },
    ])).toBe("1800.20");
  });

  it("returns unavailable when the prior month has no valid history", () => {
    expect(averageGbpPrice([])).toBeNull();
    expect(averageGbpPrice([{ gbpPrice: Number.NaN }])).toBeNull();
  });
});