import { describe, expect, it } from "vitest";
import { jobListSummary } from "../job-list-summary";

const row = { palletNumber: "P1", pbContentKg: null, estimatedWeightKg: "700",
  receiptReviewed: false, receiptConfirmed: false };

describe("job list weights and pallets", () => {
  it("shows unconfirmed Pb excluding the loading factor and counts distinct pallets", () => {
    expect(jobListSummary([row, { ...row, palletNumber: " p1 " }], "1.4")).toEqual({
      pbContentKgSum: "1000.000", weightConfirmed: false, palletCount: 1,
    });
  });
  it("keeps the whole estimate until every row has been reviewed", () => {
    expect(jobListSummary([{ ...row, receiptReviewed: true, receiptConfirmed: true, pbContentKg: "400" }, row], "1.4"))
      .toMatchObject({ pbContentKgSum: "900.000", weightConfirmed: false });
  });
  it("switches to received rows after review, excluding missing items", () => {
    expect(jobListSummary([{ ...row, receiptReviewed: true, receiptConfirmed: true, pbContentKg: "400" },
      { ...row, receiptReviewed: true, palletNumber: "P2" }], "1.4"))
      .toEqual({ pbContentKgSum: "400.000", weightConfirmed: true, palletCount: 2 });
  });
  it("shows zero when nothing was received", () => {
    expect(jobListSummary([{ ...row, receiptReviewed: true }], ".7").pbContentKgSum).toBe("0.000");
  });
  it("supports historical jobs with only tonnage and ignores blank pallet labels", () => {
    expect(jobListSummary([], ".7").pbContentKgSum).toBe("500.000");
    expect(jobListSummary([{ ...row, palletNumber: " " }], ".7").palletCount).toBe(0);
  });
});
