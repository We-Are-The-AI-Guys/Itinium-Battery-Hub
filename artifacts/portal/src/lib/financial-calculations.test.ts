import { describe, expect, it } from "vitest";
import {
  calculateCblLmeValue,
  calculateCustomerLmeValue,
  calculateGrossProfit,
  calculateNetProfit,
  calculatePercentageRate,
  calculateReceiptValueGbp,
  resolveCustomerLmePercent,
  calculateSectionInvoiceValue,
} from "./financial-calculations";

describe("existing financial calculations", () => {
  it("keeps the existing CBL LME calculation", () => {
    expect(calculateCblLmeValue("10", "1800", "75")).toBe("13500.00");
  });

  it("keeps the existing gross-profit calculation", () => {
    expect(calculateGrossProfit("20000", "1000", "13500")).toBe("5500.00");
  });

  it("continues treating blank inputs as zero", () => {
    expect(calculateCblLmeValue("", "", "")).toBe("0.00");
    expect(calculateGrossProfit("", "", "")).toBe("0.00");
  });

  it("calculates the customer payment from net Pb weight and the chosen LME percentage", () => {
    expect(calculateCustomerLmeValue(2500, "1800", "80")).toBe("3600.00");
  });

  it("converts net Pb kilograms to tonnes before applying the LME rate", () => {
    expect(calculateCustomerLmeValue(500, "2000", "75")).toBe("750.00");
  });

  it("applies Customer %LME to each receipt row without changing its Pb input", () => {
    const pbContentKg = 253.2;
    expect(calculateReceiptValueGbp(pbContentKg, 1364.81, "80")?.toFixed(2)).toBe("276.46");
    expect(calculateReceiptValueGbp(pbContentKg, 1364.81, "100")?.toFixed(2)).toBe("345.57");
    expect(calculateReceiptValueGbp(pbContentKg, 1364.81, "72.5")?.toFixed(2)).toBe("250.54");
    expect(calculateReceiptValueGbp(pbContentKg, 1364.81, "")?.toFixed(2)).toBe("0.00");
    expect(pbContentKg).toBe(253.2);
  });

  it("uses the visible traction percentage before the legacy customer percentage", () => {
    expect(resolveCustomerLmePercent("75", "80")).toBe("75");
    expect(resolveCustomerLmePercent("", "80")).toBe("80");
  });
});

describe("financial master log calculations", () => {
  it("calculates a percentage rate from the relevant LME rate", () => {
    expect(calculatePercentageRate("2000", "39")).toBe("780.00");
  });

  it("combines traction and blocs values then deducts section costs", () => {
    expect(calculateSectionInvoiceValue("2", "780", "1", "500", "100", "60")).toBe("1900.00");
  });

  it("calculates net profit as waste invoice less customer invoice", () => {
    expect(calculateNetProfit("5000", "4200")).toBe("800.00");
  });
});