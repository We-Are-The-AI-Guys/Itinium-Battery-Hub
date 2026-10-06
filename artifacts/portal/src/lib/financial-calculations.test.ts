import { describe, expect, it } from "vitest";
import {
  calculateCblLmeValue,
  calculateCustomerLmeValue,
  calculateCustomerFinanceMasterValues,
  isCollectionLmeUsable,
  resolveCollectionLmeDate,
  calculateGrossProfit,
  calculateNetProfit,
  calculatePercentageRate,
  calculateReceiptValueGbp,
  calculateReceivedReceiptTotals,
  resolveCustomerLmePercent,
  calculateSectionInvoiceValue,
} from "./financial-calculations";

describe("existing financial calculations", () => {
  it("uses the CBL date when there is no confirmed collection date", () => {
    expect(resolveCollectionLmeDate(null, "2026-09-18")).toBe("2026-09-18");
    expect(resolveCollectionLmeDate("", "2026-09-18")).toBe("2026-09-18");
  });

  it("keeps confirmed collection dates authoritative", () => {
    expect(resolveCollectionLmeDate("2026-08-20", "2026-09-18")).toBe("2026-08-20");
    expect(resolveCollectionLmeDate("2026-08-20", null)).toBe("2026-08-20");
    expect(resolveCollectionLmeDate(null, null)).toBe("");
  });

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

  it("uses exact Pb kilograms for the invoice while displaying tonnes to three decimals", () => {
    expect(
      calculateCustomerFinanceMasterValues(14085.6, "496.02", "", "0", "", "")
    ).toEqual({
      tractionTonnage: "14.086",
      invoiceValue: "6986.74",
    });
  });

  it("excludes rejected and unreviewed rows from received totals", () => {
    expect(calculateReceivedReceiptTotals([
      {
        receiptConfirmed: true,
        receiptReviewed: true,
        estimatedWeightKg: "16239.900",
        pbContentKg: "16239.900",
        valueGbp: "7976.41",
      },
      {
        receiptConfirmed: false,
        receiptReviewed: true,
        estimatedWeightKg: "1878.560",
        pbContentKg: "1878.560",
        valueGbp: "922.69",
      },
      {
        receiptConfirmed: true,
        receiptReviewed: false,
        estimatedWeightKg: "500.000",
        pbContentKg: "500.000",
        valueGbp: "245.58",
      },
    ])).toEqual({
      weightKg: 16239.9,
      pbKg: 16239.9,
      valueGbp: 7976.41,
    });
  });

  it("does not reuse the previous month's price immediately after the collection date changes", () => {
    expect(
      isCollectionLmeUsable(
        "ready",
        true,
        "2026-08-15",
        "2026-09-10",
        "2026-09-10"
      )
    ).toBe(false);
    expect(
      isCollectionLmeUsable(
        "ready",
        true,
        "2026-09-10",
        "2026-09-10",
        "2026-09-10"
      )
    ).toBe(true);
  });
});

describe("financial master log calculations", () => {
  it("calculates a percentage rate from the relevant LME rate", () => {
    expect(calculatePercentageRate("2000", "39")).toBe("780.00");
  });

  it("combines traction and blocs values then deducts section costs", () => {
    expect(calculateSectionInvoiceValue("2", "780", "1", "500", "100", "60")).toBe("1900.00");
  });

  it("calculates the current Waste Collector invoice without a blocs contribution", () => {
    expect(calculateSectionInvoiceValue("2", "780", "", "", "100", "60")).toBe("1400.00");
  });

  it("calculates net profit as waste invoice less customer invoice", () => {
    expect(calculateNetProfit("5000", "4200")).toBe("800.00");
  });
});