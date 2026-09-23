import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calculateReceiptValue,
  calculateReceivedReceiptTotals,
  generateAccountsCompletionPdf,
  generateClientReceiptPdf,
  getDeliveryTargets,
  isReceiptReviewComplete,
  selectClientReceiptRecipients,
  type ReceiptItemSnapshot,
} from "../../lib/receipt-documents";

const tempDirs: string[] = [];

const items: ReceiptItemSnapshot[] = [
  {
    palletNumber: "P-001",
    assetNumber: "ASSET-SECRET",
    batterySerial: "SERIAL-SECRET",
    manufacture: "Test Cells",
    cellType: "5 EPzS 700",
    voltage: "48V",
    looseCellsQty: null,
    receiptConfirmed: true,
    adminNotes: "Case intact",
    valueGbp: "123.45",
    receiptReviewed: true,
  },
  {
    palletNumber: "P-002",
    assetNumber: null,
    batterySerial: null,
    manufacture: "Test Cells",
    cellType: "4 PzS 500",
    voltage: "24V",
    looseCellsQty: null,
    receiptConfirmed: false,
    adminNotes: "Not presented",
    valueGbp: "76.55",
    receiptReviewed: true,
  },
];

const job = {
  reference: "JOB-TEST-001",
  clientName: "Example Client",
  depot: "North Depot",
  collectionPoint: "Loading bay",
  collectionDate: "2026-09-09",
};

function pdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "receipt-pdf-"));
  tempDirs.push(dir);
  const pdfPath = join(dir, "document.pdf");
  const textPath = join(dir, "document.txt");
  writeFileSync(pdfPath, pdf);
  execFileSync("pdftotext", [pdfPath, textPath]);
  return readFileSync(textPath, "utf8");
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("completed receipt documents", () => {
  it("requires an explicit review decision for every item", () => {
    expect(isReceiptReviewComplete(items)).toBe(true);
    expect(isReceiptReviewComplete([{ ...items[0], receiptReviewed: false }])).toBe(false);
    expect(isReceiptReviewComplete([])).toBe(false);
  });

  it("snapshots only explicitly received item values", () => {
    expect(calculateReceiptValue(items)).toBe("123.45");
  });

  it("matches the reported received weight and invoice value", () => {
    expect(calculateReceivedReceiptTotals([
      {
        ...items[0],
        estimatedWeightKg: "16239.900",
        pbContentKg: "16239.900",
        valueGbp: "7976.41",
      },
      {
        ...items[1],
        estimatedWeightKg: "1878.560",
        pbContentKg: "1878.560",
        valueGbp: "922.69",
      },
      {
        ...items[0],
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

  it("prefers a job location, then depot, then client-wide team leaders", () => {
    const recipients = [
      { id: 1, email: "one@example.com", fullName: "One", locationId: 10, depot: "North Depot" },
      { id: 2, email: "two@example.com", fullName: "Two", locationId: 20, depot: "South Depot" },
      { id: 3, email: "three@example.com", fullName: "Three", locationId: null, depot: null },
    ];
    expect(selectClientReceiptRecipients(recipients, 20, "North Depot").map((item) => item.id)).toEqual([2]);
    expect(selectClientReceiptRecipients(recipients, 99, "north depot").map((item) => item.id)).toEqual([1]);
    expect(selectClientReceiptRecipients(recipients, 99, "Other").map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("retries only a failed group and resends both after full success", () => {
    expect(getDeliveryTargets("sent", "failed", false)).toEqual({ sendClient: false, sendAccounts: true });
    expect(getDeliveryTargets("sent", "sent", true)).toEqual({ sendClient: true, sendAccounts: true });
  });

  it("keeps weights, Pb and money out of the client receipt", async () => {
    const text = pdfText(await generateClientReceiptPdf(job, items));
    expect(text).toContain("SERIAL-SECRET");
    expect(text).toContain("Case intact");
    expect(text).toContain("Yes");
    expect(text).toContain("No");
    expect(text).not.toContain("123.45");
    expect(text).not.toMatch(/\bPb\b/);
    expect(text).not.toMatch(/\bweight/i);
  });

  it("keeps item identities and notes out of the accounts document", async () => {
    const text = pdfText(await generateAccountsCompletionPdf(job, "200.00"));
    expect(text).toContain("JOB-TEST-001");
    expect(text).toContain("£200.00");
    expect(text).not.toContain("SERIAL-SECRET");
    expect(text).not.toContain("Case intact");
    expect(text).not.toMatch(/\bweight/i);
    expect(text).not.toMatch(/\bPb\b/);
  });
});