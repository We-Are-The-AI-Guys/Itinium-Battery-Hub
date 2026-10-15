import { describe, expect, it } from "vitest";
import { formatReportingNetWeight } from "./reporting-net-weight";

describe("net reporting display", () => {
  it.each([
    [null, "—"], [undefined, "—"], ["", "—"], ["invalid", "—"],
    ["0", "0"], ["0.001", "1"], ["4", "4,000"], ["1.234", "1,234"],
  ])("formats %s without any gross or financial fallback", (value, expected) => {
    expect(formatReportingNetWeight(value)).toBe(expected);
  });
});
