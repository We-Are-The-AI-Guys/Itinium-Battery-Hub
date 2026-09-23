import { describe, expect, it } from "vitest";
import {
  getJobNextStep,
  isBackwardJobStatusChange,
  JOB_STATUS_JOURNEY,
  type JobStatusContext,
} from "./job-status";

const completeContext: JobStatusContext = {
  status: "invoice",
  scheduleStatus: "confirmed",
  invoiceReceivedDate: "2026-09-10",
  invoiceStatus: "invoiced",
  datePaid: null,
  receiptClientDeliveryStatus: "sent",
  receiptAccountsDeliveryStatus: "sent",
  remainingReviewCount: 0,
};

describe("job status journey", () => {
  it("shows the agreed stages in order", () => {
    expect(JOB_STATUS_JOURNEY).toEqual([
      "request",
      "confirmed",
      "received",
      "invoice",
      "awaiting_invoice",
      "completed",
    ]);
  });

  it.each([
    [{ ...completeContext, scheduleStatus: "proposed" }, "Confirm the collection schedule"],
    [{ ...completeContext, remainingReviewCount: 2 }, "Review the remaining 2 battery items."],
    [{ ...completeContext, receiptClientDeliveryStatus: "failed" }, "Preview the recipients"],
    [{ ...completeContext, invoiceReceivedDate: null, invoiceStatus: "pending_invoice" }, "Record the received invoice"],
    [completeContext, "Enter the paid date"],
    [{ ...completeContext, status: "completed", datePaid: "2026-09-17" }, "No further action"],
  ])("describes the next incomplete milestone", (context, expected) => {
    expect(getJobNextStep(context as JobStatusContext)).toContain(expected);
  });

  it("identifies backward manual overrides that need confirmation", () => {
    expect(isBackwardJobStatusChange("invoice", "received")).toBe(true);
    expect(isBackwardJobStatusChange("received", "invoice")).toBe(false);
    expect(isBackwardJobStatusChange("received", "received")).toBe(false);
  });
});