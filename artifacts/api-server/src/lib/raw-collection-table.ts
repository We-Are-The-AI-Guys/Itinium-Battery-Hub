export interface RawCollectionItem {
  palletNumber: string | null;
  assetNumber: string | null;
  batterySerial: string | null;
  manufacture: string | null;
  cellType: string | null;
  voltage: string | null;
  isLooseCells: boolean | null;
  looseCellsQty: number | null;
  notes: string | null;
}

const baseColumns = [
  { label: "Pallet", x: 40, w: 50 },
  { label: "Asset", x: 94, w: 75 },
  { label: "Serial", x: 173, w: 90 },
  { label: "Manufacturer", x: 267, w: 90 },
  { label: "Cell Type", x: 361, w: 90 },
  { label: "Voltage", x: 455, w: 45 },
  { label: "Loose Qty", x: 504, w: 50, align: "right" as const },
  { label: "Notes", x: 566, w: 0 },
];

export function rawCollectionNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  columns: typeof baseColumns,
  contentWidth: number,
  navy: string
) {
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

export function drawRawCollectionTable(
  doc: PDFKit.PDFDocument,
  items: readonly RawCollectionItem[],
  options: { contentWidth: number; navy?: string; pageBottom?: number }
) {
  const navy = options.navy ?? "#0f2744";
  const pageBottom = options.pageBottom ?? 60;
  const columns = baseColumns.map((column, index) => ({
    ...column,
    w: index === 7 ? options.contentWidth - 526 : column.w,
  }));
  drawHeader(doc, columns, options.contentWidth, navy);

  items.forEach((item, index) => {
    const values = [
      item.palletNumber || "—",
      item.assetNumber || "—",
      item.batterySerial || "—",
      item.manufacture || "—",
      item.cellType || "—",
      item.voltage || "—",
      item.isLooseCells && item.looseCellsQty ? String(item.looseCellsQty) : "—",
    ];
    let remainingNotes = rawCollectionNote(item.notes);
    let chunkIndex = 0;

    do {
      const minimumRowHeight = remainingNotes ? 22 : 34;
      if (doc.page.height - pageBottom - doc.y < minimumRowHeight) {
        doc.addPage();
        drawHeader(doc, columns, options.contentWidth, navy);
      }

      doc.font("Helvetica").fontSize(8.5);
      const availableHeight = doc.page.height - pageBottom - doc.y;
      const notePart = remainingNotes
        ? takeTextChunk(doc, remainingNotes, columns[7].w, availableHeight - 7)
        : { chunk: "", remaining: "" };
      const rowHeight = remainingNotes
        ? Math.max(22, doc.heightOfString(notePart.chunk, { width: columns[7].w }) + 7)
        : 34;
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
      } else {
        doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b")
          .text("continued", columns[6].x, y + 2, {
            width: columns[6].w,
            align: "center",
            lineBreak: false,
          });
      }

      if (notePart.chunk) {
        doc.fontSize(8).fillColor("#1e293b").font("Helvetica")
          .text(notePart.chunk, columns[7].x, y, {
            width: columns[7].w,
            height: rowHeight - 5,
          });
      } else {
        doc.moveTo(columns[7].x, y + 12)
          .lineTo(columns[7].x + columns[7].w, y + 12)
          .strokeColor("#cbd5e1")
          .lineWidth(0.5)
          .stroke();
        doc.moveTo(columns[7].x, y + 27)
          .lineTo(columns[7].x + columns[7].w, y + 27)
          .strokeColor("#cbd5e1")
          .lineWidth(0.5)
          .stroke();
      }

      doc.moveTo(40, y + rowHeight - 2)
        .lineTo(40 + options.contentWidth, y + rowHeight - 2)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();
      doc.y = y + rowHeight;
      remainingNotes = notePart.remaining || null;
      chunkIndex += 1;

      if (remainingNotes) {
        doc.addPage();
        drawHeader(doc, columns, options.contentWidth, navy);
      }
    } while (remainingNotes);
  });
}