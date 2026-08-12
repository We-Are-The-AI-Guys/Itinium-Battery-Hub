import { describe, it, expect } from "vitest";
import {
  canUploadDocuments,
  signUploadIntent,
  verifyUploadIntent,
  type UploadIntent,
} from "../job-documents";

const SECRET = "test-secret";

function intent(overrides: Partial<UploadIntent> = {}): UploadIntent {
  return {
    jobId: 42,
    userId: 7,
    docType: "statement",
    objectPath: "/objects/uploads/abc-123",
    contentType: "application/pdf",
    size: 1234,
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

describe("canUploadDocuments", () => {
  const today = "2026-08-12";

  it("blocks uploads before the collection has been carried out", () => {
    expect(canUploadDocuments({ scheduleStatus: "unassigned", status: "request", collectionDate: null }, today)).toBe(false);
    expect(canUploadDocuments({ scheduleStatus: "proposed", status: "request", collectionDate: "2026-08-20" }, today)).toBe(false);
    // Confirmed but the collection date is still in the future.
    expect(canUploadDocuments({ scheduleStatus: "confirmed", status: "confirmed", collectionDate: "2026-08-20" }, today)).toBe(false);
    // Confirmed schedule but no date at all.
    expect(canUploadDocuments({ scheduleStatus: "confirmed", status: "confirmed", collectionDate: null }, today)).toBe(false);
  });

  it("allows uploads once the confirmed collection date has arrived", () => {
    expect(canUploadDocuments({ scheduleStatus: "confirmed", status: "confirmed", collectionDate: "2026-08-12" }, today)).toBe(true);
    expect(canUploadDocuments({ scheduleStatus: "confirmed", status: "confirmed", collectionDate: "2026-08-01" }, today)).toBe(true);
  });

  it("allows uploads for jobs already past collection regardless of schedule state", () => {
    for (const status of ["received", "awaiting_invoice", "invoice", "completed"]) {
      expect(canUploadDocuments({ scheduleStatus: "unassigned", status, collectionDate: null }, today)).toBe(true);
    }
  });
});

describe("upload intent tokens", () => {
  it("round-trips a valid intent", () => {
    const i = intent();
    expect(verifyUploadIntent(signUploadIntent(i, SECRET), SECRET)).toEqual(i);
  });

  it("rejects a tampered payload (object path substitution)", () => {
    const token = signUploadIntent(intent(), SECRET);
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify(intent({ objectPath: "/objects/uploads/other-object" }))
    ).toString("base64url");
    expect(verifyUploadIntent(`${forgedBody}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    expect(verifyUploadIntent(signUploadIntent(intent(), "other-secret"), SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = intent({ exp: Math.floor(Date.now() / 1000) - 10 });
    expect(verifyUploadIntent(signUploadIntent(expired, SECRET), SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUploadIntent("not-a-token", SECRET)).toBeNull();
    expect(verifyUploadIntent("a.b", SECRET)).toBeNull();
    expect(verifyUploadIntent("", SECRET)).toBeNull();
  });
});
