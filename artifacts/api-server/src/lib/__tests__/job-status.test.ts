import { describe, expect, it } from "vitest";
import {
  advanceJobStatus,
  canUpdateInvoiceMilestones,
  isJobStatus,
  JOB_STATUSES,
} from "../job-status";

describe("job status progression", () => {
  it("uses the agreed canonical workflow order", () => {
    expect(JOB_STATUSES).toEqual([
      "request",
      "confirmed",
      "received",
      "invoice",
      "awaiting_invoice",
      "completed",
    ]);
  });

  it.each([
    ["request", "confirmed", "confirmed"],
    ["confirmed", "received", "received"],
    ["received", "invoice", "invoice"],
    ["invoice", "awaiting_invoice", "awaiting_invoice"],
    ["awaiting_invoice", "completed", "completed"],
  ] as const)("advances %s to %s", (current, target, expected) => {
    expect(advanceJobStatus(current, target)).toBe(expected);
  });

  it("can skip earlier milestones when a later milestone is completed", () => {
    expect(advanceJobStatus("request", "invoice")).toBe("invoice");
    expect(advanceJobStatus("confirmed", "completed")).toBe("completed");
  });

  it("is idempotent and never moves a job backwards automatically", () => {
    expect(advanceJobStatus("received", "received")).toBe("received");
    expect(advanceJobStatus("completed", "confirmed")).toBe("completed");
    expect(advanceJobStatus("awaiting_invoice", "invoice")).toBe("awaiting_invoice");
  });

  it("recognises only canonical status values", () => {
    expect(isJobStatus("awaiting_invoice")).toBe(true);
    expect(isJobStatus("pending")).toBe(false);
  });

  it("restricts invoice milestones to accounts and head office admins", () => {
    expect(canUpdateInvoiceMilestones("accounts")).toBe(true);
    expect(canUpdateInvoiceMilestones("head_office_admin")).toBe(true);
    expect(canUpdateInvoiceMilestones("team_leader")).toBe(false);
    expect(canUpdateInvoiceMilestones("collection_company")).toBe(false);
  });
});