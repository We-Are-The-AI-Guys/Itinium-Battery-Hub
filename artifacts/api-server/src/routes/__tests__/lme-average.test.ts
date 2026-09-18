import { describe, expect, it } from "vitest";
import {
  averageGbpPrice,
  collectionMonthStart,
  isValidIsoDate,
  previousCalendarMonth,
} from "../lme";

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

describe("effective LME date", () => {
  it("accepts real ISO collection dates", () => {
    expect(isValidIsoDate("2026-09-01")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it("limits the lookup to the collection month", () => {
    expect(collectionMonthStart("2026-09-18")).toBe("2026-09-01");
    expect(collectionMonthStart("2027-01-04")).toBe("2027-01-01");
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidIsoDate("01-09-2026")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });
});