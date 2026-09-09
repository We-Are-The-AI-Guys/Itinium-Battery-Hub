import { describe, expect, it } from "vitest";
import {
  calculateCblLmeValue,
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
});