import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import {
  drawConfirmedCollectionTable,
  getConfirmedReceiptLabel,
  type ConfirmedCollectionItem,
} from "../confirmed-collection-table";
import { createBrandedDoc } from "../pdf-branding";

function collectPdf(items: ConfirmedCollectionItem[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { doc, finalize } = createBrandedDoc(
      "Confirmed Collection Sheet — TEST",
      "Example Client | North Depot",
      { layout: "landscape" }
    );
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(14).text("Confirmed Collection Sheet");
    doc.moveDown();
    drawConfirmedCollectionTable(doc, items, {
      contentWidth: doc.page.width - 80,
    });
    finalize();
  });
}

function pdfText(pdf: Buffer): string {
  const source = pdf.toString("latin1");
  const textBlocks: string[] = [];
  let searchFrom = 0;

  while (true) {
    const streamMarker = source.indexOf("stream\n", searchFrom);
    if (streamMarker < 0) break;
    const streamStart = streamMarker + "stream\n".length;
    const streamEnd = source.indexOf("endstream", streamStart);
    if (streamEnd < 0) break;
    let compressed = pdf.subarray(streamStart, streamEnd);
    if (compressed.at(-1) === 10) compressed = compressed.subarray(0, -1);
    try {
      const content = inflateSync(compressed).toString("latin1");
      for (const textObject of content.matchAll(/BT([\s\S]*?)ET/g)) {
        const fragments = [...textObject[1].matchAll(/<([0-9a-f]+)>/gi)]
          .map((match) => Buffer.from(match[1], "hex").toString("latin1"));
        if (fragments.length) textBlocks.push(fragments.join(""));
      }
    } catch {
      // Image and metadata streams are not text streams.
    }
    searchFrom = streamEnd + "endstream".length;
  }

  return textBlocks.join(" ");
}

const baseItem: ConfirmedCollectionItem = {
  palletNumber: "P-001",
  assetNumber: "ASSET-1",
  batterySerial: "SERIAL-1",
  manufacture: "Test Cells",
  cellType: "5 EPzS 700",
  voltage: "48V",
  isLooseCells: false,
  looseCellsQty: null,
  receiptConfirmed: true,
  receiptReviewed: true,
  adminNotes: "Receipt note printed",
  notes: "Original note",
};

describe("confirmed collection table", () => {
  it("uses landscape A4 dimensions", () => {
    const { doc, finalize } = createBrandedDoc(
      "Confirmed Collection Sheet — TEST",
      "Example Client | North Depot",
      { layout: "landscape" }
    );
    expect(doc.page.width).toBeGreaterThan(doc.page.height);
    finalize();
  });

  it("maps the saved review truth table to an unambiguous label", () => {
    expect(getConfirmedReceiptLabel({ receiptReviewed: true, receiptConfirmed: true })).toBe("Yes");
    expect(getConfirmedReceiptLabel({ receiptReviewed: true, receiptConfirmed: false })).toBe("No");
    expect(getConfirmedReceiptLabel({ receiptReviewed: true, receiptConfirmed: null })).toBe("No");
    expect(getConfirmedReceiptLabel({ receiptReviewed: false, receiptConfirmed: true })).toBe("Pending");
    expect(getConfirmedReceiptLabel({ receiptReviewed: null, receiptConfirmed: false })).toBe("Pending");
  });

  it("prints received, rejected, and unreviewed states with saved notes", async () => {
    const text = pdfText(await collectPdf([
      baseItem,
      {
        ...baseItem,
        palletNumber: "P-002",
        receiptConfirmed: false,
        adminNotes: "Not presented for collection",
      },
      {
        ...baseItem,
        palletNumber: "P-003",
        receiptConfirmed: null,
        receiptReviewed: false,
        adminNotes: null,
        notes: "Use original line item note",
      },
    ]));
    const normalisedText = text.replace(/\s+/g, " ");

    expect(normalisedText).toContain("Yes");
    expect(normalisedText).toContain("No");
    expect(normalisedText).toContain("Pending");
    expect(normalisedText).toContain("Receipt note printed");
    expect(normalisedText).toContain("Not presented for collection");
    expect(normalisedText).toContain("Use original line item note");
  });

  it("prefers receipt notes over original notes", async () => {
    const text = pdfText(await collectPdf([baseItem]));
    expect(text).toContain("Receipt note printed");
    expect(text).not.toContain("Original note");
  });

  it("uses the original note when the receipt note is whitespace", async () => {
    const text = pdfText(await collectPdf([{
      ...baseItem,
      adminNotes: "   ",
      notes: "Fallback note is preserved",
    }]));
    const normalisedText = text.replace(/\s+/g, " ");
    for (const word of ["Fallback", "note", "is", "preserved"]) {
      expect(normalisedText).toContain(word);
    }
  });

  it("prints every word of long notes across pages and repeats the header", async () => {
    const longNote = Array.from({ length: 220 }, (_, index) =>
      `detail${String(index + 1).padStart(3, "0")}`
    ).join(" ");
    const text = pdfText(await collectPdf([{
      ...baseItem,
      palletNumber: "LONG-NOTE-PALLET",
      adminNotes: longNote,
    }]));
    const normalisedText = text.replace(/\s+/g, " ");

    for (const token of longNote.split(" ")) {
      expect(normalisedText).toContain(token);
    }
    expect((text.match(/Received/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(normalisedText).toContain("LONG- NOTE- PALLET");
    expect(normalisedText).toContain("Yes");
    expect(normalisedText).toContain("continued");
  });

  it("splits a long unbroken note without losing content", async () => {
    const longToken = "X".repeat(1800);
    const text = pdfText(await collectPdf([{
      ...baseItem,
      adminNotes: longToken,
    }]));
    const extractedToken = text.replace(/[^X]/g, "");
    expect(extractedToken).toBe(longToken);
  });
});