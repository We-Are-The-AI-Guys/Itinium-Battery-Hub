import { describe, expect, it } from "vitest";
import {
  calculateCblLmeValue,
  calculateCustomerLmeValue,
  calculateGrossProfit,
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
});