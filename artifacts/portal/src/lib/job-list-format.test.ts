import { describe, expect, it } from "vitest";
import { formatPbKg } from "./job-list-format";

describe("formatPbKg", () => {
  it("formats summed Pb kilograms for the jobs list", () => {
    expect(formatPbKg("253.2")).toBe("253.20 kg");
    expect(formatPbKg("1250.75")).toBe("1,250.75 kg");
  });

  it("shows an empty value when Pb content is unavailable", () => {
    expect(formatPbKg(null)).toBe("—");
    expect(formatPbKg("")).toBe("—");
    expect(formatPbKg("not-a-number")).toBe("—");
  });
});