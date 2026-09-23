import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import {
  drawRawCollectionTable,
  rawCollectionNote,
  type RawCollectionItem,
} from "../raw-collection-table";
import { createBrandedDoc } from "../pdf-branding";

function collectPdf(items: RawCollectionItem[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { doc, finalize } = createBrandedDoc(
      "Collection Sheet — TEST",
      "Example Client | North Depot",
      { layout: "landscape" }
    );
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(14).text("Collection Sheet");
    doc.moveDown();
    drawRawCollectionTable(doc, items, {
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
    const marker = source.indexOf("stream\n", searchFrom);
    if (marker < 0) break;
    const start = marker + "stream\n".length;
    const end = source.indexOf("endstream", start);
    if (end < 0) break;
    let compressed = pdf.subarray(start, end);
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
    searchFrom = end + "endstream".length;
  }

  return textBlocks.join(" ");
}

const baseItem: RawCollectionItem = {
  palletNumber: "P-001",
  assetNumber: "ASSET-1",
  batterySerial: "SERIAL-1",
  manufacture: "Test Cells",
  cellType: "5 EPzS 700",
  voltage: "48V",
  isLooseCells: false,
  looseCellsQty: null,
  notes: "Keep pallet upright",
};

describe("raw collection table", () => {
  it("prints the saved row note", async () => {
    const text = pdfText(await collectPdf([baseItem])).replace(/\s+/g, " ");
    for (const word of ["Keep", "pallet", "upright"]) {
      expect(text).toContain(word);
    }
  });

  it.each([null, "", "   "])("keeps blank notes empty (%s)", (value) => {
    expect(rawCollectionNote(value)).toBeNull();
  });

  it("prints every token of a long note across branded pages and repeats the header", async () => {
    const longNote = Array.from({ length: 240 }, (_, index) =>
      `loading${String(index + 1).padStart(3, "0")}`
    ).join(" ");
    const text = pdfText(await collectPdf([{ ...baseItem, notes: longNote }]));
    const normalised = text.replace(/\s+/g, " ");

    for (const token of longNote.split(" ")) {
      expect(normalised).toContain(token);
    }
    expect((text.match(/Loose Qty/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(normalised).toContain("continued");
  });
});