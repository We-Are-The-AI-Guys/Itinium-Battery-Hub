import { createBrandedDoc } from "./pdf-branding";

export type ReceiptItemSnapshot = {
  palletNumber: string | null;
  assetNumber: string | null;
  batterySerial: string | null;
  manufacture: string | null;
  cellType: string | null;
  voltage: string | null;
  looseCellsQty: number | null;
  receiptConfirmed: boolean;
  adminNotes: string | null;
  valueGbp: string | null;
  receiptReviewed: boolean;
  estimatedWeightKg?: string | null;
  pbContentKg?: string | null;
};

export type ReceiptJobSnapshot = {
  reference: string;
  clientName: string;
  depot: string;
  collectionPoint: string | null;
  collectionDate: string | null;
};

export type ClientRecipientCandidate = {
  id: number;
  email: string;
  fullName: string;
  locationId: number | null;
  depot: string | null;
};

export function isReceiptReviewComplete(items: readonly ReceiptItemSnapshot[]): boolean {
  return items.length > 0 && items.every((item) => item.receiptReviewed);
}

export function calculateReceiptValue(items: readonly ReceiptItemSnapshot[]): string {
  return calculateReceivedReceiptTotals(items).valueGbp.toFixed(2);
}

export function calculateCollectionTonnage(
  items: readonly { estimatedWeightKg: string | null }[]
): string {
  const kg = items.reduce((total, item) => {
    const weight = Number(item.estimatedWeightKg);
    return total + (Number.isFinite(weight) && weight > 0 ? weight : 0);
  }, 0);
  return (kg / 1000).toFixed(3);
}

export function calculateReceivedReceiptTotals(
  items: readonly ReceiptItemSnapshot[]
): { weightKg: number; pbKg: number; valueGbp: number } {
  return items.reduce(
    (totals, item) => {
      if (item.receiptReviewed !== true || item.receiptConfirmed !== true) return totals;
      totals.weightKg += Number.parseFloat(item.estimatedWeightKg || "0") || 0;
      totals.pbKg += Number.parseFloat(item.pbContentKg || "0") || 0;
      totals.valueGbp += Number.parseFloat(item.valueGbp || "0") || 0;
      return totals;
    },
    { weightKg: 0, pbKg: 0, valueGbp: 0 }
  );
}

export function selectClientReceiptRecipients(
  candidates: readonly ClientRecipientCandidate[],
  locationId: number | null,
  depot: string
): ClientRecipientCandidate[] {
  const exactLocation = locationId
    ? candidates.filter((candidate) => candidate.locationId === locationId)
    : [];
  if (exactLocation.length > 0) return exactLocation;
  const normalizedDepot = depot.trim().toLowerCase();
  const depotMatches = candidates.filter((candidate) =>
    !!candidate.depot && candidate.depot.trim().toLowerCase() === normalizedDepot
  );
  return depotMatches.length > 0 ? depotMatches : [...candidates];
}

export function getDeliveryTargets(
  clientStatus: string | null,
  accountsStatus: string | null,
  resend: boolean
): { sendClient: boolean; sendAccounts: boolean } {
  if (resend && clientStatus === "sent" && accountsStatus === "sent") {
    return { sendClient: true, sendAccounts: true };
  }
  return {
    sendClient: clientStatus !== "sent",
    sendAccounts: accountsStatus !== "sent",
  };
}

function collectPdf(
  title: string,
  subtitle: string,
  layout: "portrait" | "landscape",
  draw: (doc: ReturnType<typeof createBrandedDoc>["doc"]) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { doc, finalize } = createBrandedDoc(title, subtitle, { layout });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    draw(doc);
    finalize();
  });
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export function generateClientReceiptPdf(
  job: ReceiptJobSnapshot,
  items: readonly ReceiptItemSnapshot[]
): Promise<Buffer> {
  return collectPdf(
    `Completed Collection Receipt — ${job.reference}`,
    `${job.clientName} | ${job.depot}`,
    "landscape",
    (doc) => {
      const left = 40;
      const contentW = doc.page.width - 80;
      const navy = "#0f2744";
      doc.font("Helvetica-Bold").fontSize(18).fillColor(navy).text("Completed Collection Receipt", left);
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).fillColor("#475569")
        .text(`Job Reference: ${job.reference}    |    Collection Date: ${dateLabel(job.collectionDate)}`, left);
      doc.moveDown(0.3);
      doc.text(`Site: ${[job.depot, job.collectionPoint].filter(Boolean).join(" — ")}`, left);
      doc.moveDown(0.8);

      const cols = [
        { label: "#", x: 40, w: 24 },
        { label: "Pallet", x: 68, w: 55 },
        { label: "Asset", x: 127, w: 70 },
        { label: "Serial", x: 201, w: 85 },
        { label: "Manufacturer", x: 290, w: 90 },
        { label: "Cell Type", x: 384, w: 90 },
        { label: "Voltage", x: 478, w: 45 },
        { label: "Received", x: 527, w: 55 },
        { label: "Receipt Notes", x: 590, w: contentW - 550 },
      ];
      const drawHeader = () => {
        const y = doc.y;
        doc.rect(left, y - 4, contentW, 22).fill("#f1f5f9");
        doc.font("Helvetica-Bold").fontSize(8).fillColor(navy);
        cols.forEach((col) => doc.text(col.label, col.x, y + 2, { width: col.w, lineBreak: false }));
        doc.y = y + 22;
      };
      drawHeader();
      items.forEach((item, index) => {
        const notes = item.adminNotes || "—";
        const rowH = Math.max(24, doc.heightOfString(notes, { width: cols[8].w, height: 42 }) + 10);
        if (doc.y + rowH > doc.page.height - 65) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        if (index % 2) doc.rect(left, y - 2, contentW, rowH).fill("#f8fafc");
        doc.font("Helvetica").fontSize(8).fillColor("#1e293b");
        const values = [
          String(index + 1),
          item.palletNumber || "—",
          item.assetNumber || "—",
          item.batterySerial || "—",
          item.manufacture || "—",
          item.cellType || "—",
          item.voltage || "—",
          item.receiptConfirmed ? "Yes" : "No",
          notes,
        ];
        values.forEach((value, i) => doc.text(value, cols[i].x, y, {
          width: cols[i].w, height: rowH - 5, ellipsis: true,
        }));
        doc.moveTo(left, y + rowH - 2).lineTo(left + contentW, y + rowH - 2)
          .strokeColor("#e2e8f0").lineWidth(0.5).stroke();
        doc.y = y + rowH;
      });
      doc.moveDown(0.8);
      doc.font("Helvetica").fontSize(9).fillColor("#475569")
        .text("This receipt confirms the item-level outcome recorded by Itinium.", left, doc.y, { width: contentW });
    }
  );
}

export function generateAccountsCompletionPdf(
  job: ReceiptJobSnapshot,
  totalValue: string
): Promise<Buffer> {
  return collectPdf(
    `Job Complete — ${job.reference}`,
    "Accounts completion document",
    "portrait",
    (doc) => {
      const left = 40;
      const contentW = doc.page.width - 80;
      doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f2744").text("Job Complete", left);
      doc.moveDown(1);
      doc.font("Helvetica").fontSize(11).fillColor("#475569")
        .text("The receipt review is complete. Use the confirmed total below when preparing the invoice to Itinium.", left, doc.y, { width: contentW });
      doc.moveDown(1.5);
      const rows = [
        ["Job Reference", job.reference],
        ["Client", job.clientName],
        ["Depot / Site", [job.depot, job.collectionPoint].filter(Boolean).join(" — ")],
        ["Collection Date", dateLabel(job.collectionDate)],
        ["Total Confirmed Job Value", `£${Number(totalValue).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ];
      rows.forEach(([label, value], index) => {
        const y = doc.y;
        if (index % 2 === 0) doc.rect(left, y - 6, contentW, 34).fill("#f8fafc");
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text(label, left + 10, y, { width: 180 });
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f2744").text(value, left + 200, y, { width: contentW - 210 });
        doc.y = y + 34;
      });
    }
  );
}