import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobsTable, jobBatteriesTable, cellModelsTable, lmePricesTable, locationsTable, clientsTable, usersTable, jobDraftsTable, scheduleRescheduleLogTable, correctionAuditLogTable, collectionCompaniesTable } from "@workspace/db/schema";
import { eq, sql, and, count, ilike, or, inArray, desc, asc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { MANUFACTURERS } from "./manufacturers";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { createBrandedDoc } from "../lib/pdf-branding";
import {
  notifyAdminsNewJob,
  notifyAdminsFlaggedBatteries,
  notifySubmitterStatusChange,
  notifyFlagResolved,
  notifyCollectionCompanyNewJob,
  sendCompletedReceiptToClient,
  sendJobValueToAccounts,
} from "../lib/notifications";
import {
  calculateReceiptValue,
  generateAccountsCompletionPdf,
  generateClientReceiptPdf,
  getDeliveryTargets,
  isReceiptReviewComplete,
  selectClientReceiptRecipients,
  type ReceiptItemSnapshot,
} from "../lib/receipt-documents";

const CSV_FLAG_REASON = "Missing from CSV import";
const CSV_UNKNOWN_FLAG_REASON = "Unknown value from CSV — please correct";

const SAFE_LOAD_FACTOR = 1.4;

// Match cell model names ignoring spacing, case and punctuation, mirroring
// the portal's normalizeForMatch so both ends agree on what "matches".
function normalizeCellKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface PbCatalogueEntry {
  manufacturer: string;
  modelName: string;
  pbContentKgPerCell: string | null;
  weightPerCellKg?: string | null;
  cellsCount: number;
}

// Actual number of cells in a battery: each cell is 2V, so a complete
// battery has voltage/2 cells (24V => 12 cells). Loose-cell rows carry an
// explicit quantity instead. Returns null when it cannot be determined.
export function deriveActualCellCount(opts: {
  isLooseCells?: boolean | null;
  looseCellsQty?: number | string | null;
  voltage?: string | null;
}): number | null {
  if (opts.isLooseCells) {
    const qty = parseInt(String(opts.looseCellsQty ?? ""), 10);
    return isFinite(qty) && qty > 0 ? qty : null;
  }
  // Accept only a single clean numeric token ("24", "24V", "24.0V"). Reject
  // multi-number strings like "12/24V" — digit concatenation would wildly
  // inflate the cell count.
  const tokens = String(opts.voltage ?? "").match(/\d+(?:\.\d+)?/g);
  if (!tokens || tokens.length !== 1) return null;
  const voltageNum = parseFloat(tokens[0]);
  if (Number.isInteger(voltageNum) && voltageNum > 0 && voltageNum % 2 === 0) {
    return voltageNum / 2;
  }
  return null;
}

// Derive a battery's total Pb content (kg) from the cell model catalogue
// using the same matching rules as job submission: exact manufacturer match
// first, then TAB, then any manufacturer (Pb per model is manufacturer-
// agnostic in practice). Total Pb = Pb-per-cell x actual cell count, where
// the actual cell count comes from the battery's voltage (voltage/2 cells,
// each cell being 2V) or, for loose cells, the recorded quantity. Returns
// null when the catalogue has no Pb data or the cell count is unknown.
export function derivePbContentKg(
  catalogue: PbCatalogueEntry[],
  manufacture: string | null,
  cellType: string | null,
  cellCount: number | null
): string | null {
  const cellStr = (cellType || "").trim();
  if (!cellStr || cellStr === "Blocs" || cellStr === "Other") return null;
  if (cellCount === null || !isFinite(cellCount) || cellCount <= 0) return null;
  const normCell = normalizeCellKey(cellStr);
  const matches = catalogue.filter(
    (m) => m.pbContentKgPerCell != null && normalizeCellKey(m.modelName) === normCell
  );
  if (matches.length === 0) return null;
  const mfr = (manufacture || "").trim();
  const isUnknownMfr = !mfr || mfr.toLowerCase() === "unknown";
  const chosen =
    (!isUnknownMfr
      ? matches.find((m) => m.manufacturer.toLowerCase() === mfr.toLowerCase())
      : undefined) ||
    matches.find((m) => m.manufacturer === "TAB") ||
    matches[0];
  const totalPb = parseFloat(chosen.pbContentKgPerCell!) * cellCount;
  return isFinite(totalPb) ? totalPb.toFixed(3) : null;
}

// Derive a battery's raw (pre-safe-load-factor) estimated weight in kg from
// the cell model catalogue, using the same matching rules as Pb derivation:
// exact manufacturer first, then TAB, then any. Returns null when the model
// isn't in the catalogue or the cell count is unknown. Keeping this on the
// server guarantees manual entry and CSV import produce identical weights
// for the same battery, and that corrections re-derive consistently.
export function deriveEstimatedWeightKg(
  catalogue: PbCatalogueEntry[],
  manufacture: string | null,
  cellType: string | null,
  cellCount: number | null
): string | null {
  const cellStr = (cellType || "").trim();
  if (!cellStr || cellStr === "Blocs" || cellStr === "Other") return null;
  if (cellCount === null || !isFinite(cellCount) || cellCount <= 0) return null;
  const normCell = normalizeCellKey(cellStr);
  const matches = catalogue.filter(
    (m) => m.weightPerCellKg != null && normalizeCellKey(m.modelName) === normCell
  );
  if (matches.length === 0) return null;
  const mfr = (manufacture || "").trim();
  const isUnknownMfr = !mfr || mfr.toLowerCase() === "unknown";
  const chosen =
    (!isUnknownMfr
      ? matches.find((m) => m.manufacturer.toLowerCase() === mfr.toLowerCase())
      : undefined) ||
    matches.find((m) => m.manufacturer === "TAB") ||
    matches[0];
  const total = parseFloat(chosen.weightPerCellKg!) * cellCount;
  return isFinite(total) && total > 0 ? total.toFixed(3) : null;
}

export function deriveTabGrossWeightKg(
  catalogue: PbCatalogueEntry[],
  cellType: string | null,
  cellCount: number | null
): string | null {
  const cellStr = (cellType || "").trim();
  if (!cellStr || cellStr === "Blocs" || cellStr === "Other") return null;
  if (cellCount === null || !isFinite(cellCount) || cellCount <= 0) return null;
  const normCell = normalizeCellKey(cellStr);
  const tabEntry = catalogue.find(
    (entry) =>
      entry.manufacturer.toLowerCase() === "tab" &&
      entry.weightPerCellKg != null &&
      normalizeCellKey(entry.modelName) === normCell
  );
  if (!tabEntry) return null;
  const grossWeight = parseFloat(tabEntry.weightPerCellKg!) * cellCount * SAFE_LOAD_FACTOR;
  return isFinite(grossWeight) && grossWeight > 0 ? grossWeight.toFixed(3) : null;
}

// Sort battery rows by pallet number in natural/numeric order (1, 2, … 10,
// 17 — not text order), handling values like "PALLET 2". Rows without a
// pallet number sort last; ties keep insertion (id) order so corrected rows
// stay in their original pallet position.
function sortBatteriesByPallet<T extends { palletNumber: string | null; id: number }>(rows: T[]): T[] {
  const palletNum = (p: string | null): number | null => {
    const tokens = (p || "").match(/\d+(?:\.\d+)?/);
    if (!tokens) return null;
    const n = parseFloat(tokens[0]);
    return isFinite(n) ? n : null;
  };
  return [...rows].sort((a, b) => {
    const an = palletNum(a.palletNumber);
    const bn = palletNum(b.palletNumber);
    if (an !== null && bn !== null && an !== bn) return an - bn;
    if (an === null && bn !== null) return 1;
    if (an !== null && bn === null) return -1;
    if (an === null && bn === null) {
      const at = (a.palletNumber || "").trim();
      const bt = (b.palletNumber || "").trim();
      // Rows with no pallet at all go after non-numeric pallet labels.
      if (at && !bt) return -1;
      if (!at && bt) return 1;
      const cmp = at.localeCompare(bt, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }
    return a.id - b.id;
  });
}

// Shared Driver & Vehicle section for the Collection Sheet and Confirmed
// Collection Sheet: shows assigned values, or blank lines to hand-write.
function drawDriverVehicleSection(
  doc: InstanceType<typeof PDFDocument>,
  contentW: number,
  driverName: string | null,
  vehicleReg: string | null
) {
  const NAVY = "#0f2744";
  if (doc.y + 70 > doc.page.height - 60) doc.addPage();
  const dvY = doc.y;
  doc.rect(40, dvY, contentW, 0.5).fill("#e2e8f0");
  doc.y = dvY + 8;
  doc.fontSize(10).fillColor(NAVY).font("Helvetica-Bold").text("DRIVER & VEHICLE", 40);
  const dvRowY = doc.y + 6;
  const halfW = contentW / 2;
  doc.fontSize(9).fillColor("#64748b").font("Helvetica-Bold")
    .text("DRIVER", 40, dvRowY, { lineBreak: false })
    .text("VEHICLE REG", 40 + halfW, dvRowY, { lineBreak: false });
  const dvValY = dvRowY + 13;
  doc.fontSize(10).fillColor("#1e293b").font("Helvetica");
  if (driverName) {
    doc.text(driverName, 40, dvValY, { width: halfW - 20, lineBreak: false });
  } else {
    doc.moveTo(40, dvValY + 10).lineTo(40 + halfW - 30, dvValY + 10).strokeColor("#94a3b8").lineWidth(0.75).stroke();
  }
  if (vehicleReg) {
    doc.text(vehicleReg, 40 + halfW, dvValY, { width: halfW - 20, lineBreak: false });
  } else {
    doc.moveTo(40 + halfW, dvValY + 10).lineTo(40 + contentW - 10, dvValY + 10).strokeColor("#94a3b8").lineWidth(0.75).stroke();
  }
  doc.y = dvValY + 22;
}

// Shared closing block for the Collection Sheet and Confirmed Collection
// Sheet: the middle agreement box, Driver and Site signature lines, and the
// closing notice. Drawn atomically — the total height is measured up front
// and a new page is started first if it will not fit, so the agreement,
// signatures, and notice are never split across pages.
function drawAgreementAndSignatures(doc: InstanceType<typeof PDFDocument>, contentW: number, closingNotice: string) {
  const NAVY = "#0f2744";
  const pageBottom = doc.page.height - 60;

  doc.fontSize(9.5).font("Helvetica");
  const agreement = "This document is the confirmation and agreement for Itinium to remove the above redundant batteries for further inspection.";
  const agreementTextH = doc.heightOfString(agreement, { width: contentW - 24 });
  doc.fontSize(8);
  const noticeH = doc.heightOfString(closingNotice, { width: contentW });
  // gap + agreement box + gap + "SIGNATURES" + signature rows + gap + notice
  const totalH = 18 + (agreementTextH + 20) + 18 + 14 + 98 + 12 + noticeH;
  if (doc.y + totalH > pageBottom) doc.addPage();

  doc.y += 18;
  const boxY = doc.y;
  doc.rect(40, boxY, contentW, agreementTextH + 20).strokeColor("#94a3b8").lineWidth(0.75).stroke();
  doc.fontSize(9.5).fillColor("#1e293b").font("Helvetica")
    .text(agreement, 52, boxY + 10, { width: contentW - 24 });
  doc.y = boxY + agreementTextH + 20 + 18;

  doc.fontSize(10).fillColor(NAVY).font("Helvetica-Bold").text("SIGNATURES", 40);
  const sigTop = doc.y + 8;
  const colW = (contentW - 30) / 2;
  const drawSigBlock = (x: number, party: string) => {
    doc.fontSize(9).fillColor("#64748b").font("Helvetica-Bold").text(party.toUpperCase(), x, sigTop, { lineBreak: false });
    const rows = [["Name:", 20], ["Signature:", 46], ["Date:", 72]] as const;
    for (const [label, dy] of rows) {
      const y = sigTop + dy;
      doc.fontSize(9).fillColor("#475569").font("Helvetica").text(label, x, y, { lineBreak: false });
      doc.moveTo(x + 55, y + 9).lineTo(x + colW, y + 9).strokeColor("#94a3b8").lineWidth(0.75).stroke();
    }
  };
  drawSigBlock(40, "Driver");
  drawSigBlock(40 + colW + 30, "Site");
  doc.y = sigTop + 90;

  doc.fontSize(8).fillColor("#64748b").font("Helvetica")
    .text(closingNotice, 40, doc.y, { width: contentW });
}

// Effective LME rate for a job: the job's CBL LME value if set (>0),
// otherwise the latest LME GBP price. Returns null when neither exists.
async function getEffectiveLmeRateForJob(cblLmeValue: string | null): Promise<number | null> {
  const cbl = cblLmeValue ? parseFloat(cblLmeValue) : NaN;
  if (isFinite(cbl) && cbl > 0) return cbl;
  const [latestLme] = await db
    .select({ gbpPrice: lmePricesTable.gbpPrice })
    .from(lmePricesTable)
    .orderBy(desc(lmePricesTable.createdAt))
    .limit(1);
  if (!latestLme) return null;
  const gbp = parseFloat(latestLme.gbpPrice);
  return isFinite(gbp) && gbp > 0 ? gbp : null;
}

const router: IRouter = Router();

function buildJobsWhere(query: Record<string, unknown>) {
  const { status, invoiceStatus, paymentStatus, search, manufacturer, collectionPoint } = query as Record<string, string | undefined>;
  const conditions = [];
  if (status && status !== "All" && status !== "all") {
    conditions.push(eq(jobsTable.status, status.toLowerCase()));
  }
  if (invoiceStatus) {
    conditions.push(eq(jobsTable.invoiceStatus, invoiceStatus));
  }
  if (paymentStatus === "overdue") {
    conditions.push(sql`${jobsTable.dueDate} IS NOT NULL AND ${jobsTable.dueDate} < CURRENT_DATE AND (${jobsTable.datePaid} IS NULL)`);
  } else if (paymentStatus === "upcoming") {
    conditions.push(sql`${jobsTable.dueDate} IS NOT NULL AND ${jobsTable.dueDate} >= CURRENT_DATE AND (${jobsTable.datePaid} IS NULL)`);
  } else if (paymentStatus === "paid") {
    conditions.push(sql`${jobsTable.datePaid} IS NOT NULL`);
  }
  if (collectionPoint) {
    conditions.push(ilike(jobsTable.collectionPoint, `%${collectionPoint}%`));
  }
  if (search) {
    conditions.push(
      or(
        ilike(jobsTable.reference, `%${search}%`),
        ilike(jobsTable.clientName, `%${search}%`)
      )!
    );
  }
  if (manufacturer) {
    const mfrJobIds = db
      .select({ jobId: jobBatteriesTable.jobId })
      .from(jobBatteriesTable)
      .where(ilike(jobBatteriesTable.manufacture, manufacturer));
    conditions.push(inArray(jobsTable.id, mfrJobIds));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

router.get(
  "/jobs/schedule",
  requireAuth,
  requireRole("head_office_admin"),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const jobs = await db
        .select({
          id: jobsTable.id,
          reference: jobsTable.reference,
          clientName: jobsTable.clientName,
          depot: jobsTable.depot,
          collectionDate: jobsTable.collectionDate,
          status: jobsTable.status,
        })
        .from(jobsTable)
        .where(sql`${jobsTable.collectionDate} IS NOT NULL`)
        .orderBy(asc(jobsTable.collectionDate));
      res.json({ jobs });
    } catch (err) {
      console.error("Schedule jobs fetch error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/jobs/export.xlsx",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const whereClause = buildJobsWhere(req.query as Record<string, unknown>);
      const jobs = await db
        .select()
        .from(jobsTable)
        .where(whereClause)
        .orderBy(desc(jobsTable.submittedAt));

      const wb = new ExcelJS.Workbook();
      wb.creator = "Itinium Battery Portal";
      wb.created = new Date();
      const ws = wb.addWorksheet("Jobs");
      ws.columns = [
        { header: "Reference", key: "reference", width: 16 },
        { header: "Client", key: "client", width: 24 },
        { header: "Depot", key: "depot", width: 20 },
        { header: "Collection Date", key: "collectionDate", width: 14 },
        { header: "Tonnage (t)", key: "tonnage", width: 12 },
        { header: "LME Rate Used (£/t)", key: "lmeRateUsed", width: 18 },
        { header: "Calculated Value (£)", key: "calculatedValue", width: 20 },
        { header: "Customer Invoice No", key: "customerInvoiceNo", width: 20 },
        { header: "Itinium Invoice No", key: "itiniumInvoiceNo", width: 20 },
        { header: "Invoice Status", key: "invoiceStatus", width: 18 },
        { header: "Date Paid", key: "datePaid", width: 14 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const j of jobs) {
        ws.addRow({
          reference: j.reference,
          client: j.clientName,
          depot: j.depot,
          collectionDate: j.collectionDate || "",
          tonnage: j.tonnage ? Number(j.tonnage) : null,
          lmeRateUsed: j.lmeRateUsed ? Number(j.lmeRateUsed) : null,
          calculatedValue: j.calculatedValue ? Number(j.calculatedValue) : null,
          customerInvoiceNo: j.customerInvoiceNo || "",
          itiniumInvoiceNo: j.itiniumInvoiceNo || "",
          invoiceStatus: j.invoiceStatus || "",
          datePaid: j.datePaid || "",
        });
      }
      ws.getColumn("tonnage").numFmt = "0.000";
      ws.getColumn("lmeRateUsed").numFmt = "£#,##0.00";
      ws.getColumn("calculatedValue").numFmt = "£#,##0.00";

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="jobs-${stamp}.xlsx"`);
      const buf = await wb.xlsx.writeBuffer();
      res.send(Buffer.from(buf));
    } catch (error) {
      console.error("Jobs xlsx export error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/jobs/invoice-summary.pdf",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const monthParam = (req.query.month as string) || "";
      const today = new Date();
      let year = today.getUTCFullYear();
      let month = today.getUTCMonth() + 1;
      const m = /^(\d{4})-(\d{1,2})$/.exec(monthParam);
      if (m) {
        year = parseInt(m[1], 10);
        month = parseInt(m[2], 10);
        if (month < 1 || month > 12) {
          res.status(400).json({ message: "Invalid month" });
          return;
        }
      }
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

      const jobs = await db
        .select()
        .from(jobsTable)
        .where(sql`${jobsTable.collectionDate} >= ${start} AND ${jobsTable.collectionDate} < ${nextMonth}`)
        .orderBy(asc(jobsTable.clientName), asc(jobsTable.collectionDate));

      const monthLabel = new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      const stamp = `${year}-${String(month).padStart(2, "0")}`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-summary-${stamp}.pdf"`);

      const { doc, finalize } = createBrandedDoc(
        "Invoice Summary",
        `Month: ${monthLabel}`
      );
      doc.pipe(res);

      doc.fontSize(18).fillColor("#0f2744").font("Helvetica-Bold").text("Invoice Summary", 40, doc.y);
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor("#475569").font("Helvetica").text(`Month: ${monthLabel}`);
      doc.moveDown(0.8);

      const cols = [
        { label: "Reference", x: 40, w: 80 },
        { label: "Collection", x: 120, w: 70 },
        { label: "Tonnage", x: 190, w: 55, align: "right" as const },
        { label: "LME Rate", x: 245, w: 65, align: "right" as const },
        { label: "Value (£)", x: 310, w: 70, align: "right" as const },
        { label: "Inv. Status", x: 380, w: 75 },
        { label: "Cust. Inv.", x: 455, w: 100 },
      ];

      function drawHeader() {
        const y = doc.y;
        doc.rect(40, y - 4, 515, 20).fill("#f1f5f9");
        doc.fontSize(9).fillColor("#0f2744").font("Helvetica-Bold");
        for (const c of cols) {
          doc.text(c.label, c.x, y, { width: c.w, align: c.align, lineBreak: false });
        }
        doc.font("Helvetica").fillColor("#000");
        doc.moveDown(0.6);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cbd5e1").stroke();
        doc.moveDown(0.3);
      }

      function ensureRoom() {
        if (doc.y > 720) {
          doc.addPage();
        }
      }

      const grouped = new Map<string, typeof jobs>();
      for (const j of jobs) {
        const k = j.clientName;
        if (!grouped.has(k)) grouped.set(k, [] as typeof jobs);
        grouped.get(k)!.push(j);
      }

      let grandTotal = 0;

      if (jobs.length === 0) {
        doc.fontSize(11).fillColor("#64748b").text(`No jobs with collection date in ${monthLabel}.`);
      }

      for (const [client, list] of grouped) {
        ensureRoom();
        doc.moveDown(0.4);
        doc.fontSize(12).fillColor("#0ea5e9").font("Helvetica-Bold").text(client, 40);
        doc.font("Helvetica").fillColor("#000");
        doc.moveDown(0.2);
        drawHeader();
        let clientTotal = 0;
        for (const j of list) {
          ensureRoom();
          const value = j.calculatedValue ? Number(j.calculatedValue) : 0;
          clientTotal += value;
          const y = doc.y;
          doc.fontSize(9).fillColor("#000");
          doc.text(j.reference || "", cols[0].x, y, { width: cols[0].w, lineBreak: false });
          doc.text(j.collectionDate || "", cols[1].x, y, { width: cols[1].w, lineBreak: false });
          doc.text(j.tonnage ? Number(j.tonnage).toFixed(3) : "—", cols[2].x, y, { width: cols[2].w, align: "right", lineBreak: false });
          doc.text(j.lmeRateUsed ? `£${Number(j.lmeRateUsed).toFixed(2)}` : "—", cols[3].x, y, { width: cols[3].w, align: "right", lineBreak: false });
          doc.text(j.calculatedValue ? `£${value.toFixed(2)}` : "—", cols[4].x, y, { width: cols[4].w, align: "right", lineBreak: false });
          doc.text(j.invoiceStatus || "—", cols[5].x, y, { width: cols[5].w, lineBreak: false });
          doc.text(j.customerInvoiceNo || "—", cols[6].x, y, { width: cols[6].w, lineBreak: false });
          doc.moveDown(0.8);
        }
        grandTotal += clientTotal;
        ensureRoom();
        doc.fontSize(9).fillColor("#0f2744").font("Helvetica-Bold")
          .text(`Subtotal — ${client}: £${clientTotal.toFixed(2)}`, 40, doc.y, { align: "right", width: 515 });
        doc.font("Helvetica").fillColor("#000");
        doc.moveDown(0.4);
      }

      if (jobs.length > 0) {
        ensureRoom();
        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#0f2744").stroke();
        doc.moveDown(0.4);
        doc.fontSize(12).fillColor("#0f2744").font("Helvetica-Bold")
          .text(`Grand Total: £${grandTotal.toFixed(2)}   (${jobs.length} job${jobs.length === 1 ? "" : "s"})`, 40, doc.y, { align: "right", width: 515 });
      }

      finalize();
    } catch (error) {
      console.error("Invoice summary PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      } else {
        res.end();
      }
    }
  }
);

router.get(
  "/jobs",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { limit = "10", offset = "0" } = req.query;
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 10));
      const offsetNum = Math.max(0, parseInt(offset as string, 10) || 0);

      const whereClause = buildJobsWhere(req.query as Record<string, unknown>);

      const [jobs, [totalResult]] = await Promise.all([
        db
          .select({
            ...jobsTable,
            batteryValueSum: sql<string | null>`(
              SELECT CAST(SUM(jb.value_gbp) AS TEXT)
              FROM job_batteries jb
              WHERE jb.job_id = ${jobsTable.id}
            )`,
          })
          .from(jobsTable)
          .where(whereClause)
          .orderBy(sql`${jobsTable.submittedAt} DESC`)
          .limit(limitNum)
          .offset(offsetNum),
        db
          .select({ count: count() })
          .from(jobsTable)
          .where(whereClause),
      ]);

      const total = totalResult?.count || 0;

      res.json({
        jobs,
        total,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Jobs list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/jobs/:id/invoice.pdf",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }

      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      const batteries = sortBatteriesByPallet(
        await db
          .select()
          .from(jobBatteriesTable)
          .where(eq(jobBatteriesTable.jobId, jobId))
      );

      let locationAddress: string | null = null;
      if (job.locationId) {
        const [loc] = await db
          .select({ address: locationsTable.address })
          .from(locationsTable)
          .where(eq(locationsTable.id, job.locationId));
        if (loc) locationAddress = loc.address;
      }

      const collectionLabel = job.collectionDate
        ? new Date(`${job.collectionDate}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
          })
        : "—";

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="confirmed-collection-sheet-${job.reference.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf"`
      );

      const { doc, finalize } = createBrandedDoc(
        `Confirmed Collection Sheet — ${job.reference}`,
        `${job.clientName} | ${job.depot}`
      );
      doc.pipe(res);

      const pageW = doc.page.width;
      const contentW = pageW - 80;
      const NAVY = "#0f2744";
      const TEAL = "#0ea5e9";

      function ensureRoom(needed = 30) {
        if (doc.y + needed > doc.page.height - 60) {
          doc.addPage();
        }
      }

      doc.fontSize(18).fillColor(NAVY).font("Helvetica-Bold")
        .text(`Confirmed Collection Sheet`, 40, doc.y, { continued: false });
      doc.moveDown(0.3);

      const generatedStr = `Issued: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
      doc.fontSize(9).fillColor("#475569").font("Helvetica").text(generatedStr, 40);
      doc.moveDown(0.8);

      const topY = doc.y;

      // Supplier block with explicit line positions (fixes uneven spacing).
      const leftLines: Array<[string, boolean]> = [["Supplier:", true], [job.clientName, false], [job.depot, false]];
      if (job.collectionPoint) leftLines.push([job.collectionPoint, false]);
      leftLines.push(["Buyer:", true], ["Itinium Partnership Ltd", false]);
      let ly = topY;
      for (const [line, bold] of leftLines) {
        doc.fontSize(10)
          .fillColor(bold ? NAVY : "#334155")
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .text(line, 40, ly, { width: pageW / 2 - 60, lineBreak: false });
        ly += bold && line !== "Supplier:" ? 15 : 14;
        if (bold && line === "Buyer:") ly -= 0;
      }

      const rightColX = pageW / 2 + 10;
      const labelW = 120;
      const valueX = rightColX + labelW;
      const valueW = pageW - valueX - 40;

      function infoRow(label: string, value: string, yPos: number) {
        doc.fontSize(9).fillColor("#64748b").font("Helvetica-Bold")
          .text(label, rightColX, yPos, { width: labelW, lineBreak: false });
        doc.fontSize(9).fillColor("#1e293b").font("Helvetica")
          .text(value, valueX, yPos, { width: valueW, lineBreak: false });
      }

      infoRow("Job Reference:", job.reference, topY);
      infoRow("Collection Date:", collectionLabel, topY + 16);
      infoRow("Customer Invoice No:", job.customerInvoiceNo || "—", topY + 32);

      doc.y = Math.max(ly, topY + 60);
      doc.moveDown(1.2);

      doc.moveTo(40, doc.y).lineTo(pageW - 40, doc.y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.moveDown(0.8);

      const siteAddress = [locationAddress, job.collectionPoint].filter(Boolean).join(" — ") || job.depot;

      function infoBlock(label: string, value: string) {
        ensureRoom(40);
        doc.fontSize(9).fillColor("#64748b").font("Helvetica-Bold").text(label.toUpperCase(), 40);
        doc.fontSize(10).fillColor("#1e293b").font("Helvetica").text(value, 40, doc.y + 2, { width: contentW });
        doc.moveDown(0.6);
      }

      infoBlock("Site Address", siteAddress);
      infoBlock("Site Contacts", job.siteContacts || "—");
      infoBlock("Site Hours", job.siteHours || "—");
      drawDriverVehicleSection(doc, contentW, job.driverName, job.vehicleReg);
      infoBlock("Special / Loading Instructions", job.specialInstructions || "None");

      doc.moveTo(40, doc.y).lineTo(pageW - 40, doc.y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.moveDown(0.8);

      // Mirror of the Collection Sheet table, plus a printed receipt
      // confirmation column (tick / cross by hand) and a blank notes column.
      const batCols = [
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

      function drawConfirmedTableHeader() {
        const hy = doc.y;
        doc.rect(40, hy - 4, contentW, 22).fill("#f1f5f9");
        doc.fontSize(8.5).fillColor(NAVY).font("Helvetica-Bold");
        for (const c of batCols) {
          doc.text(c.label, c.x, hy + 2, { width: c.w, align: c.align, lineBreak: false });
        }
        doc.y = hy + 22;
        doc.font("Helvetica").fillColor("#1e293b");
      }

      ensureRoom(60);
      drawConfirmedTableHeader();

      let rowIdx = 0;
      for (const b of batteries) {
        if (doc.y + 20 > doc.page.height - 60) {
          doc.addPage();
          drawConfirmedTableHeader();
        }
        const ry = doc.y;
        if (rowIdx % 2 === 1) {
          doc.rect(40, ry - 2, contentW, 18).fill("#f8fafc");
        }
        const looseQty = b.isLooseCells ? (b.looseCellsQty ? String(b.looseCellsQty) : "—") : "—";

        doc.fontSize(8.5).fillColor("#1e293b").font("Helvetica");
        doc.text(b.palletNumber || "—", batCols[0].x, ry, { width: batCols[0].w, lineBreak: false });
        doc.text(b.assetNumber || "—", batCols[1].x, ry, { width: batCols[1].w, lineBreak: false, ellipsis: true, height: 16 });
        doc.text(b.batterySerial || "—", batCols[2].x, ry, { width: batCols[2].w, lineBreak: false, ellipsis: true, height: 16 });
        doc.text(b.manufacture || "—", batCols[3].x, ry, { width: batCols[3].w, lineBreak: false, ellipsis: true, height: 16 });
        doc.text(b.cellType || "—", batCols[4].x, ry, { width: batCols[4].w, lineBreak: false, ellipsis: true, height: 16 });
        doc.text(b.voltage || "—", batCols[5].x, ry, { width: batCols[5].w, lineBreak: false });
        doc.text(looseQty, batCols[6].x, ry, { width: batCols[6].w, align: "right", lineBreak: false });
        // Empty tick box for hand-marking receipt
        doc.rect(batCols[7].x + batCols[7].w / 2 - 5, ry, 10, 10).strokeColor("#94a3b8").lineWidth(0.5).stroke();
        // Blank notes line
        doc.moveTo(batCols[8].x, ry + 10).lineTo(batCols[8].x + batCols[8].w, ry + 10).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
        doc.y = ry + 18;
        rowIdx++;
      }

      if (batteries.length === 0) {
        doc.fontSize(9).fillColor("#94a3b8").text("No battery items recorded.", 40);
      }

      drawAgreementAndSignatures(
        doc,
        contentW,
        "This confirmed collection sheet is issued by Itinium Partnership Ltd and confirms receipt of the batteries collected above. Please retain a copy for your records."
      );

      finalize();
    } catch (error) {
      console.error("Per-job invoice PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      } else {
        res.end();
      }
    }
  }
);

export function canDownloadRawCollectionSheet(
  user: Pick<NonNullable<AuthenticatedRequest["user"]>, "role" | "collectionCompanyId">,
  job: { collectionCompanyId: number | null; scheduleStatus: string | null }
) {
  if (["team_leader", "accounts", "head_office_admin"].includes(user.role)) return true;
  return user.role === "collection_company"
    && user.collectionCompanyId != null
    && job.collectionCompanyId === user.collectionCompanyId
    && job.scheduleStatus === "confirmed";
}

router.get(
  "/jobs/:id/collection-sheet.pdf",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin", "collection_company"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }

      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }
      if (!canDownloadRawCollectionSheet(req.user!, job)) {
        res.status(403).json({
          message: "The collection sheet is available to the assigned collection company after Itinium confirms the schedule",
        });
        return;
      }

      const batteries = sortBatteriesByPallet(
        await db
          .select()
          .from(jobBatteriesTable)
          .where(eq(jobBatteriesTable.jobId, jobId))
      );

      let locationAddress: string | null = null;
      if (job.locationId) {
        const [loc] = await db
          .select({ address: locationsTable.address })
          .from(locationsTable)
          .where(eq(locationsTable.id, job.locationId));
        if (loc) locationAddress = loc.address;
      }

      const palletKeys = new Set<string>();
      let unnumbered = 0;
      for (const b of batteries) {
        const p = (b.palletNumber || "").trim();
        if (p) palletKeys.add(p.toLowerCase());
        else unnumbered++;
      }
      const palletCount = palletKeys.size + unnumbered;

      const tonnageNum = job.tonnage ? parseFloat(job.tonnage) : NaN;
      const tonnageLabel = isFinite(tonnageNum)
        ? `c ${(Math.round(tonnageNum * 10) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 })}t`
        : "";
      const summaryLine = `${palletCount} pallet${palletCount === 1 ? "" : "s"}${tonnageLabel ? ` ${tonnageLabel}` : ""}`;

      const collectionLabel = job.collectionDate
        ? new Date(`${job.collectionDate}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
          })
        : "—";

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="collection-sheet-${job.reference.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf"`
      );

      const { doc, finalize } = createBrandedDoc(
        `Collection Sheet — ${job.reference}`,
        `${job.clientName} | ${job.depot}`,
        { layout: "landscape" }
      );
      doc.pipe(res);

      const pageW = doc.page.width;
      const contentW = pageW - 80;
      const NAVY = "#0f2744";

      function ensureRoom(needed = 30) {
        if (doc.y + needed > doc.page.height - 60) {
          doc.addPage();
        }
      }

      doc.fontSize(18).fillColor(NAVY).font("Helvetica-Bold")
        .text("Collection Sheet", 40, doc.y);
      doc.moveDown(0.2);
      doc.fontSize(13).fillColor("#0ea5e9").font("Helvetica-Bold").text(summaryLine, 40);
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#475569").font("Helvetica")
        .text(`Job Reference: ${job.reference}    |    Collection Date: ${collectionLabel}`, 40);
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor("#475569").font("Helvetica")
        .text(`Allocated Driver: ${job.driverName || "—"}    |    Vehicle: ${job.vehicleReg || "—"}`, 40);
      doc.moveDown(0.8);

      const siteAddress = [locationAddress, job.collectionPoint].filter(Boolean).join(" — ") || job.depot;

      function infoBlock(label: string, value: string) {
        ensureRoom(40);
        doc.fontSize(9).fillColor("#64748b").font("Helvetica-Bold").text(label.toUpperCase(), 40);
        doc.fontSize(10).fillColor("#1e293b").font("Helvetica").text(value, 40, doc.y + 2, { width: contentW });
        doc.moveDown(0.6);
      }

      infoBlock("Site Address", siteAddress);
      infoBlock("Site Contacts", job.siteContacts || "—");
      infoBlock("Site Hours", job.siteHours || "—");

      ensureRoom(50);
      const instrY = doc.y;
      doc.rect(40, instrY, contentW, 0.5).fill("#e2e8f0");
      doc.y = instrY + 8;
      doc.fontSize(10).fillColor(NAVY).font("Helvetica-Bold").text("SPECIAL / LOADING INSTRUCTIONS", 40);
      doc.fontSize(10).fillColor("#1e293b").font("Helvetica")
        .text(job.specialInstructions || "None", 40, doc.y + 2, { width: contentW });
      doc.moveDown(1);

      const cols = [
        { label: "Pallet", x: 40, w: 50 },
        { label: "Asset", x: 94, w: 75 },
        { label: "Serial", x: 173, w: 90 },
        { label: "Manufacturer", x: 267, w: 90 },
        { label: "Cell Type", x: 361, w: 90 },
        { label: "Voltage", x: 455, w: 45 },
        { label: "Loose Qty", x: 504, w: 50, align: "right" as const },
        { label: "Notes", x: 566, w: contentW - 526 },
      ];

      function drawTableHeader() {
        const hy = doc.y;
        doc.rect(40, hy - 4, contentW, 22).fill("#f1f5f9");
        doc.fontSize(8.5).fillColor(NAVY).font("Helvetica-Bold");
        for (const c of cols) {
          doc.text(c.label, c.x, hy + 2, { width: c.w, align: c.align, lineBreak: false });
        }
        doc.y = hy + 22;
        doc.font("Helvetica").fillColor("#1e293b");
      }

      ensureRoom(60);
      drawTableHeader();

      let rowIdx = 0;
      for (const b of batteries) {
        const rowHeight = 34;
        if (doc.y + rowHeight > doc.page.height - 60) {
          doc.addPage();
          drawTableHeader();
        }
        const ry = doc.y;
        if (rowIdx % 2 === 1) {
          doc.rect(40, ry - 2, contentW, rowHeight).fill("#f8fafc");
        }
        const looseQty = b.isLooseCells ? (b.looseCellsQty ? String(b.looseCellsQty) : "—") : "—";
        doc.fontSize(8.5).fillColor("#1e293b").font("Helvetica");
        doc.text(b.palletNumber || "—", cols[0].x, ry, { width: cols[0].w, lineBreak: false });
        doc.text(b.assetNumber || "—", cols[1].x, ry, { width: cols[1].w, lineBreak: false });
        doc.text(b.batterySerial || "—", cols[2].x, ry, { width: cols[2].w, lineBreak: false });
        doc.text(b.manufacture || "—", cols[3].x, ry, { width: cols[3].w, lineBreak: false });
        doc.text(b.cellType || "—", cols[4].x, ry, { width: cols[4].w, lineBreak: false });
        doc.text(b.voltage || "—", cols[5].x, ry, { width: cols[5].w, lineBreak: false });
        doc.text(looseQty, cols[6].x, ry, { width: cols[6].w, align: "right", lineBreak: false });
        // Two full-width writing lines give the driver space to record
        // discrepancies or site notes against every individual item.
        const notes = cols[7];
        doc.moveTo(notes.x, ry + 12).lineTo(notes.x + notes.w, ry + 12)
          .strokeColor("#cbd5e1").lineWidth(0.5).stroke();
        doc.moveTo(notes.x, ry + 27).lineTo(notes.x + notes.w, ry + 27)
          .strokeColor("#cbd5e1").lineWidth(0.5).stroke();
        doc.moveTo(40, ry + rowHeight - 2).lineTo(40 + contentW, ry + rowHeight - 2)
          .strokeColor("#e2e8f0").lineWidth(0.5).stroke();
        doc.y = ry + rowHeight;
        rowIdx++;
      }

      if (batteries.length === 0) {
        doc.fontSize(9).fillColor("#94a3b8").text("No battery items recorded.", 40);
      }

      drawAgreementAndSignatures(
        doc,
        contentW,
        "This collection sheet is issued by Itinium Partnership Ltd for the transport company carrying out the above collection. Please follow all site instructions and confirm pallet counts on arrival."
      );

      finalize();
    } catch (error) {
      console.error("Collection sheet PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      } else {
        res.end();
      }
    }
  }
);

router.get(
  "/jobs/:id",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }

      const [job] = await db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.id, jobId));

      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      const batteryRows = sortBatteriesByPallet(
        await db
          .select()
          .from(jobBatteriesTable)
          .where(eq(jobBatteriesTable.jobId, jobId))
      );

      const resolverIds = [...new Set(batteryRows.map(b => b.resolvedById).filter((v): v is number => v != null))];
      const resolverMap = new Map<number, string>();
      if (resolverIds.length > 0) {
        const resolvers = await db
          .select({ id: usersTable.id, fullName: usersTable.fullName })
          .from(usersTable)
          .where(inArray(usersTable.id, resolverIds));
        for (const r of resolvers) resolverMap.set(r.id, r.fullName);
      }

      const batteries = batteryRows.map(b => ({
        ...b,
        resolvedByName: b.resolvedById != null ? (resolverMap.get(b.resolvedById) || null) : null,
      }));

      res.json({ job, batteries });
    } catch (error) {
      console.error("Job detail error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

interface BatteryInput {
  palletNumber?: string | null;
  assetNumber?: string | null;
  batterySerial?: string | null;
  manufacture?: string | null;
  cellType?: string | null;
  voltage?: string | null;
  looseCellsQty?: string | number | null;
  estimatedWeightKg?: string | number | null;
  weightManual?: boolean;
  notes?: string | null;
  isLooseCells?: boolean;
  serialFlagReason?: string | null;
  manufacturerFlagReason?: string | null;
  cellModelFlagReason?: string | null;
  voltageFlagReason?: string | null;
  manufacturerCorrectionConfidence?: string | null;
  cellModelCorrectionConfidence?: string | null;
  voltageCorrectionConfidence?: string | null;
  manufacturerOriginalValue?: string | null;
  manufacturerSuggestedValue?: string | null;
  manufacturerWasAccepted?: boolean | null;
  cellModelOriginalValue?: string | null;
  cellModelSuggestedValue?: string | null;
  cellModelWasAccepted?: boolean | null;
  voltageOriginalValue?: string | null;
  voltageSuggestedValue?: string | null;
  voltageWasAccepted?: boolean | null;
  rowPhoto?: string | null;
}

router.post(
  "/jobs",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { collectionPoint, collectionDate, tonnage, tonnageManualOverride, notes, batteries, draftId } = req.body;
      let { depot } = req.body;

      let resolvedClientId = req.user!.clientId || null;
      let resolvedLocationId = req.user!.locationId || null;
      let clientName = "Unknown";

      if (resolvedClientId) {
        const [client] = await db
          .select({ name: clientsTable.name })
          .from(clientsTable)
          .where(eq(clientsTable.id, resolvedClientId));
        if (client) clientName = client.name;
      } else {
        clientName = req.user!.fullName || "Unknown";
      }

      let locationSiteContacts: string | null = null;
      let locationSiteHours: string | null = null;
      let locationSpecialInstructions: string | null = null;
      if (resolvedLocationId) {
        const [location] = await db
          .select({
            name: locationsTable.name,
            clientId: locationsTable.clientId,
            siteContacts: locationsTable.siteContacts,
            siteContactName: locationsTable.siteContactName,
            siteContactPhone: locationsTable.siteContactPhone,
            siteHours: locationsTable.siteHours,
            specialInstructions: locationsTable.specialInstructions,
          })
          .from(locationsTable)
          .where(eq(locationsTable.id, resolvedLocationId));
        if (location) {
          depot = location.name;
          if (!resolvedClientId) resolvedClientId = location.clientId;
          const contactParts = [location.siteContactName, location.siteContactPhone].filter(Boolean);
          locationSiteContacts = contactParts.length > 0 ? contactParts.join(" — ") : location.siteContacts;
          locationSiteHours = location.siteHours;
          locationSpecialInstructions = location.specialInstructions;
        }
      }

      // Head office users have no assigned depot/location — label their
      // submissions "Head Office" rather than "Unknown".
      if (!depot || String(depot).trim().toLowerCase() === "unknown") {
        depot = "Head Office";
      }

      if (!batteries || !Array.isArray(batteries) || batteries.length === 0) {
        res.status(400).json({ message: "At least one battery item is required" });
        return;
      }

      const batteryInputs = batteries as BatteryInput[];

      for (let i = 0; i < batteryInputs.length; i++) {
        const b = batteryInputs[i];
        if (b.isLooseCells) {
          b.voltage = null;
          // The positive-weight requirement for loose cells is enforced
          // below, after catalogue weight derivation has had a chance to
          // fill it in from the model + quantity.
        }
        if (b.rowPhoto && !b.rowPhoto.startsWith("data:image/")) {
          b.rowPhoto = null;
        }
        if (b.serialFlagReason && b.serialFlagReason !== "N/A (no serial fitted)" && !b.rowPhoto) {
          res.status(400).json({ message: `Battery row ${i + 1}: A photo is required for batteries with unknown or damaged serial numbers.` });
          return;
        }
      }

      function sanitizeWeight(val: string | number | null | undefined): string | null {
        if (val === null || val === undefined || val === "") return null;
        const parsed = parseFloat(String(val));
        if (!isFinite(parsed) || parsed < 0) return null;
        return (parsed * SAFE_LOAD_FACTOR).toFixed(3);
      }

      const knownManufacturers = new Set(
        MANUFACTURERS.filter((m) => m.toLowerCase() !== "other").map((m) => m.toLowerCase())
      );
      const allCellModels = await db
        .select({
          manufacturer: cellModelsTable.manufacturer,
          modelName: cellModelsTable.modelName,
          pbContentKgPerCell: cellModelsTable.pbContentKgPerCell,
          weightPerCellKg: cellModelsTable.weightPerCellKg,
          cellsCount: cellModelsTable.cellsCount,
        })
        .from(cellModelsTable);

      for (const b of batteryInputs) {
        const mfrStr = (b.manufacture || "").trim();
        const isUnknownMfr = mfrStr.toLowerCase() === "unknown";
        const cellTypeStr = (b.cellType || "").trim();
        const cellModelApplies = cellTypeStr !== "Blocs" && cellTypeStr !== "Other";

        if (!b.manufacturerFlagReason) {
          if (!mfrStr || isUnknownMfr) {
            b.manufacturerFlagReason = CSV_FLAG_REASON;
          } else if (!knownManufacturers.has(mfrStr.toLowerCase())) {
            b.manufacturerFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
        }

        if (cellModelApplies && cellTypeStr && allCellModels.length > 0) {
          // Match ignoring spacing/case/punctuation and canonicalise to the
          // catalogue's exact model name so downstream Pb/weight lookups hit.
          const normCell = normalizeCellKey(cellTypeStr);
          const modelMatches = allCellModels.filter(
            (m) => normalizeCellKey(m.modelName) === normCell
          );
          const preferred =
            modelMatches.find(
              (m) =>
                mfrStr && !isUnknownMfr && m.manufacturer.toLowerCase() === mfrStr.toLowerCase()
            ) ||
            modelMatches.find((m) => m.manufacturer === "TAB") ||
            modelMatches[0];
          if (preferred) {
            b.cellType = preferred.modelName;
          }
        }

        if (!b.cellModelFlagReason && cellModelApplies) {
          const finalCellType = (b.cellType || "").trim();
          if (!finalCellType) {
            b.cellModelFlagReason = CSV_FLAG_REASON;
          } else if (allCellModels.length > 0) {
            // Cell type is valid if it exists anywhere in the catalogue,
            // regardless of manufacturer — Pb/weight lookups fall back to
            // TAB figures when the manufacturer doesn't carry the model.
            const normCell = normalizeCellKey(finalCellType);
            const matches = allCellModels.some(
              (m) => normalizeCellKey(m.modelName) === normCell
            );
            if (!matches) b.cellModelFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
        }

        // Authoritative weight derivation: unless the user typed the weight
        // themselves (weightManual), re-derive it from the catalogue using
        // the canonicalised cell type. This guarantees manual entry and CSV
        // import produce identical weights for the same battery, and that a
        // row whose cell type was corrected in the form can't carry a stale
        // weight from the previously selected model.
        if (b.weightManual !== true) {
          const derived = deriveEstimatedWeightKg(
            allCellModels,
            b.manufacture || null,
            b.cellType || null,
            deriveActualCellCount({
              isLooseCells: b.isLooseCells,
              looseCellsQty: b.looseCellsQty,
              voltage: b.voltage,
            })
          );
          if (derived !== null) b.estimatedWeightKg = derived;
        }
      }

      // Loose cells must end up with a positive weight — either supplied by
      // the user or derived from the catalogue above.
      for (let i = 0; i < batteryInputs.length; i++) {
        const b = batteryInputs[i];
        if (b.isLooseCells) {
          const w = b.estimatedWeightKg;
          const parsed = w !== null && w !== undefined && w !== "" ? parseFloat(String(w)) : NaN;
          if (!isFinite(parsed) || parsed <= 0) {
            res.status(400).json({ message: `Battery row ${i + 1}: Estimated weight is required for loose cells and must be a positive number.` });
            return;
          }
        }
      }

      let autoTonnage = 0;
      let rawWeightKg = 0;
      for (const b of batteryInputs) {
        const w = sanitizeWeight(b.estimatedWeightKg);
        if (w !== null) autoTonnage += parseFloat(w);
        const raw = parseFloat(String(b.estimatedWeightKg ?? ""));
        if (isFinite(raw) && raw > 0) rawWeightKg += raw;
      }
      const autoTonnageStr = (autoTonnage / 1000).toFixed(3);
      const parsedTonnage = tonnage ? parseFloat(String(tonnage)) : NaN;
      const finalTonnage = (tonnageManualOverride && !isNaN(parsedTonnage) && isFinite(parsedTonnage) && parsedTonnage >= 0)
        ? String(parsedTonnage)
        : autoTonnageStr;

      // Loads under 10t are allowed (a transportation charge applies —
      // the portal shows a notice instead of blocking submission).
      // The 26t truck capacity applies to the gross load (lead x 1.4) — the
      // same figure shown to depot users (client-confirmed 30 July 2026).
      const MAX_TONNAGE = 26.0;
      const effectiveLoadT = (tonnageManualOverride && isFinite(parsedTonnage) && parsedTonnage >= 0)
        ? parsedTonnage
        : autoTonnage / 1000;
      if (isFinite(effectiveLoadT) && effectiveLoadT > MAX_TONNAGE) {
        res.status(400).json({ message: `Maximum collection weight is ${MAX_TONNAGE}t. Current load is ${effectiveLoadT.toFixed(3)}t.` });
        return;
      }

      const result = await db.transaction(async (tx) => {
        // Serialise reference generation so two simultaneous submissions
        // can't compute the same running number (lock releases at commit).
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('job_reference_seq'))`);
        // Global running sequence: continue from the highest numeric suffix
        // across all existing references (old JOB-YYYY-NNNNN and new
        // JOB-MMYY-NNNNN formats both end in a 5-digit number).
        const maxSeqResult = await tx.execute(
          sql`SELECT COALESCE(MAX((regexp_match(reference, '(\\d{5})$'))[1]::int), 0) AS max_seq FROM jobs`
        );
        const maxSeq = Number((maxSeqResult.rows?.[0] as { max_seq?: unknown })?.max_seq) || 0;
        const nextNum = maxSeq + 1;
        const now = new Date();
        const mmyy =
          String(now.getMonth() + 1).padStart(2, "0") +
          String(now.getFullYear() % 100).padStart(2, "0");
        const reference = `JOB-${mmyy}-${String(nextNum).padStart(5, "0")}`;

        let latestLmeGbpPrice: number | null = null;
        const [latestLme] = await tx
          .select({ gbpPrice: lmePricesTable.gbpPrice })
          .from(lmePricesTable)
          .orderBy(desc(lmePricesTable.createdAt))
          .limit(1);
        if (latestLme) {
          const parsed = parseFloat(latestLme.gbpPrice);
          if (isFinite(parsed) && parsed > 0) latestLmeGbpPrice = parsed;
        }

        const [job] = await tx
          .insert(jobsTable)
          .values({
            reference,
            clientName,
            depot,
            clientId: resolvedClientId,
            locationId: resolvedLocationId,
            collectionPoint: collectionPoint || null,
            collectionDate: collectionDate || null,
            tonnage: finalTonnage,
            tonnageManualOverride: !!(tonnageManualOverride && !isNaN(parsedTonnage) && isFinite(parsedTonnage) && parsedTonnage >= 0),
            status: "request",
            notes: notes || null,
            submittedById: req.user!.id,
            lmeRateUsed: latestLmeGbpPrice !== null ? String(latestLmeGbpPrice) : null,
            siteContacts: locationSiteContacts,
            siteHours: locationSiteHours,
            specialInstructions: locationSpecialInstructions,
          })
          .returning();

        const batteryRows = batteryInputs.map((b) => {
          // Same fallback as flag correction: exact manufacturer, then TAB
          // (client convention for Unknown/unlisted manufacturers), then any.
          const pbContentKg = derivePbContentKg(
            allCellModels,
            b.manufacture || null,
            b.cellType || null,
            deriveActualCellCount({
              isLooseCells: b.isLooseCells,
              looseCellsQty: b.looseCellsQty,
              voltage: b.voltage,
            })
          );
          let valueGbp: string | null = null;
          if (pbContentKg && latestLmeGbpPrice !== null) {
            const val = (parseFloat(pbContentKg) * latestLmeGbpPrice) / 1000;
            if (isFinite(val)) valueGbp = val.toFixed(2);
          }
          return {
            jobId: job.id,
            palletNumber: b.palletNumber || null,
            assetNumber: b.assetNumber || null,
            batterySerial: b.batterySerial || null,
            manufacture: b.manufacture || null,
            cellType: b.cellType || null,
            voltage: b.isLooseCells ? null : (b.voltage || null),
            looseCellsQty: b.looseCellsQty ? parseInt(String(b.looseCellsQty), 10) : null,
            estimatedWeightKg: sanitizeWeight(b.estimatedWeightKg),
            weightManual: b.weightManual === true,
            isLooseCells: b.isLooseCells || false,
            serialFlagReason: b.serialFlagReason || null,
            manufacturerFlagReason: b.manufacturerFlagReason || null,
            cellModelFlagReason: b.cellModelFlagReason || null,
            voltageFlagReason: b.voltageFlagReason || null,
            manufacturerCorrectionConfidence: b.manufacturerCorrectionConfidence || null,
            cellModelCorrectionConfidence: b.cellModelCorrectionConfidence || null,
            voltageCorrectionConfidence: b.voltageCorrectionConfidence || null,
            rowPhoto: b.rowPhoto || null,
            // AI correction audit payload (not stored in job_batteries, used for audit log only)

            notes: b.notes || null,
            pbContentKg,
            valueGbp,
          };
        });

        const insertedBatteries = await tx
          .insert(jobBatteriesTable)
          .values(batteryRows)
          .returning();

        return { job, batteries: insertedBatteries };
      });

      res.status(201).json(result);

      // Fire-and-forget: write AI correction audit log entries
      setImmediate(async () => {
        try {
          const auditRows: Array<typeof correctionAuditLogTable.$inferInsert> = [];
          for (const b of batteryInputs) {
            if (b.manufacturerSuggestedValue != null && b.manufacturerWasAccepted != null) {
              auditRows.push({
                jobReference: result.job.reference,
                fieldName: "manufacturer",
                originalValue: b.manufacturerOriginalValue || null,
                suggestedValue: b.manufacturerSuggestedValue,
                wasAccepted: b.manufacturerWasAccepted,
                confidenceLevel: b.manufacturerCorrectionConfidence || null,
                submittedByName: req.user!.fullName,
              });
            }
            if (b.cellModelSuggestedValue != null && b.cellModelWasAccepted != null) {
              auditRows.push({
                jobReference: result.job.reference,
                fieldName: "cellModel",
                originalValue: b.cellModelOriginalValue || null,
                suggestedValue: b.cellModelSuggestedValue,
                wasAccepted: b.cellModelWasAccepted,
                confidenceLevel: b.cellModelCorrectionConfidence || null,
                submittedByName: req.user!.fullName,
              });
            }
            if (b.voltageSuggestedValue != null && b.voltageWasAccepted != null) {
              auditRows.push({
                jobReference: result.job.reference,
                fieldName: "voltage",
                originalValue: b.voltageOriginalValue || null,
                suggestedValue: b.voltageSuggestedValue,
                wasAccepted: b.voltageWasAccepted,
                confidenceLevel: b.voltageCorrectionConfidence || null,
                submittedByName: req.user!.fullName,
              });
            }
          }
          if (auditRows.length > 0) {
            await db.insert(correctionAuditLogTable).values(auditRows);
          }
        } catch (auditErr) {
          console.error("Correction audit log error:", auditErr);
        }
      });

      if (draftId) {
        const draftIdNum = parseInt(String(draftId), 10);
        if (!isNaN(draftIdNum)) {
          const submitter = req.user!;
          const [draftRow] = await db.select().from(jobDraftsTable).where(eq(jobDraftsTable.id, draftIdNum));
          if (draftRow) {
            const role = submitter.role;
            const canDelete =
              role === "head_office_admin" ||
              role === "accounts" ||
              (role === "team_leader" && draftRow.clientId === submitter.clientId) ||
              (role === "depot_user" && draftRow.depot === submitter.depot && draftRow.clientId === submitter.clientId);
            if (canDelete) {
              await db.delete(jobDraftsTable).where(eq(jobDraftsTable.id, draftIdNum));
            }
          }
        }
      }

      const flaggedCount = result.batteries.filter(
        b => b.serialFlagReason || b.manufacturerFlagReason || b.cellModelFlagReason
      ).length;

      const jobForNotify = {
        ...result.job,
        submittedById: req.user!.id,
      };

      notifyAdminsNewJob(jobForNotify).catch(() => {});
      if (flaggedCount > 0) {
        notifyAdminsFlaggedBatteries(jobForNotify, flaggedCount).catch(() => {});
      }

      // Assign the default (first active) collection company and let them
      // know a new collection needs scheduling.
      try {
        const [defaultCompany] = await db
          .select({ id: collectionCompaniesTable.id })
          .from(collectionCompaniesTable)
          .where(eq(collectionCompaniesTable.isActive, true))
          .orderBy(collectionCompaniesTable.id)
          .limit(1);
        if (defaultCompany) {
          await db
            .update(jobsTable)
            .set({ collectionCompanyId: defaultCompany.id })
            .where(eq(jobsTable.id, result.job.id));
          notifyCollectionCompanyNewJob(jobForNotify, defaultCompany.id).catch(() => {});
        }
      } catch (assignErr) {
        console.error("Failed to assign collection company to new job:", assignErr);
      }
    } catch (error) {
      console.error("Job creation error:", error);
      const pgErr = (error as { cause?: { code?: string; detail?: string; constraint?: string } })?.cause
        ?? (error as { code?: string; detail?: string; constraint?: string });
      if (pgErr?.code === "23505") {
        const detailMatch = typeof pgErr.detail === "string"
          ? pgErr.detail.match(/Key \((.+?)\)=\((.+?)\)/)
          : null;
        const fieldLabel = detailMatch
          ? detailMatch[1].replace(/_/g, " ")
          : "a value";
        const message = detailMatch
          ? `Submission failed: the ${fieldLabel} "${detailMatch[2]}" conflicts with an existing record. Please review and try again.`
          : "Submission failed: a value in this submission conflicts with an existing record. Please review and try again.";
        res.status(409).json({ message });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/jobs/:id/batteries",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) return void res.status(400).json({ message: "Invalid job ID" });
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) return void res.status(404).json({ message: "Job not found" });
      if (job.receiptSentAt) return void res.status(409).json({ message: "Rows cannot be added after completed receipt documents have been sent" });

      const clean = (value: unknown) => {
        const text = String(value ?? "").trim();
        return text || null;
      };
      const estimatedWeight = Number(req.body.estimatedWeightKg);
      if (!Number.isFinite(estimatedWeight) || estimatedWeight <= 0) {
        return void res.status(400).json({ message: "Enter a valid estimated weight in kg" });
      }
      if (![req.body.palletNumber, req.body.assetNumber, req.body.batterySerial, req.body.cellType].some(clean)) {
        return void res.status(400).json({ message: "Enter at least a pallet, asset, serial, or cell type" });
      }

      const battery = await db.transaction(async (tx) => {
        const [created] = await tx.insert(jobBatteriesTable).values({
          jobId,
          palletNumber: clean(req.body.palletNumber),
          assetNumber: clean(req.body.assetNumber),
          batterySerial: clean(req.body.batterySerial),
          manufacture: clean(req.body.manufacture),
          cellType: clean(req.body.cellType),
          voltage: clean(req.body.voltage),
          notes: clean(req.body.notes),
          estimatedWeightKg: estimatedWeight.toFixed(3),
          weightManual: true,
          receiptConfirmed: false,
          receiptReviewed: false,
          resolvedById: req.user!.id,
          resolvedAt: new Date(),
        }).returning();
        if (job.tonnageManualOverride !== true) {
          const rows = await tx.select({ weight: jobBatteriesTable.estimatedWeightKg })
            .from(jobBatteriesTable).where(eq(jobBatteriesTable.jobId, jobId));
          const totalKg = rows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
          await tx.update(jobsTable).set({ tonnage: (totalKg / 1000).toFixed(3) }).where(eq(jobsTable.id, jobId));
        }
        return created;
      });
      const [updatedJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      res.status(201).json({ battery, job: updatedJob });
    } catch (error) {
      console.error("Add job battery error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/jobs/:id/batteries/:batteryId",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      const batteryId = parseInt(String(req.params.batteryId), 10);
      if (isNaN(jobId) || isNaN(batteryId)) return void res.status(400).json({ message: "Invalid ID" });
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) return void res.status(404).json({ message: "Job not found" });
      if (job.receiptSentAt) return void res.status(409).json({ message: "Rows cannot be removed after completed receipt documents have been sent" });

      await db.transaction(async (tx) => {
        const [deleted] = await tx.delete(jobBatteriesTable)
          .where(and(eq(jobBatteriesTable.id, batteryId), eq(jobBatteriesTable.jobId, jobId))).returning();
        if (!deleted) throw new Error("BATTERY_NOT_FOUND");
        if (job.tonnageManualOverride !== true) {
          const rows = await tx.select({ weight: jobBatteriesTable.estimatedWeightKg })
            .from(jobBatteriesTable).where(eq(jobBatteriesTable.jobId, jobId));
          const totalKg = rows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
          await tx.update(jobsTable).set({ tonnage: (totalKg / 1000).toFixed(3) }).where(eq(jobsTable.id, jobId));
        }
      });
      const [updatedJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      res.json({ job: updatedJob });
    } catch (error) {
      if (error instanceof Error && error.message === "BATTERY_NOT_FOUND") return void res.status(404).json({ message: "Battery not found" });
      console.error("Remove job battery error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/jobs/:id/batteries/auto-confirm",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }

      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      const pending = await db
        .select()
        .from(jobBatteriesTable)
        .where(and(
          eq(jobBatteriesTable.jobId, jobId),
          sql`${jobBatteriesTable.receiptConfirmed} IS DISTINCT FROM TRUE`
        ));

      if (pending.length === 0) {
        const batteries = await db
          .select()
          .from(jobBatteriesTable)
          .where(eq(jobBatteriesTable.jobId, jobId))
          .orderBy(asc(jobBatteriesTable.id));
        res.json({ confirmedCount: 0, batteries, job });
        return;
      }

      const catalogue = await db
        .select({
          manufacturer: cellModelsTable.manufacturer,
          modelName: cellModelsTable.modelName,
          pbContentKgPerCell: cellModelsTable.pbContentKgPerCell,
          weightPerCellKg: cellModelsTable.weightPerCellKg,
          cellsCount: cellModelsTable.cellsCount,
        })
        .from(cellModelsTable);

      const prepared = pending.map((battery) => {
        const cellCount = deriveActualCellCount({
          isLooseCells: battery.isLooseCells,
          looseCellsQty: battery.looseCellsQty,
          voltage: battery.voltage,
        });
        return {
          battery,
          tabWeightKg: deriveTabGrossWeightKg(catalogue, battery.cellType, cellCount),
        };
      });
      const missing = prepared.filter((item) => item.tabWeightKg === null);
      if (missing.length > 0) {
        const labels = missing
          .slice(0, 5)
          .map(({ battery }) => battery.batterySerial || battery.assetNumber || battery.palletNumber || `item ${battery.id}`);
        const extra = missing.length > labels.length ? ` and ${missing.length - labels.length} more` : "";
        res.status(422).json({
          message: `Cannot auto-confirm because no TAB weight could be found for ${labels.join(", ")}${extra}. Confirm these items individually.`,
        });
        return;
      }

      await db.transaction(async (tx) => {
        for (const { battery, tabWeightKg } of prepared) {
          await tx
            .update(jobBatteriesTable)
            .set({
              receiptConfirmed: true,
              receiptReviewed: true,
              estimatedWeightKg: tabWeightKg!,
              weightManual: false,
            })
            .where(and(
              eq(jobBatteriesTable.id, battery.id),
              eq(jobBatteriesTable.jobId, jobId)
            ));
        }

        if (job.tonnageManualOverride !== true) {
          const rows = await tx
            .select({ estimatedWeightKg: jobBatteriesTable.estimatedWeightKg })
            .from(jobBatteriesTable)
            .where(eq(jobBatteriesTable.jobId, jobId));
          const totalKg = rows.reduce((sum, row) => {
            const weight = parseFloat(String(row.estimatedWeightKg ?? ""));
            return sum + (isFinite(weight) && weight > 0 ? weight : 0);
          }, 0);
          await tx
            .update(jobsTable)
            .set({ tonnage: (totalKg / 1000).toFixed(3) })
            .where(eq(jobsTable.id, jobId));
        }
      });

      const batteries = await db
        .select()
        .from(jobBatteriesTable)
        .where(eq(jobBatteriesTable.jobId, jobId))
        .orderBy(asc(jobBatteriesTable.id));
      const [updatedJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      res.json({ confirmedCount: pending.length, batteries, job: updatedJob });
    } catch (error) {
      console.error("Auto-confirm batteries error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/jobs/:id/admin",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }

      const {
        cblLmeValue, cblLmePercent, cblLmePrice, transportCost,
        customerLmePercent, customerInvoiceValue, customerInvoiceNo, cblWasteAdviceNoteNo,
        cblDate, totalInvoiceValue, grossProfit, itiniumInvoiceNo,
        tonnage, lmeRateUsed, calculatedValue, invoiceStatus,
        invoiceReceivedDate, dueDate, datePaid,
        siteContacts, siteHours, specialInstructions,
        collectionDate,
      } = req.body;

      const toDecimal = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;
      const toStr = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;

      const updates: Partial<Record<string, string | number | null>> = {};
      if (cblLmeValue !== undefined) updates.cblLmeValue = toDecimal(cblLmeValue);
      if (cblLmePercent !== undefined) updates.cblLmePercent = toDecimal(cblLmePercent);
      if (cblLmePrice !== undefined) updates.cblLmePrice = toDecimal(cblLmePrice);
      if (transportCost !== undefined) updates.transportCost = toDecimal(transportCost);
      if (customerLmePercent !== undefined) updates.customerLmePercent = toDecimal(customerLmePercent);
      if (customerInvoiceValue !== undefined) updates.customerInvoiceValue = toDecimal(customerInvoiceValue);
      if (customerInvoiceNo !== undefined) updates.customerInvoiceNo = toStr(customerInvoiceNo);
      if (cblWasteAdviceNoteNo !== undefined) updates.cblWasteAdviceNoteNo = toStr(cblWasteAdviceNoteNo);
      if (cblDate !== undefined) updates.cblDate = toStr(cblDate);
      if (totalInvoiceValue !== undefined) updates.totalInvoiceValue = toDecimal(totalInvoiceValue);
      if (grossProfit !== undefined) updates.grossProfit = toDecimal(grossProfit);
      if (itiniumInvoiceNo !== undefined) updates.itiniumInvoiceNo = toStr(itiniumInvoiceNo);
      if (tonnage !== undefined) updates.tonnage = toDecimal(tonnage);
      if (lmeRateUsed !== undefined) updates.lmeRateUsed = toDecimal(lmeRateUsed);
      if (calculatedValue !== undefined) updates.calculatedValue = toDecimal(calculatedValue);
      if (siteContacts !== undefined) updates.siteContacts = toStr(siteContacts);
      if (siteHours !== undefined) updates.siteHours = toStr(siteHours);
      if (specialInstructions !== undefined) updates.specialInstructions = toStr(specialInstructions);
      const isValidDate = (v: unknown): boolean => {
        if (!v || typeof v !== "string") return false;
        const match = /^\d{4}-\d{2}-\d{2}$/.test(v);
        if (!match) return false;
        const d = new Date(v);
        return !isNaN(d.getTime());
      };

      if (collectionDate !== undefined) {
        if (collectionDate && !isValidDate(collectionDate)) {
          res.status(400).json({ message: "Invalid collectionDate format (YYYY-MM-DD)" });
          return;
        }
        updates.collectionDate = toStr(collectionDate);
      }
      if (invoiceReceivedDate !== undefined) {
        if (invoiceReceivedDate && !isValidDate(invoiceReceivedDate)) {
          res.status(400).json({ message: "Invalid invoiceReceivedDate format (YYYY-MM-DD)" });
          return;
        }
        updates.invoiceReceivedDate = toStr(invoiceReceivedDate);
      }
      if (dueDate !== undefined) {
        if (dueDate && !isValidDate(dueDate)) {
          res.status(400).json({ message: "Invalid dueDate format (YYYY-MM-DD)" });
          return;
        }
        updates.dueDate = toStr(dueDate);
      }
      if (datePaid !== undefined) {
        if (datePaid && !isValidDate(datePaid)) {
          res.status(400).json({ message: "Invalid datePaid format (YYYY-MM-DD)" });
          return;
        }
        updates.datePaid = toStr(datePaid);
      }

      if (datePaid && toStr(datePaid)) {
        const [existingJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
        if (existingJob) {
          const effectiveInvoiceReceivedDate = (invoiceReceivedDate !== undefined ? toStr(invoiceReceivedDate) : existingJob.invoiceReceivedDate);
          const referenceDate = effectiveInvoiceReceivedDate || existingJob.collectionDate;
          if (referenceDate) {
            const paidDate = new Date(datePaid);
            const refDate = new Date(referenceDate);
            const diffMs = paidDate.getTime() - refDate.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            updates.daysToPay = diffDays;
          }
        }
        updates.invoiceStatus = "paid";
      } else if (datePaid !== undefined && !toStr(datePaid)) {
        updates.daysToPay = null;
        if (invoiceStatus === undefined) {
          updates.invoiceStatus = "invoiced";
        }
      }

      if (invoiceStatus !== undefined && !(datePaid && toStr(datePaid))) {
        updates.invoiceStatus = toStr(invoiceStatus);
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const [updated] = await db
        .update(jobsTable)
        .set(updates)
        .where(eq(jobsTable.id, jobId))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      res.json({ job: updated });
    } catch (error) {
      console.error("Job admin update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

type DeliveryRecipient = { id: number; email: string; fullName: string };

async function resolveReceiptDeliveryRecipients(job: typeof jobsTable.$inferSelect): Promise<{
  clientRecipients: DeliveryRecipient[];
  accountsRecipients: DeliveryRecipient[];
}> {
  const accountsRecipients = await db
    .select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
    .from(usersTable)
    .where(and(eq(usersTable.role, "accounts"), eq(usersTable.isActive, true)));

  if (!job.clientId) return { clientRecipients: [], accountsRecipients };
  const teamLeaders = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      locationId: usersTable.locationId,
      depot: usersTable.depot,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.role, "team_leader"),
      eq(usersTable.clientId, job.clientId),
      eq(usersTable.isActive, true)
    ));

  const selected = selectClientReceiptRecipients(teamLeaders, job.locationId, job.depot);
  return {
    clientRecipients: selected.map(({ id, email, fullName }) => ({ id, email, fullName })),
    accountsRecipients,
  };
}

function toReceiptSnapshot(battery: typeof jobBatteriesTable.$inferSelect): ReceiptItemSnapshot {
  return {
    palletNumber: battery.palletNumber,
    assetNumber: battery.assetNumber,
    batterySerial: battery.batterySerial,
    manufacture: battery.manufacture,
    cellType: battery.cellType,
    voltage: battery.voltage,
    looseCellsQty: battery.looseCellsQty,
    receiptConfirmed: battery.receiptConfirmed === true,
    adminNotes: battery.adminNotes,
    valueGbp: battery.valueGbp,
    receiptReviewed: battery.receiptReviewed,
  };
}

router.get(
  "/jobs/:id/receipt-delivery",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }
      const batteries = await db.select().from(jobBatteriesTable).where(eq(jobBatteriesTable.jobId, job.id));
      const items = batteries.map(toReceiptSnapshot);
      const { clientRecipients, accountsRecipients } = await resolveReceiptDeliveryRecipients(job);
      res.json({
        ready: isReceiptReviewComplete(items),
        reviewedCount: items.filter((item) => item.receiptReviewed).length,
        totalCount: items.length,
        totalValue: job.receiptValueSnapshot || calculateReceiptValue(items),
        clientRecipients: clientRecipients.map(({ email, fullName }) => ({ email, fullName })),
        accountsRecipients: accountsRecipients.map(({ email, fullName }) => ({ email, fullName })),
        sentAt: job.receiptSentAt,
        sentById: job.receiptSentById,
        clientStatus: job.receiptClientDeliveryStatus,
        accountsStatus: job.receiptAccountsDeliveryStatus,
      });
    } catch (error) {
      console.error("Receipt delivery preview error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/jobs/:id/receipt-delivery",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }
      const resend = req.body?.resend === true;
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }
      const batteries = await db.select().from(jobBatteriesTable).where(eq(jobBatteriesTable.jobId, job.id));
      const currentItems = batteries.map(toReceiptSnapshot);
      if (!isReceiptReviewComplete(currentItems)) {
        res.status(400).json({ message: "Every item must be reviewed and saved before documents can be sent" });
        return;
      }
      if (
        !resend
        && job.receiptClientDeliveryStatus === "sent"
        && job.receiptAccountsDeliveryStatus === "sent"
      ) {
        res.status(409).json({ message: "These documents have already been sent. Use Resend documents to send them again." });
        return;
      }
      if (
        job.receiptClientDeliveryStatus === "sending"
        || job.receiptAccountsDeliveryStatus === "sending"
      ) {
        res.status(409).json({ message: "Document delivery is already in progress" });
        return;
      }

      const { clientRecipients, accountsRecipients } = await resolveReceiptDeliveryRecipients(job);
      if (clientRecipients.length === 0) {
        res.status(400).json({ message: "No active team leader is linked to this client or depot" });
        return;
      }
      if (accountsRecipients.length === 0) {
        res.status(400).json({ message: "No active accounts users are available" });
        return;
      }

      const storedItems = Array.isArray(job.receiptSnapshot)
        ? job.receiptSnapshot as ReceiptItemSnapshot[]
        : currentItems;
      const totalValue = job.receiptValueSnapshot || calculateReceiptValue(storedItems);
      const jobSnapshot = {
        reference: job.reference,
        clientName: job.clientName,
        depot: job.depot,
        collectionPoint: job.collectionPoint,
        collectionDate: job.collectionDate,
      };

      const { sendClient, sendAccounts } = getDeliveryTargets(
        job.receiptClientDeliveryStatus,
        job.receiptAccountsDeliveryStatus,
        resend
      );

      const claimed = await db.update(jobsTable).set({
        receiptSnapshot: storedItems,
        receiptValueSnapshot: totalValue,
        receiptSentById: req.user!.id,
        receiptClientRecipients: clientRecipients.map(({ email, fullName }) => ({ email, fullName })),
        receiptAccountsRecipients: accountsRecipients.map(({ email, fullName }) => ({ email, fullName })),
        ...(sendClient ? { receiptClientDeliveryStatus: "sending" } : {}),
        ...(sendAccounts ? { receiptAccountsDeliveryStatus: "sending" } : {}),
      }).where(and(
        eq(jobsTable.id, job.id),
        sql`COALESCE(${jobsTable.receiptClientDeliveryStatus}, '') <> 'sending'`,
        sql`COALESCE(${jobsTable.receiptAccountsDeliveryStatus}, '') <> 'sending'`
      )).returning({ id: jobsTable.id });
      if (claimed.length === 0) {
        res.status(409).json({ message: "Document delivery is already in progress" });
        return;
      }

      let clientResult = null;
      let accountsResult = null;
      try {
        const [clientPdf, accountsPdf] = await Promise.all([
          sendClient ? generateClientReceiptPdf(jobSnapshot, storedItems) : Promise.resolve(null),
          sendAccounts ? generateAccountsCompletionPdf(jobSnapshot, totalValue) : Promise.resolve(null),
        ]);
        [clientResult, accountsResult] = await Promise.all([
          sendClient && clientPdf
            ? sendCompletedReceiptToClient(clientRecipients, job, clientPdf)
            : Promise.resolve(null),
          sendAccounts && accountsPdf
            ? sendJobValueToAccounts(accountsRecipients, job, totalValue, accountsPdf)
            : Promise.resolve(null),
        ]);
      } catch (deliveryError) {
        await db.update(jobsTable).set({
          ...(sendClient ? { receiptClientDeliveryStatus: "failed" } : {}),
          ...(sendAccounts ? { receiptAccountsDeliveryStatus: "failed" } : {}),
        }).where(eq(jobsTable.id, job.id));
        throw deliveryError;
      }

      const clientStatus = !sendClient
        ? job.receiptClientDeliveryStatus
        : clientResult?.failed.length === 0 ? "sent" : "failed";
      const accountsStatus = !sendAccounts
        ? job.receiptAccountsDeliveryStatus
        : accountsResult?.failed.length === 0 ? "sent" : "failed";
      const allSent = clientStatus === "sent" && accountsStatus === "sent";
      const [updated] = await db.update(jobsTable).set({
        receiptClientDeliveryStatus: clientStatus,
        receiptAccountsDeliveryStatus: accountsStatus,
        receiptSentAt: allSent ? new Date() : null,
      }).where(eq(jobsTable.id, job.id)).returning();

      res.status(allSent ? 200 : 502).json({
        message: allSent
          ? "Completed receipt and accounts document sent"
          : "Some emails could not be sent. You can retry the failed deliveries.",
        job: updated,
        clientResult,
        accountsResult,
      });
    } catch (error) {
      console.error("Receipt delivery error:", error);
      res.status(500).json({ message: "Failed to send completed receipt documents" });
    }
  }
);

router.patch(
  "/jobs/:id/status",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }

      const { status } = req.body;
      const validStatuses = ["request", "confirmed", "received", "invoice", "awaiting_invoice", "completed"];
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({ message: "Invalid status. Must be one of: " + validStatuses.join(", ") });
        return;
      }

      const [updated] = await db
        .update(jobsTable)
        .set({ status })
        .where(eq(jobsTable.id, jobId))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      res.json({ job: updated });

      notifySubmitterStatusChange(updated, status).catch(() => {});

    } catch (error) {
      console.error("Job status update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/jobs/:id/batteries/:batteryId/admin",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      const batteryId = parseInt(String(req.params.batteryId), 10);
      if (isNaN(jobId) || isNaN(batteryId)) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const {
        receiptConfirmed,
        pbContentKg,
        valueGbp,
        adminNotes,
        palletNumber,
        assetNumber,
        manufacture,
        cellType,
        voltage,
        batterySerial,
        looseCellsQty,
        notes,
        clearSerialFlag,
      } = req.body;

      const toDecimal = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;
      const toTrimmedStr = (v: unknown): string | null => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      };

      const updates: Record<string, string | boolean | number | Date | null> = {};
      if (receiptConfirmed !== undefined) {
        updates.receiptConfirmed = receiptConfirmed === true || receiptConfirmed === "true";
        updates.receiptReviewed = true;
      }
      if (pbContentKg !== undefined) updates.pbContentKg = toDecimal(pbContentKg);
      if (valueGbp !== undefined) updates.valueGbp = toDecimal(valueGbp);
      if (adminNotes !== undefined) updates.adminNotes = adminNotes !== null && adminNotes !== undefined && adminNotes !== "" ? String(adminNotes) : null;
      if (palletNumber !== undefined) updates.palletNumber = toTrimmedStr(palletNumber);
      if (assetNumber !== undefined) updates.assetNumber = toTrimmedStr(assetNumber);
      if (notes !== undefined) updates.notes = toTrimmedStr(notes);

      const [existing] = await db
        .select()
        .from(jobBatteriesTable)
        .where(and(eq(jobBatteriesTable.id, batteryId), eq(jobBatteriesTable.jobId, jobId)));
      if (!existing) {
        res.status(404).json({ message: "Battery not found" });
        return;
      }

      let clearedAnyFlag = false;
      if (batterySerial !== undefined) {
        const v = toTrimmedStr(batterySerial);
        updates.batterySerial = v;
        if (v !== null) {
          updates.serialFlagReason = null;
          if (existing.serialFlagReason) clearedAnyFlag = true;
        }
      }
      if (clearSerialFlag === true || clearSerialFlag === "true") {
        updates.serialFlagReason = null;
        if (existing.serialFlagReason) clearedAnyFlag = true;
      }
      if (looseCellsQty !== undefined) {
        const trimmed = String(looseCellsQty ?? "").trim();
        if (trimmed === "") {
          updates.looseCellsQty = null;
        } else {
          const qty = Number(trimmed);
          if (!Number.isInteger(qty) || qty < 0) {
            res.status(400).json({ message: "Loose quantity must be a whole number of zero or more" });
            return;
          }
          updates.looseCellsQty = qty;
        }
      }

      if (manufacture !== undefined) {
        const v = toTrimmedStr(manufacture);
        updates.manufacture = v;
        if (v !== null) {
          updates.manufacturerFlagReason = null;
          if (existing.manufacturerFlagReason) clearedAnyFlag = true;
        }
      }
      if (cellType !== undefined) {
        let v = toTrimmedStr(cellType);
        // Canonicalise to the catalogue's exact model name so spacing/case
        // variants ("5EPzS775" vs "5 EPzS 775") resolve consistently and
        // downstream Pb/weight lookups hit.
        if (v !== null && v !== "Blocs" && v !== "Other") {
          const catalogue = await db
            .select({
              manufacturer: cellModelsTable.manufacturer,
              modelName: cellModelsTable.modelName,
            })
            .from(cellModelsTable);
          const normV = normalizeCellKey(v);
          const modelMatches = catalogue.filter(
            (m) => normalizeCellKey(m.modelName) === normV
          );
          const effMfr = (typeof manufacture === "string" ? manufacture.trim() : "") || (existing.manufacture || "").trim();
          const preferred =
            modelMatches.find(
              (m) => effMfr && m.manufacturer.toLowerCase() === effMfr.toLowerCase()
            ) ||
            modelMatches.find((m) => m.manufacturer === "TAB") ||
            modelMatches[0];
          if (preferred) v = preferred.modelName;
        }
        updates.cellType = v;
        if (v !== null) {
          updates.cellModelFlagReason = null;
          if (existing.cellModelFlagReason) clearedAnyFlag = true;
        }
      }

      // When the cell type, manufacturer or voltage is corrected, re-derive
      // the estimated weight and — unless the caller explicitly set
      // pbContentKg themselves — the Pb content (and £ value) from the
      // catalogue. Leave existing values untouched when the catalogue has no
      // data for the corrected model. Weight derivation is deliberately
      // independent of a manual Pb value: a correction that supplies Pb must
      // still not leave a stale weight from the old model behind (the +67kg
      // manual-vs-CSV discrepancy Ingrid reported).
      if (cellType !== undefined || manufacture !== undefined || voltage !== undefined || looseCellsQty !== undefined) {
        const finalCellType =
          (updates.cellType as string | null | undefined) !== undefined
            ? (updates.cellType as string | null)
            : existing.cellType;
        const finalMfr =
          (updates.manufacture as string | null | undefined) !== undefined
            ? (updates.manufacture as string | null)
            : existing.manufacture;
        const finalVoltage =
          voltage !== undefined ? toTrimmedStr(voltage) : existing.voltage;
        const pbCatalogue = await db
          .select({
            manufacturer: cellModelsTable.manufacturer,
            modelName: cellModelsTable.modelName,
            pbContentKgPerCell: cellModelsTable.pbContentKgPerCell,
            weightPerCellKg: cellModelsTable.weightPerCellKg,
            cellsCount: cellModelsTable.cellsCount,
          })
          .from(cellModelsTable);
        const finalLooseCellsQty =
          looseCellsQty !== undefined
            ? (updates.looseCellsQty as number | null)
            : existing.looseCellsQty;
        const cellCount = deriveActualCellCount({
          isLooseCells: existing.isLooseCells,
          looseCellsQty: finalLooseCellsQty,
          voltage: finalVoltage,
        });
        if (pbContentKg === undefined) {
          const derivedPb = derivePbContentKg(pbCatalogue, finalMfr, finalCellType, cellCount);
          if (derivedPb !== null) {
            updates.pbContentKg = derivedPb;
            if (valueGbp === undefined) {
              const [parentJob] = await db
                .select({ cblLmeValue: jobsTable.cblLmeValue })
                .from(jobsTable)
                .where(eq(jobsTable.id, jobId));
              const rate = await getEffectiveLmeRateForJob(parentJob?.cblLmeValue ?? null);
              if (rate !== null) {
                const val = (parseFloat(derivedPb) * rate) / 1000;
                if (isFinite(val)) updates.valueGbp = val.toFixed(2);
              }
            }
          }
        }
        // Stored weights are gross (raw catalogue weight x 1.4 safe-load).
        // Rows whose weight was supplied by the user (weightManual) are
        // never overwritten by automatic re-derivation.
        if (existing.weightManual !== true) {
          const derivedWeight = deriveEstimatedWeightKg(pbCatalogue, finalMfr, finalCellType, cellCount);
          if (derivedWeight !== null) {
            updates.estimatedWeightKg = (parseFloat(derivedWeight) * SAFE_LOAD_FACTOR).toFixed(3);
          }
        }
      }
      if (voltage !== undefined) {
        const v = toTrimmedStr(voltage);
        updates.voltage = v;
        if (v !== null) {
          updates.voltageFlagReason = null;
          if (existing.voltageFlagReason) clearedAnyFlag = true;
        }
      }

      if (clearedAnyFlag) {
        updates.resolvedById = req.user!.id;
        updates.resolvedAt = new Date();
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const [updated] = await db
        .update(jobBatteriesTable)
        .set(updates)
        .where(and(eq(jobBatteriesTable.id, batteryId), eq(jobBatteriesTable.jobId, jobId)))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Battery not found" });
        return;
      }

      // Keep the job's tonnage in sync when a row's weight was re-derived —
      // otherwise a corrected cell type would fix the row but leave the job
      // total (and downstream reports/PDFs) showing the old weight. Only do
      // this when the current tonnage still equals the previous sum of row
      // weights (i.e. it was auto-derived): a manually overridden tonnage
      // must never be silently replaced.
      if (
        updates.estimatedWeightKg !== undefined &&
        String(updates.estimatedWeightKg ?? "") !== String(existing.estimatedWeightKg ?? "")
      ) {
        const rows = await db
          .select({ id: jobBatteriesTable.id, estimatedWeightKg: jobBatteriesTable.estimatedWeightKg })
          .from(jobBatteriesTable)
          .where(eq(jobBatteriesTable.jobId, jobId));
        let newTotalKg = 0;
        let oldTotalKg = 0;
        for (const r of rows) {
          const w = parseFloat(String(r.estimatedWeightKg ?? ""));
          if (isFinite(w) && w > 0) newTotalKg += w;
          const oldVal = r.id === batteryId ? existing.estimatedWeightKg : r.estimatedWeightKg;
          const ow = parseFloat(String(oldVal ?? ""));
          if (isFinite(ow) && ow > 0) oldTotalKg += ow;
        }
        const [parentJob] = await db
          .select({ tonnage: jobsTable.tonnage, tonnageManualOverride: jobsTable.tonnageManualOverride })
          .from(jobsTable)
          .where(eq(jobsTable.id, jobId));
        const currentTonnage = parseFloat(String(parentJob?.tonnage ?? ""));
        // Persisted override flag is authoritative; the old-sum equality
        // check additionally protects legacy jobs created before the flag
        // existed (their flag defaults to false regardless of provenance).
        const wasAutoDerived =
          parentJob?.tonnageManualOverride !== true &&
          isFinite(currentTonnage) &&
          Math.abs(currentTonnage - oldTotalKg / 1000) < 0.0015;
        if (wasAutoDerived) {
          await db
            .update(jobsTable)
            .set({ tonnage: (newTotalKg / 1000).toFixed(3) })
            .where(eq(jobsTable.id, jobId));
        }
      }

      let resolvedByName: string | null = null;
      if (updated.resolvedById != null) {
        const [resolver] = await db
          .select({ fullName: usersTable.fullName })
          .from(usersTable)
          .where(eq(usersTable.id, updated.resolvedById));
        resolvedByName = resolver?.fullName || null;
      }

      res.json({ battery: { ...updated, resolvedByName } });

      // Fire-and-forget: record manual reviewer corrections in the audit
      // trail (covers resolved and never-flagged rows too).
      const changedFields: Array<{ fieldName: string; from: string | null; to: string | null }> = [];
      if (manufacture !== undefined && updated.manufacture !== existing.manufacture) {
        changedFields.push({ fieldName: "manufacturer", from: existing.manufacture, to: updated.manufacture });
      }
      if (cellType !== undefined && updated.cellType !== existing.cellType) {
        changedFields.push({ fieldName: "cellModel", from: existing.cellType, to: updated.cellType });
      }
      if (voltage !== undefined && updated.voltage !== existing.voltage) {
        changedFields.push({ fieldName: "voltage", from: existing.voltage, to: updated.voltage });
      }
      if (changedFields.length > 0) {
        const reviewerName = req.user!.fullName;
        setImmediate(async () => {
          try {
            const [parentJob] = await db
              .select({ reference: jobsTable.reference })
              .from(jobsTable)
              .where(eq(jobsTable.id, jobId));
            if (!parentJob) return;
            await db.insert(correctionAuditLogTable).values(
              changedFields.map((c) => ({
                jobReference: parentJob.reference,
                fieldName: c.fieldName,
                originalValue: c.from,
                suggestedValue: c.to,
                wasAccepted: true,
                confidenceLevel: null,
                submittedByName: reviewerName,
              }))
            );
          } catch (auditErr) {
            console.error("Manual correction audit log error:", auditErr);
          }
        });
      }

      if (clearedAnyFlag && resolvedByName) {
        const [parentJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
        if (parentJob) {
          notifyFlagResolved(parentJob, resolvedByName).catch(() => {});
        }
      }
    } catch (error) {
      console.error("Battery admin update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/jobs/:id/recalculate-pb",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      // Optional override from the client (e.g. an unsaved CBL LME value);
      // falls back to the job's stored CBL LME value, then the latest LME price.
      let rate: number | null = null;
      const bodyRate = req.body?.lmeGbpRate;
      if (bodyRate !== undefined && bodyRate !== null && bodyRate !== "") {
        const parsed = parseFloat(String(bodyRate));
        if (isFinite(parsed) && parsed > 0) rate = parsed;
      }
      if (rate === null) rate = await getEffectiveLmeRateForJob(job.cblLmeValue);

      const batteries = await db
        .select()
        .from(jobBatteriesTable)
        .where(eq(jobBatteriesTable.jobId, jobId));
      const pbCatalogue = await db
        .select({
          manufacturer: cellModelsTable.manufacturer,
          modelName: cellModelsTable.modelName,
          pbContentKgPerCell: cellModelsTable.pbContentKgPerCell,
          cellsCount: cellModelsTable.cellsCount,
        })
        .from(cellModelsTable);

      let updatedCount = 0;
      const updatedBatteries = [];
      for (const b of batteries) {
        // Re-derive Pb from the current cell type; keep the stored value when
        // the catalogue has no Pb data for it (stays 0.000 without errors).
        const derivedPb = derivePbContentKg(
          pbCatalogue,
          b.manufacture,
          b.cellType,
          deriveActualCellCount({
            isLooseCells: b.isLooseCells,
            looseCellsQty: b.looseCellsQty,
            voltage: b.voltage,
          })
        );
        const pbStr = derivedPb ?? b.pbContentKg;
        const pbNum = pbStr ? parseFloat(pbStr) : NaN;
        let valueStr = b.valueGbp;
        if (rate !== null && isFinite(pbNum) && pbNum > 0) {
          const val = (pbNum * rate) / 1000;
          if (isFinite(val)) valueStr = val.toFixed(2);
        }
        if (pbStr !== b.pbContentKg || valueStr !== b.valueGbp) {
          const [updated] = await db
            .update(jobBatteriesTable)
            .set({ pbContentKg: pbStr, valueGbp: valueStr })
            .where(eq(jobBatteriesTable.id, b.id))
            .returning();
          updatedBatteries.push(updated);
          updatedCount++;
        } else {
          updatedBatteries.push(b);
        }
      }

      res.json({ batteries: updatedBatteries, updated: updatedCount, lmeGbpRate: rate });
    } catch (error) {
      console.error("Job Pb recalculation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/jobs/batteries/recalculate-values",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const [latestLme] = await db
        .select({ gbpPrice: lmePricesTable.gbpPrice })
        .from(lmePricesTable)
        .orderBy(desc(lmePricesTable.createdAt))
        .limit(1);

      if (!latestLme) {
        res.status(400).json({ message: "No LME price available. Add an LME price first." });
        return;
      }

      const gbpPrice = parseFloat(latestLme.gbpPrice);
      if (!isFinite(gbpPrice) || gbpPrice <= 0) {
        res.status(400).json({ message: "Invalid LME GBP price." });
        return;
      }

      const result = await db.execute(
        sql`UPDATE job_batteries
            SET value_gbp = ROUND((pb_content_kg::numeric * ${gbpPrice} / 1000), 2)
            WHERE pb_content_kg IS NOT NULL
              AND pb_content_kg::numeric > 0
              AND (value_gbp IS NULL OR value_gbp::numeric = 0)`
      );

      const updatedCount = Number(result.rowCount) || 0;
      res.json({ updated: updatedCount, lmeGbpPrice: gbpPrice });
    } catch (error) {
      console.error("Battery value backfill error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/dashboard/stats",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const [pendingResult] = await db
        .select({ count: count() })
        .from(jobsTable)
        .where(eq(jobsTable.status, "request"));

      const [tonnageResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.tonnage}), 0)`,
        })
        .from(jobsTable)
        .where(sql`${jobsTable.submittedAt} >= ${startOfMonth}`);

      const [invoiceThisMonth] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable)
        .where(sql`${jobsTable.submittedAt} >= ${startOfMonth}`);

      const [invoiceLastMonth] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable)
        .where(
          and(
            sql`${jobsTable.submittedAt} >= ${startOfLastMonth}`,
            sql`${jobsTable.submittedAt} < ${startOfMonth}`,
          )
        );

      const [invoiceAllTime] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable);

      const thisMonthVal = parseFloat(invoiceThisMonth?.total || "0");
      const lastMonthVal = parseFloat(invoiceLastMonth?.total || "0");
      const monthOnMonthChange = lastMonthVal > 0
        ? ((thisMonthVal - lastMonthVal) / lastMonthVal) * 100
        : thisMonthVal > 0 ? 100 : 0;

      const [avgLmeResult] = await db
        .select({
          avg: sql<string>`COALESCE(AVG(${jobsTable.cblLmePercent}), 0)`,
        })
        .from(jobsTable)
        .where(sql`${jobsTable.cblLmePercent} IS NOT NULL`);

      const [completedInvoiceResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable)
        .where(
          or(
            eq(jobsTable.status, "completed"),
            sql`${jobsTable.invoiceStatus} IN ('invoiced', 'paid')`,
          )
        );

      const [grossProfitResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.grossProfit}), 0)`,
        })
        .from(jobsTable)
        .where(
          and(
            sql`${jobsTable.grossProfit} IS NOT NULL`,
            or(
              eq(jobsTable.status, "completed"),
              sql`${jobsTable.invoiceStatus} IN ('invoiced', 'paid')`,
            ),
          )
        );

      const [weekJobsResult] = await db
        .select({ count: count() })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.status, "request"),
            sql`${jobsTable.submittedAt} >= NOW() - INTERVAL '7 days'`,
          )
        );

      const [avgDaysToPayResult] = await db
        .select({
          avg: sql<string>`COALESCE(AVG(${jobsTable.daysToPay}), 0)`,
        })
        .from(jobsTable)
        .where(sql`${jobsTable.daysToPay} IS NOT NULL`);

      const [overdueResult] = await db
        .select({ count: count() })
        .from(jobsTable)
        .where(sql`${jobsTable.dueDate} IS NOT NULL AND ${jobsTable.dueDate} < CURRENT_DATE AND ${jobsTable.datePaid} IS NULL`);

      res.json({
        pendingJobs: pendingResult?.count || 0,
        flaggedExceptions: 0,
        monthlyTonnage: parseFloat(tonnageResult?.total || "0"),
        totalInvoiceValue: parseFloat(invoiceAllTime?.total || "0"),
        pendingThisWeek: weekJobsResult?.count || 0,
        monthOnMonthChange: Math.round(monthOnMonthChange * 10) / 10,
        avgCblLmePercent: Math.round(parseFloat(avgLmeResult?.avg || "0") * 100) / 100,
        totalGrossProfit: parseFloat(grossProfitResult?.total || "0"),
        completedInvoiceValue: parseFloat(completedInvoiceResult?.total || "0"),
        avgDaysToPay: Math.round(parseFloat(avgDaysToPayResult?.avg || "0") * 10) / 10,
        overdueInvoices: overdueResult?.count || 0,
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ─── Reschedule (with audit log) ─────────────────────────────────────────────

router.patch(
  "/jobs/:id/reschedule",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) { res.status(400).json({ message: "Invalid job ID" }); return; }

      const { newDate } = req.body;
      if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        res.status(400).json({ message: "newDate is required and must be YYYY-MM-DD" });
        return;
      }

      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) { res.status(404).json({ message: "Job not found" }); return; }

      const oldDate = job.collectionDate ?? null;

      const [updated] = await db
        .update(jobsTable)
        .set({ collectionDate: newDate })
        .where(eq(jobsTable.id, jobId))
        .returning();

      await db.insert(scheduleRescheduleLogTable).values({
        jobId,
        jobReference: job.reference,
        oldDate: oldDate ?? undefined,
        newDate,
        changedById: req.user!.id,
        changedByName: req.user!.fullName,
      });

      res.json({ job: updated });
    } catch (err) {
      console.error("Reschedule error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ─── Reschedule audit log ─────────────────────────────────────────────────────

router.get(
  "/schedule/audit-log",
  requireAuth,
  requireRole("head_office_admin"),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const entries = await db
        .select()
        .from(scheduleRescheduleLogTable)
        .orderBy(desc(scheduleRescheduleLogTable.changedAt))
        .limit(200);
      res.json({ entries });
    } catch (err) {
      console.error("Audit log fetch error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
