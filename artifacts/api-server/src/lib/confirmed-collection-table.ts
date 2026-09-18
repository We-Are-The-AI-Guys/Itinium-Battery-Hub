export interface ConfirmedCollectionItem {
  palletNumber: string | null;
  assetNumber: string | null;
  batterySerial: string | null;
  manufacture: string | null;
  cellType: string | null;
  voltage: string | null;
  isLooseCells: boolean | null;
  looseCellsQty: number | null;
  receiptConfirmed: boolean | null;
  receiptReviewed: boolean | null;
  adminNotes: string | null;
  notes: string | null;
}

const columns = [
  { label: "Pallet", x: 40, w: 44 },
  { label: "Asset", x: 88, w: 56 },
  { label: "Serial", x: 148, w: 62 },
  { label: "Manufacturer", x: 214, w: 70 },
  { label: "Cell Type", x: 288, w: 66 },
  { label: "Voltage", x: 358, w: 30 },
  { label: "Loose Qty", x: 392, w: 34, align: "right" as const },
  { label: "Received", x: 432, w: 42, align: "center" as const },
  { label: "Notes", x: 480, w: 75 },
];

function drawHeader(doc: PDFKit.PDFDocument, contentWidth: number, navy: string) {
  const y = doc.y;
  doc.rect(40, y - 4, contentWidth, 22).fill("#f1f5f9");
  doc.fontSize(8.5).fillColor(navy).font("Helvetica-Bold");
  for (const column of columns) {
    doc.text(column.label, column.x, y + 2, {
      width: column.w,
      align: column.align,
      lineBreak: false,
    });
  }
  doc.y = y + 22;
  doc.font("Helvetica").fillColor("#1e293b");
}

export function getConfirmedReceiptLabel(
  item: Pick<ConfirmedCollectionItem, "receiptConfirmed" | "receiptReviewed">
): "Yes" | "No" | "Pending" {
  if (item.receiptReviewed !== true) return "Pending";
  return item.receiptConfirmed === true ? "Yes" : "No";
}

function drawReceiptMark(
  doc: PDFKit.PDFDocument,
  item: ConfirmedCollectionItem,
  y: number
) {
  const column = columns[7];
  const boxX = column.x + 1;
  const boxY = y + 1;
  const boxSize = 10;
  const label = getConfirmedReceiptLabel(item);
  const reviewed = label !== "Pending";
  const received = label === "Yes";

  doc.rect(boxX, boxY, boxSize, boxSize)
    .strokeColor(reviewed ? "#475569" : "#cbd5e1")
    .lineWidth(0.7)
    .stroke();

  if (received) {
    doc.moveTo(boxX + 2, boxY + 5)
      .lineTo(boxX + 4.5, boxY + 8)
      .lineTo(boxX + 8.5, boxY + 2)
      .strokeColor("#15803d")
      .lineWidth(1.3)
      .stroke();
  } else if (reviewed) {
    doc.moveTo(boxX + 2, boxY + 2)
      .lineTo(boxX + 8, boxY + 8)
      .moveTo(boxX + 8, boxY + 2)
      .lineTo(boxX + 2, boxY + 8)
      .strokeColor("#b91c1c")
      .lineWidth(1.1)
      .stroke();
  }

  doc.font("Helvetica").fontSize(reviewed ? 6.5 : 5.5)
    .fillColor(reviewed ? "#334155" : "#64748b")
    .text(label, boxX + 13, y + 2, {
      width: column.w - 14,
      lineBreak: false,
    });
}

function takeTextChunk(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  maximumHeight: number
): { chunk: string; remaining: string } {
  if (doc.heightOfString(text, { width }) <= maximumHeight) {
    return { chunk: text, remaining: "" };
  }

  let low = 1;
  let high = text.length;
  let fittingLength = 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (doc.heightOfString(text.slice(0, middle), { width }) <= maximumHeight) {
      fittingLength = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const fittingText = text.slice(0, fittingLength);
  const finalWhitespace = fittingText.lastIndexOf(" ");
  const splitAt = finalWhitespace > fittingLength / 2 ? finalWhitespace : fittingLength;
  return {
    chunk: text.slice(0, splitAt).trim(),
    remaining: text.slice(splitAt).trim(),
  };
}

export function drawConfirmedCollectionTable(
  doc: PDFKit.PDFDocument,
  items: readonly ConfirmedCollectionItem[],
  options: { contentWidth: number; navy?: string; pageBottom?: number }
) {
  const navy = options.navy ?? "#0f2744";
  const pageBottom = options.pageBottom ?? 60;
  drawHeader(doc, options.contentWidth, navy);

  items.forEach((item, index) => {
    const notes = item.adminNotes?.trim() || item.notes?.trim() || "—";
    doc.font("Helvetica").fontSize(8);
    const looseQuantity = item.isLooseCells
      ? (item.looseCellsQty ? String(item.looseCellsQty) : "—")
      : "—";
    const values = [
      item.palletNumber || "—",
      item.assetNumber || "—",
      item.batterySerial || "—",
      item.manufacture || "—",
      item.cellType || "—",
      item.voltage || "—",
      looseQuantity,
    ];
    let remainingNotes = notes;
    let chunkIndex = 0;
    while (remainingNotes) {
      if (doc.page.height - pageBottom - doc.y < 22) {
        doc.addPage();
        drawHeader(doc, options.contentWidth, navy);
      }

      doc.font("Helvetica").fontSize(8);
      const availableRowHeight = doc.page.height - pageBottom - doc.y;
      const { chunk: noteChunk, remaining } = takeTextChunk(
        doc,
        remainingNotes,
        columns[8].w,
        availableRowHeight - 7
      );
      const rowHeight = Math.max(
        22,
        doc.heightOfString(noteChunk, { width: columns[8].w }) + 7
      );

      const y = doc.y;
      if (index % 2 === 1) {
        doc.rect(40, y - 2, options.contentWidth, rowHeight).fill("#f8fafc");
      }

      if (chunkIndex === 0) {
        doc.fontSize(8.5).fillColor("#1e293b").font("Helvetica");
        values.forEach((value, columnIndex) => {
          const column = columns[columnIndex];
          doc.text(value, column.x, y, {
            width: column.w,
            height: rowHeight - 5,
            align: column.align,
            lineBreak: false,
            ellipsis: true,
          });
        });
        drawReceiptMark(doc, item, y);
      } else {
        doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b")
          .text("continued", columns[7].x, y + 2, {
            width: columns[7].w,
            align: "center",
            lineBreak: false,
          });
      }

      doc.fontSize(8).fillColor("#1e293b").font("Helvetica")
        .text(noteChunk, columns[8].x, y, {
          width: columns[8].w,
          height: rowHeight - 5,
        });
      doc.moveTo(40, y + rowHeight - 2)
        .lineTo(40 + options.contentWidth, y + rowHeight - 2)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();
      doc.y = y + rowHeight;
      remainingNotes = remaining;
      chunkIndex += 1;
      if (remainingNotes) {
        doc.addPage();
        drawHeader(doc, options.contentWidth, navy);
      }
    }
  });
}
