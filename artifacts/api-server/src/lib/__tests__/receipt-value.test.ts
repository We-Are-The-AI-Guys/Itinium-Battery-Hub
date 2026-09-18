import { describe, expect, it } from "vitest";
import {
  calculateReceiptValueGbp,
  isAutomaticReceiptValue,
  resolveCustomerLmePercent,
  resolvePreviousReceiptLmeRate,
} from "../receipt-value";

describe("calculateReceiptValueGbp", () => {
  it("applies the customer LME percentage to the full row value", () => {
    expect(calculateReceiptValueGbp("253.200", "1364.81", "80")).toBe("276.46");
  });

  it("keeps the full value at 100 percent", () => {
    expect(calculateReceiptValueGbp(253.2, 1364.81, 100)).toBe("345.57");
  });

  it("supports fractional, zero, and missing percentages", () => {
    expect(calculateReceiptValueGbp(253.2, 1364.81, "72.5")).toBe("250.54");
    expect(calculateReceiptValueGbp(253.2, 1364.81, "0")).toBe("0.00");
    expect(calculateReceiptValueGbp(253.2, 1364.81, null)).toBe("0.00");
  });

  it("rejects invalid Pb or LME inputs", () => {
    expect(calculateReceiptValueGbp(null, 1364.81, 80)).toBeNull();
    expect(calculateReceiptValueGbp(253.2, null, 80)).toBeNull();
    expect(calculateReceiptValueGbp("bad", 1364.81, 80)).toBeNull();
  });

  it("uses the visible traction percentage before the legacy percentage", () => {
    expect(resolveCustomerLmePercent("75", "80")).toBe("75");
    expect(resolveCustomerLmePercent(null, "80")).toBe("80");
  });

  it("recognises current and legacy automatic values without treating manual values as automatic", () => {
    expect(isAutomaticReceiptValue("276.46", "253.2", "1364.81", "80")).toBe(true);
    expect(isAutomaticReceiptValue("345.57", "253.2", "1364.81", "80")).toBe(true);
    expect(isAutomaticReceiptValue("300.00", "253.2", "1364.81", "80")).toBe(false);
  });

  it("uses the historical job rate before today's latest price when classifying old values", () => {
    const previousRate = resolvePreviousReceiptLmeRate(null, "1200", "1400");
    expect(previousRate).toBe("1200");
    expect(isAutomaticReceiptValue("303.84", "253.2", previousRate, "100")).toBe(true);
    expect(isAutomaticReceiptValue("303.84", "253.2", "1400", "100")).toBe(false);
  });
});