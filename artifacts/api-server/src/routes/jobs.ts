import { Router, type IRouter } from "express";
import { collectionReleaseSummary } from "../lib/collection-release";
import { jobListSummary } from "../lib/job-list-summary";
import { jobScope, mayAccessDepot, isClientUser } from "../lib/depot-access";
import { userLocationIds } from "../lib/user-memberships";
import { db } from "@workspace/db";
import { jobDocumentsTable } from "@workspace/db/schema";
import { jobsTable, jobBatteriesTable, cellModelsTable, batteryWeightReferenceTable, lmePricesTable, locationsTable, clientsTable, usersTable, jobDraftsTable, scheduleRescheduleLogTable, correctionAuditLogTable, collectionCompaniesTable } from "@workspace/db/schema";
import { eq, sql, and, count, ilike, or, inArray, desc, asc, getTableColumns, type SQL } from "drizzle-orm";
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
  calculateReceivedReceiptTotals,
  calculateCollectionTonnage,
  calculateReceiptValue,
  generateAccountsCompletionPdf,
  generateClientReceiptPdf,
  getDeliveryTargets,
  isReceiptReviewComplete,
  selectClientReceiptRecipients,
  type ReceiptItemSnapshot,
} from "../lib/receipt-documents";
import {
  advanceJobStatusSql,
  canUpdateInvoiceMilestones,
  isJobStatus,
  JOB_STATUSES,
} from "../lib/job-status";
import { drawConfirmedCollectionTable } from "../lib/confirmed-collection-table";
import { drawRawCollectionTable } from "../lib/raw-collection-table";
import { isUnknownManufacturerValue, reconcileBatteryReview, reconcileTokenWeightReview, TOKEN_WEIGHT_FLAG_REASON } from "../lib/battery-review";
import {
  calculateReceiptValueGbp,
  isAutomaticReceiptValue,
  resolveCustomerLmePercent,
  resolvePreviousReceiptLmeRate,
} from "../lib/receipt-value";

const CSV_FLAG_REASON = "Missing from CSV import";
const CSV_UNKNOWN_FLAG_REASON = "Unknown value from CSV — please correct";
const TOKEN_WEIGHT_KG = 500;

const SAFE_LOAD_FACTOR = 1.4;

// Match cell model names ignoring spacing, case and punctuation, mirroring
// the portal's normalizeForMatch so both ends agree on what "matches".
function normalizeCellKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalizeSubmittedVoltage(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const numericOnly = trimmed.match(/^(\d+)$/);
  if (!numericOnly) return trimmed.toUpperCase();
  return `${parseInt(numericOnly[1], 10)}V`;
}

export function parsePositiveLooseCellQuantity(
  value: string | number | null | undefined
): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parsePositiveWeightKg(
  value: string | number | null | undefined
): number | null {
  const text = String(value ?? "").trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function comparableCellModelKey(value: string): string {
  const normalized = normalizeCellKey(value);
  const match = normalized.match(/^(\d+)([a-z]+)(\d+.*)$/);
  if (!match) return normalized;
  const [, cells, letters, rest] = match;
  const pzIndex = letters.indexOf("pz");
  const family = pzIndex > 0 ? letters.slice(pzIndex) : letters;
  return `${cells}${family}${rest}`;
}

function manufacturerMatches(
  requestedManufacturer: string | null,
  catalogueManufacturer: string
): boolean {
  const requested = (requestedManufacturer || "").trim().toLowerCase();
  if (isUnknownManufacturerValue(requested)) return false;
  const catalogue = catalogueManufacturer.trim().toLowerCase();
  if (
    requested === catalogue
    || requested.includes(catalogue)
    || catalogue.includes(requested)
  ) {
    return true;
  }
  const requestedTokens = requested.split("/").map((value) => value.trim()).filter(Boolean);
  const catalogueTokens = catalogue.split("/").map((value) => value.trim()).filter(Boolean);
  return requestedTokens.some((token) => catalogueTokens.includes(token));
}

export function selectCatalogueModel<T extends { manufacturer: string; modelName: string }>(
  catalogue: T[],
  manufacturer: string | null,
  cellModel: string
): T | undefined {
  const modelKey = comparableCellModelKey(cellModel);
  const matches = catalogue.filter(
    (entry) => comparableCellModelKey(entry.modelName) === modelKey
  );
  const requestedManufacturer = (manufacturer || "").trim();
  const isUnknownManufacturer = isUnknownManufacturerValue(requestedManufacturer);
  return (
    (!isUnknownManufacturer
      ? matches.find((entry) =>
          manufacturerMatches(requestedManufacturer, entry.manufacturer)
        )
      : undefined) ||
    matches.find((entry) => entry.manufacturer.toLowerCase() === "tab")
  );
}

export function flagOtherSelectionsForReview(battery: {
  manufacture?: string | null;
  cellType?: string | null;
  manufacturerFlagReason?: string | null;
  cellModelFlagReason?: string | null;
}): void {
  if (isUnknownManufacturerValue(battery.manufacture)) {
    battery.manufacturerFlagReason = null;
  }
  if (battery.cellType?.trim().toLowerCase() === "other") {
    battery.cellModelFlagReason = "Other — requires Itinium review";
  }
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
    return parsePositiveLooseCellQuantity(opts.looseCellsQty);
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
// using the same matching rules as job submission: equivalent model variants
// are grouped, then the requested manufacturer is preferred before TAB and
// finally any remaining manufacturer. Total Pb = Pb-per-cell x actual cell count, where
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
  const normCell = comparableCellModelKey(cellStr);
  const matches = catalogue.filter(
    (m) => m.pbContentKgPerCell != null && comparableCellModelKey(m.modelName) === normCell
  );
  if (matches.length === 0) return null;
  const chosen = selectCatalogueModel(matches, manufacture, cellStr);
  if (!chosen) return null;
  const totalPb = parseFloat(chosen.pbContentKgPerCell!) * cellCount;
  return isFinite(totalPb) ? totalPb.toFixed(3) : null;
}

// Derive a battery's raw (pre-safe-load-factor) estimated weight in kg from
// the cell model catalogue, using the same matching rules as Pb derivation:
// equivalent manufacturer-specific model first, then TAB, then any. Returns
// null when the model isn't in the catalogue or the cell count is unknown. Keeping this on the
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
  const normCell = comparableCellModelKey(cellStr);
  const matches = catalogue.filter(
    (m) => m.weightPerCellKg != null && comparableCellModelKey(m.modelName) === normCell
  );
  if (matches.length === 0) return null;
  const chosen = selectCatalogueModel(matches, manufacture, cellStr);
  if (!chosen) return null;
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
  // Use the same equivalence as ordinary weight derivation (EPzS ↔ PzS),
  // while keeping the saved designation intact and using TAB rates only.
  const normCell = comparableCellModelKey(cellStr);
  const tabEntry = catalogue.find(
    (entry) =>
      entry.manufacturer.toLowerCase() === "tab" &&
      entry.weightPerCellKg != null &&
      comparableCellModelKey(entry.modelName) === normCell
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

router.patch("/jobs/:id/ownership", requireAuth, requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    const jobId = Number(req.params.id);
    const locationId = Number(req.body.locationId);
    if (!Number.isSafeInteger(jobId) || !Number.isSafeInteger(locationId) || locationId <= 0) {
      res.status(400).json({ message: "Choose a verified location" }); return;
    }
    try {
      const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
      if (!location) { res.status(400).json({ message: "Location not found" }); return; }
      const [job] = await db.update(jobsTable).set({ clientId: location.clientId, locationId })
        .where(eq(jobsTable.id, jobId)).returning();
      if (!job) { res.status(404).json({ message: "Job not found" }); return; }
      res.json({ job });
    } catch (error) {
      console.error("Ownership correction failed:", error);
      res.status(500).json({ message: "Could not save ownership" });
    }
  });

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
          tonnage: jobsTable.tonnage,
          palletCount: sql<number>`COUNT(DISTINCT COALESCE(
            LOWER(NULLIF(TRIM(${jobBatteriesTable.palletNumber}), '')),
            CASE WHEN ${jobBatteriesTable.id} IS NOT NULL THEN CONCAT('__battery_', ${jobBatteriesTable.id}) END
          ))`,
          collectionDate: jobsTable.collectionDate,
          status: jobsTable.status,
        })
        .from(jobsTable)
        .leftJoin(jobBatteriesTable, eq(jobBatteriesTable.jobId, jobsTable.id))
        .where(sql`${jobsTable.collectionDate} IS NOT NULL`)
        .groupBy(
          jobsTable.id,
          jobsTable.reference,
          jobsTable.clientName,
          jobsTable.depot,
          jobsTable.tonnage,
          jobsTable.collectionDate,
          jobsTable.status
        )
        .orderBy(asc(jobsTable.collectionDate));
      res.json({
        jobs: jobs.map((job) => ({
          ...job,
          palletCount: Number(job.palletCount || 0),
        })),
      });
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
      const whereClause = and(buildJobsWhere(req.query as Record<string, unknown>), jobScope(req.user!));
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

      const whereClause = and(buildJobsWhere(req.query as Record<string, unknown>), jobScope(req.user!));

      const [jobs, [totalResult]] = await Promise.all([
        db
          .select({
            ...getTableColumns(jobsTable),
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
      const rows = jobs.length ? await db.select({
        jobId: jobBatteriesTable.jobId,
        palletNumber: jobBatteriesTable.palletNumber,
        pbContentKg: jobBatteriesTable.pbContentKg,
        estimatedWeightKg: jobBatteriesTable.estimatedWeightKg,
        receiptReviewed: jobBatteriesTable.receiptReviewed,
        receiptConfirmed: jobBatteriesTable.receiptConfirmed,
      }).from(jobBatteriesTable)
        .where(inArray(jobBatteriesTable.jobId, jobs.map(job => job.id))) : [];

      const documents = jobs.length ? await db.select({
        jobId: jobDocumentsTable.jobId, docType: jobDocumentsTable.docType,
      }).from(jobDocumentsTable).where(and(
        inArray(jobDocumentsTable.jobId, jobs.map(job => job.id)),
        inArray(jobDocumentsTable.docType, ["consignment_note", "collection_sheet"]),
      )) : [];
      res.json({
        jobs: jobs.map(job => ({
          ...job,
          signedDocumentTypes: documents.filter(doc => doc.jobId === job.id).map(doc => doc.docType),
          ...jobListSummary(rows.filter(row => row.jobId === job.id), job.tonnage),
        })),
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
        `${job.clientName} | ${job.depot}`,
        { layout: "landscape" }
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

      doc.fontSize(10).fillColor(NAVY).font("Helvetica-Bold")
        .text(`Collection Date: ${collectionLabel}`, 40, doc.y, { width: contentW });
      doc.moveDown(0.8);

      const siteAddress = job.collectionPoint || locationAddress || job.depot;

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
      infoBlock("Special / Loading Instructions", collectionSheetInstructions(job.specialInstructions));

      doc.moveTo(40, doc.y).lineTo(pageW - 40, doc.y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.moveDown(0.8);

      ensureRoom(60);
      drawConfirmedCollectionTable(doc, batteries, { contentWidth: contentW, navy: NAVY });

      if (batteries.length === 0) {
        doc.fontSize(9).fillColor("#94a3b8").text("No battery items recorded.", 40);
      }

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

export function collectionSheetInstructions(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "None";
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

      const siteAddress = job.collectionPoint || locationAddress || job.depot;

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
        .text(collectionSheetInstructions(job.specialInstructions), 40, doc.y + 2, { width: contentW });
      doc.moveDown(1);

      ensureRoom(60);
      drawRawCollectionTable(doc, batteries, { contentWidth: contentW, navy: NAVY });

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
        manufacturerFlagReason: isUnknownManufacturerValue(b.manufacture) ? null : b.manufacturerFlagReason,
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

export function applyTokenWeightFallback(battery: BatteryInput): void {
  if (parsePositiveWeightKg(battery.estimatedWeightKg) !== null) return;
  battery.estimatedWeightKg = String(TOKEN_WEIGHT_KG);
  battery.cellModelFlagReason = battery.cellModelFlagReason || TOKEN_WEIGHT_FLAG_REASON;
}

router.post(
  "/jobs",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        collectionPoint,
        collectionDate,
        tonnage,
        tonnageManualOverride,
        notes,
        batteries,
        draftId,
        siteContacts,
        siteHours,
        specialInstructions,
      } = req.body;
      let { depot } = req.body;
      const internalRequest = ["accounts", "head_office_admin"].includes(req.user!.role);
      const allowTonnageOverride = internalRequest && tonnageManualOverride;

      let resolvedClientId = req.user!.clientId || null;
      let resolvedLocationId = req.body.locationId === undefined ? req.user!.locationId || null : null;
      const clientUser = ["depot_user", "team_leader"].includes(req.user!.role);
      if (!clientUser && !internalRequest) {
        res.status(403).json({ message: "Access denied" }); return;
      }
      if (draftId && clientUser) {
        const [draft] = await db.select().from(jobDraftsTable).where(eq(jobDraftsTable.id, Number(draftId)));
        if (!draft || !mayAccessDepot(req.user!, draft)) {
          res.status(403).json({ message: "Draft is not assigned to your locations" }); return;
        }
      }
      if (clientUser && !resolvedClientId) {
        res.status(403).json({ message: "Your account is not linked to a client" });
        return;
      }
      let clientName = "Unknown";
      if (req.body.locationId !== undefined && req.body.locationId !== null && req.body.locationId !== "") {
        const requestedLocationId = Number(req.body.locationId);
        if (!Number.isSafeInteger(requestedLocationId) || requestedLocationId <= 0) {
          res.status(400).json({ message: "Invalid location" });
          return;
        }
        resolvedLocationId = requestedLocationId;
      }
      if (clientUser && !resolvedLocationId) {
        res.status(400).json({ message: "Select a location belonging to your client" });
        return;
      }
      if (clientUser && !mayAccessDepot(req.user!, { clientId: resolvedClientId, locationId: resolvedLocationId })) {
        res.status(403).json({ message: "This location is not assigned to your account" });
        return;
      }

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
      let locationAddress: string | null = null;
      if (resolvedLocationId) {
        const [location] = await db
          .select({
            name: locationsTable.name,
            address: locationsTable.address,
            clientId: locationsTable.clientId,
            siteContacts: locationsTable.siteContacts,
            siteContactName: locationsTable.siteContactName,
            siteContactPhone: locationsTable.siteContactPhone,
            siteContact2Name: locationsTable.siteContact2Name,
            siteContact2Phone: locationsTable.siteContact2Phone,
            siteContact3Name: locationsTable.siteContact3Name,
            siteContact3Phone: locationsTable.siteContact3Phone,
            siteHours: locationsTable.siteHours,
            specialInstructions: locationsTable.specialInstructions,
          })
          .from(locationsTable)
          .where(eq(locationsTable.id, resolvedLocationId));
        if (!location) {
          res.status(400).json({ message: "Selected location no longer exists" });
          return;
        }
        if (location) {
          if (resolvedClientId && location.clientId !== resolvedClientId) {
            res.status(403).json({ message: "Location does not belong to your client" });
            return;
          }
          depot = location.name;
          locationAddress = location.address;
          if (!resolvedClientId) resolvedClientId = location.clientId;
          const structuredContacts = [
            [location.siteContactName, location.siteContactPhone],
            [location.siteContact2Name, location.siteContact2Phone],
            [location.siteContact3Name, location.siteContact3Phone],
          ]
            .map((parts) => parts.filter(Boolean).join(" — "))
            .filter(Boolean);
          locationSiteContacts = structuredContacts.length > 0
            ? structuredContacts.join("\n")
            : location.siteContacts;
          locationSiteHours = location.siteHours;
          locationSpecialInstructions = location.specialInstructions;
        }
      }
      if (siteContacts !== undefined) {
        locationSiteContacts = String(siteContacts || "").trim() || null;
      }
      if (siteHours !== undefined) {
        locationSiteHours = String(siteHours || "").trim() || null;
      }
      if (specialInstructions !== undefined) {
        locationSpecialInstructions = String(specialInstructions || "").trim() || null;
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
        } else {
          b.voltage = canonicalizeSubmittedVoltage(b.voltage);
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
        const parsed = parsePositiveWeightKg(val);
        if (parsed === null) return null;
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

      for (let inputIndex = 0; inputIndex < batteryInputs.length; inputIndex++) {
        const b = batteryInputs[inputIndex];
        const mfrStr = (b.manufacture || "").trim();
        const isUnknownMfr = isUnknownManufacturerValue(mfrStr);
        const cellTypeStr = (b.cellType || "").trim();
        const cellModelApplies = !["blocs", "other"].includes(cellTypeStr.toLowerCase());

        flagOtherSelectionsForReview(b);
        if (!isUnknownMfr && !b.manufacturerFlagReason) {
          if (!knownManufacturers.has(mfrStr.toLowerCase())) {
            b.manufacturerFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
        }

        // Keep the submitted designation. Catalogue equivalence may provide
        // a calculation fallback, but is not permission to change identity.

        if (!b.cellModelFlagReason && cellModelApplies) {
          const finalCellType = (b.cellType || "").trim();
          if (!finalCellType) {
            b.cellModelFlagReason = CSV_FLAG_REASON;
          } else if (allCellModels.length > 0) {
            const usableModel = selectCatalogueModel(
              allCellModels,
              isUnknownMfr ? null : mfrStr,
              finalCellType
            );
            if (!usableModel) b.cellModelFlagReason = CSV_UNKNOWN_FLAG_REASON;
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
          if (derived !== null) {
            b.estimatedWeightKg = derived;
            if (b.cellModelFlagReason === TOKEN_WEIGHT_FLAG_REASON) b.cellModelFlagReason = null;
          } else if (!internalRequest) {
            // Never accept a stale/token client auto-weight as a verified
            // load. Preserve supported legacy family/Blocs reference lookup.
            const refs = await db.select().from(batteryWeightReferenceTable)
              .where(eq(batteryWeightReferenceTable.cellType, b.cellType || ""));
            const unitType = b.cellType === "Blocs" || b.cellType === "Other";
            const lookupVoltage = unitType ? null : b.isLooseCells ? "12V" : b.voltage;
            const ref = refs.find((r) => r.voltage === lookupVoltage);
            const qty = Number(b.looseCellsQty);
            const multiplier = b.isLooseCells
              ? (unitType ? qty : qty / 6)
              : b.cellType === "Blocs" ? qty : 1;
            const raw = ref ? Number(ref.weightKg) * multiplier : NaN;
            b.estimatedWeightKg = Number.isFinite(raw) && raw > 0 ? raw.toFixed(3) : null;
            if (b.estimatedWeightKg && b.cellModelFlagReason === TOKEN_WEIGHT_FLAG_REASON) {
              b.cellModelFlagReason = null;
            }
          }
        }
        if (!internalRequest && (
          parsePositiveWeightKg(b.estimatedWeightKg) === null ||
          b.cellModelFlagReason === TOKEN_WEIGHT_FLAG_REASON
        )) {
          res.status(400).json({ message: "Battery weights need confirmation. Complete the battery details or save your draft and contact Itinium before submitting." });
          return;
        }
        applyTokenWeightFallback(b);
      }

      let autoTonnage = 0;
      let rawWeightKg = 0;
      for (const b of batteryInputs) {
        const w = sanitizeWeight(b.estimatedWeightKg);
        if (w !== null) autoTonnage += parseFloat(w);
        const raw = parsePositiveWeightKg(b.estimatedWeightKg);
        if (raw !== null) rawWeightKg += raw;
      }
      const autoTonnageStr = (autoTonnage / 1000).toFixed(3);
      const parsedTonnage = tonnage ? parseFloat(String(tonnage)) : NaN;
      const finalTonnage = (allowTonnageOverride && !isNaN(parsedTonnage) && isFinite(parsedTonnage) && parsedTonnage >= 0)
        ? String(parsedTonnage)
        : autoTonnageStr;

      // Loads under 10t are allowed (a transportation charge applies —
      // the portal shows a notice instead of blocking submission).
      // The 26t truck capacity applies to the gross load (lead x 1.4) — the
      // same figure shown to depot users (client-confirmed 30 July 2026).
      const MAX_TONNAGE = 26.0;
      const effectiveLoadT = (allowTonnageOverride && isFinite(parsedTonnage) && parsedTonnage >= 0)
        ? Math.max(parsedTonnage, autoTonnage / 1000)
        : autoTonnage / 1000;
      if (isFinite(effectiveLoadT) && effectiveLoadT > MAX_TONNAGE) {
        res.status(400).json({ message: `Reduce this collection request to at most ${MAX_TONNAGE} tonnes before submitting. Request additional tonnage through a separate new collection job. Contact Itinium directly for assistance.` });
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
            collectionPoint: collectionPoint || locationAddress || null,
            collectionDate: collectionDate || null,
            tonnage: finalTonnage,
            tonnageManualOverride: !!(allowTonnageOverride && !isNaN(parsedTonnage) && isFinite(parsedTonnage) && parsedTonnage >= 0),
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
            valueGbp = calculateReceiptValueGbp(pbContentKg, latestLmeGbpPrice, null);
          }
          return {
            jobId: job.id,
            palletNumber: b.palletNumber || null,
            assetNumber: b.assetNumber || null,
            batterySerial: b.batterySerial || null,
            manufacture: b.manufacture || null,
            cellType: b.cellType || null,
            voltage: b.isLooseCells ? null : (b.voltage || null),
            looseCellsQty: b.isLooseCells
              ? parsePositiveLooseCellQuantity(b.looseCellsQty)
              : (b.looseCellsQty ? parseInt(String(b.looseCellsQty), 10) : null),
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
            const canDelete = mayAccessDepot(submitter, draftRow);
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

      // Itinium explicitly releases the reviewed collection before assignment
      // or collector notifications. Client submission alone stays internal.
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
        const reviewFlags = {
          manufacture: clean(req.body.manufacture),
          cellType: clean(req.body.cellType),
          manufacturerFlagReason: null as string | null,
          cellModelFlagReason: null as string | null,
        };
        flagOtherSelectionsForReview(reviewFlags);
        const [created] = await tx.insert(jobBatteriesTable).values({
          jobId,
          palletNumber: clean(req.body.palletNumber),
          assetNumber: clean(req.body.assetNumber),
          batterySerial: clean(req.body.batterySerial),
          manufacture: reviewFlags.manufacture,
          cellType: reviewFlags.cellType,
          manufacturerFlagReason: reviewFlags.manufacturerFlagReason,
          cellModelFlagReason: reviewFlags.cellModelFlagReason,
          voltage: clean(req.body.voltage),
          notes: clean(req.body.notes),
          estimatedWeightKg: estimatedWeight.toFixed(3),
          weightManual: true,
          receiptConfirmed: false,
          receiptReviewed: false,
          resolvedById: req.user!.id,
          resolvedAt: new Date(),
        }).returning();
        return created;
      });
      const updatedJob = await syncReceivedJobTotals(jobId);
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
      });
      const updatedJob = await syncReceivedJobTotals(jobId);
      res.json({ job: updatedJob });
    } catch (error) {
      if (error instanceof Error && error.message === "BATTERY_NOT_FOUND") return void res.status(404).json({ message: "Battery not found" });
      console.error("Remove job battery error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/jobs/:id/release-collection",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = Number(req.params.id);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        res.status(400).json({ message: "Invalid job ID" }); return;
      }
      const result = await db.transaction(async (tx) => {
        const [job] = await tx.select().from(jobsTable).where(eq(jobsTable.id, jobId)).for("update");
        if (!job) return { error: "Job not found", status: 404 };
        if (job.collectionReleasedAt) return { job, alreadyReleased: true };
        if (!["request", "confirmed"].includes(job.status)) return { error: "This job cannot be released for collection", status: 400 };
        const rows = await tx.select().from(jobBatteriesTable).where(eq(jobBatteriesTable.jobId, jobId)).for("update");
        if (!rows.length) return { error: "Add the collection items before submitting", status: 400 };
        const summary = collectionReleaseSummary(rows);
        if (summary.missingPalletRows) return { error: "Enter a pallet number for each collection row so the collector has an accurate pallet count.", status: 400 };
        if (summary.provisionalItems.some((item) => !item.notes.trim())) {
          return { error: "Add Itinium notes to each provisional item explaining what CBL must check during collection.", status: 400 };
        }
        if (summary.provisionalItems.length && req.body.acknowledgeProvisional !== true) {
          return { error: "Acknowledge the provisional-weight warning before submitting.", status: 400 };
        }
        if (rows.some((row) => !(Number(row.estimatedWeightKg) > 0))) {
          return { error: "Every row needs a positive weight or token allowance before submission.", status: 400 };
        }
        if (req.body.confirmReviewed !== true) return { error: "Confirm that the collection details and table have been reviewed.", status: 400 };
        const [company] = await tx.select().from(collectionCompaniesTable)
          .where(eq(collectionCompaniesTable.isActive, true)).orderBy(asc(collectionCompaniesTable.id)).limit(1);
        if (!company) return { error: "No active collection company is configured.", status: 400 };
        const [released] = await tx.update(jobsTable).set({
          collectionCompanyId: company.id,
          collectionReleasedAt: new Date(),
          ...(job.tonnageManualOverride ? {} : { tonnage: calculateCollectionTonnage(rows) }),
        }).where(eq(jobsTable.id, jobId)).returning();
        return { job: released, alreadyReleased: false };
      });
      if ("error" in result) { res.status(result.status!).json({ message: result.error }); return; }
      if (!result.alreadyReleased) await notifyCollectionCompanyNewJob(result.job, result.job.collectionCompanyId!);
      res.json({ job: result.job, alreadyReleased: result.alreadyReleased });
    } catch (error) {
      console.error("Collection release error:", error);
      res.status(500).json({ message: "Could not submit this collection. Please reload to check its status before retrying." });
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
          sql`${jobBatteriesTable.receiptReviewed} IS DISTINCT FROM TRUE`
        ));

      if (pending.length === 0) {
        await db
          .update(jobsTable)
          .set({ status: advanceJobStatusSql("received") })
          .where(eq(jobsTable.id, jobId))
          .returning();
        const updatedJob = await syncReceivedJobTotals(jobId);
        const batteries = await db
          .select()
          .from(jobBatteriesTable)
          .where(eq(jobBatteriesTable.jobId, jobId))
          .orderBy(asc(jobBatteriesTable.id));
        res.json({ confirmedCount: 0, batteries, job: updatedJob });
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
      const skippedItems = missing.map(({ battery }) => ({
        id: battery.id,
        palletNumber: battery.palletNumber,
        batterySerial: battery.batterySerial,
        reason: "No matching TAB weight; check cell model and voltage/quantity.",
      }));

      let confirmedCount = 0;
      await db.transaction(async (tx) => {
        for (const { battery, tabWeightKg } of prepared) {
          // Unresolved/token rows stay untouched and pending; valid rows
          // must not be blocked by an unrelated missing model.
          if (tabWeightKg === null) continue;
          const updates: Record<string, string | boolean | number | Date | null> = {
            receiptConfirmed: true,
            receiptReviewed: true,
            estimatedWeightKg: tabWeightKg!,
            weightManual: false,
          };
          reconcileTokenWeightReview(battery, updates);
          reconcileBatteryReview(
            battery, updates, req.user!.id,
            ["accounts", "head_office_admin"].includes(req.user!.role),
          );
          const changed = await tx
            .update(jobBatteriesTable)
            .set(updates)
            .where(and(
              eq(jobBatteriesTable.id, battery.id),
              eq(jobBatteriesTable.jobId, jobId),
              sql`${jobBatteriesTable.receiptReviewed} IS DISTINCT FROM TRUE`
            ))
            .returning({ id: jobBatteriesTable.id });
          confirmedCount += changed.length;
        }

        const [{ remaining }] = await tx
          .select({ remaining: count() })
          .from(jobBatteriesTable)
          .where(and(
            eq(jobBatteriesTable.jobId, jobId),
            sql`${jobBatteriesTable.receiptReviewed} IS DISTINCT FROM TRUE`
          ));
        if (Number(remaining) === 0) {
          await tx
            .update(jobsTable)
            .set({ status: advanceJobStatusSql("received") })
            .where(eq(jobsTable.id, jobId));
        }
      });

      const batteries = await db
        .select()
        .from(jobBatteriesTable)
        .where(eq(jobBatteriesTable.jobId, jobId))
        .orderBy(asc(jobBatteriesTable.id));
      const updatedJob = await syncReceivedJobTotals(jobId);
      res.json({ confirmedCount, skippedCount: skippedItems.length, skippedItems, batteries, job: updatedJob });
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
        collectionDate, notes,
        wasteSpotRate, wasteTractionPercent, wasteBlocsPercent, wasteTractionRate,
        wasteBlocsRate, wasteTractionTonnage, wasteBlocsTonnage, wasteAdHocCosts,
        wasteTransportCost, wasteInvoiceValue, wasteInvoiceNo,
        customerTractionPercent, customerBlocsPercent, customerTractionRate,
        customerBlocsRate, customerTractionTonnage, customerBlocsTonnage,
        customerAdHocCosts, customerTransportCost, netProfit,
      } = req.body;
      if (
        !canUpdateInvoiceMilestones(req.user!.role)
        && (invoiceStatus !== undefined || invoiceReceivedDate !== undefined || dueDate !== undefined || datePaid !== undefined)
      ) {
        res.status(403).json({ message: "Only accounts and head office admins can update invoice milestones" });
        return;
      }

      const toDecimal = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;
      const toStr = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;
      const [existingJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!existingJob) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      const updates: Partial<Record<string, string | number | null | SQL>> = {};
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
      const financialDecimals = {
        wasteSpotRate, wasteTractionPercent, wasteBlocsPercent, wasteTractionRate,
        wasteBlocsRate, wasteTractionTonnage, wasteBlocsTonnage, wasteAdHocCosts,
        wasteTransportCost, wasteInvoiceValue, customerTractionPercent, customerBlocsPercent,
        customerTractionRate, customerBlocsRate, customerTractionTonnage,
        customerBlocsTonnage, customerAdHocCosts, customerTransportCost, netProfit,
      };
      for (const [key, value] of Object.entries(financialDecimals)) {
        if (value !== undefined) updates[key] = toDecimal(value);
      }
      if (wasteInvoiceNo !== undefined) updates.wasteInvoiceNo = toStr(wasteInvoiceNo);
      if (siteContacts !== undefined) updates.siteContacts = toStr(siteContacts);
      if (siteHours !== undefined) updates.siteHours = toStr(siteHours);
      if (specialInstructions !== undefined) updates.specialInstructions = toStr(specialInstructions);
      if (notes !== undefined) updates.notes = toStr(notes);
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
        const effectiveInvoiceReceivedDate = (invoiceReceivedDate !== undefined ? toStr(invoiceReceivedDate) : existingJob.invoiceReceivedDate);
        const referenceDate = effectiveInvoiceReceivedDate || existingJob.collectionDate;
        if (referenceDate) {
          const paidDate = new Date(datePaid);
          const refDate = new Date(referenceDate);
          const diffMs = paidDate.getTime() - refDate.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          updates.daysToPay = diffDays;
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

      const effectiveDatePaid = datePaid !== undefined ? toStr(datePaid) : existingJob.datePaid;
      const effectiveInvoiceReceivedDate = invoiceReceivedDate !== undefined
        ? toStr(invoiceReceivedDate)
        : existingJob.invoiceReceivedDate;
      const effectiveInvoiceStatus = String(updates.invoiceStatus ?? existingJob.invoiceStatus ?? "");
      const automaticTarget =
        effectiveDatePaid
          ? "completed"
          : effectiveInvoiceReceivedDate || effectiveInvoiceStatus === "invoiced" || effectiveInvoiceStatus === "paid"
            ? "invoice"
            : null;
      if (automaticTarget) {
        updates.status = advanceJobStatusSql(automaticTarget);
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const [lockedExistingJob] = await tx
          .select()
          .from(jobsTable)
          .where(eq(jobsTable.id, jobId))
          .for("update");
        if (!lockedExistingJob) return null;

        const [updated] = await tx
          .update(jobsTable)
          .set(updates)
          .where(eq(jobsTable.id, jobId))
          .returning();
        if (!updated) return null;

        const oldEffectivePercent = resolveCustomerLmePercent(
          lockedExistingJob.customerTractionPercent,
          lockedExistingJob.customerLmePercent
        );
        const newEffectivePercent = resolveCustomerLmePercent(
          updated.customerTractionPercent,
          updated.customerLmePercent
        );
        const financialInputChanged =
          Number(updated.cblLmeValue) !== Number(lockedExistingJob.cblLmeValue)
          || Number(newEffectivePercent) !== Number(oldEffectivePercent);
        let updatedBatteries: Array<typeof jobBatteriesTable.$inferSelect> | undefined;
        if (financialInputChanged) {
          const latestFallbackRate = await getEffectiveLmeRateForJob(null);
          const oldRate = resolvePreviousReceiptLmeRate(
            lockedExistingJob.cblLmeValue,
            lockedExistingJob.lmeRateUsed,
            latestFallbackRate
          );
          const rate = await getEffectiveLmeRateForJob(updated.cblLmeValue);
          const batteries = await tx
            .select()
            .from(jobBatteriesTable)
            .where(eq(jobBatteriesTable.jobId, jobId));
          updatedBatteries = [];
          for (const battery of batteries) {
            const shouldRecalculate = isAutomaticReceiptValue(
              battery.valueGbp,
              battery.pbContentKg,
              oldRate,
              oldEffectivePercent
            );
            const adjustedValue = shouldRecalculate
              ? calculateReceiptValueGbp(
                  battery.pbContentKg,
                  rate,
                  newEffectivePercent
                )
              : battery.valueGbp;
            if (adjustedValue !== null && adjustedValue !== battery.valueGbp) {
              const [saved] = await tx
                .update(jobBatteriesTable)
                .set({ valueGbp: adjustedValue })
                .where(eq(jobBatteriesTable.id, battery.id))
                .returning();
              updatedBatteries.push(saved);
            } else {
              updatedBatteries.push(battery);
            }
          }
        }

        return { updated, updatedBatteries };
      });

      if (!result) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      res.json({ job: result.updated, batteries: result.updatedBatteries });
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

  const allowed = await Promise.all(teamLeaders.map(async user =>
    job.locationId && (await userLocationIds(user.id, job.clientId)).includes(job.locationId) ? user : null));
  const selected = allowed.filter((user): user is NonNullable<typeof user> => user !== null);
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
    estimatedWeightKg: battery.estimatedWeightKg,
    pbContentKg: battery.pbContentKg,
  };
}

async function syncReceivedJobTotals(jobId: number) {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .for("update");
    if (!job) return undefined;

    const batteries = await tx
      .select()
      .from(jobBatteriesTable)
      .where(eq(jobBatteriesTable.jobId, jobId));
    const totals = calculateReceivedReceiptTotals(batteries.map(toReceiptSnapshot));
    const updates: Partial<typeof jobsTable.$inferInsert> = {
      totalInvoiceValue: totals.valueGbp.toFixed(2),
      customerTractionTonnage: (totals.pbKg / 1000).toFixed(3),
    };

    if (job.tonnageManualOverride !== true) {
      updates.tonnage = calculateCollectionTonnage(batteries);
    }

    const tractionRate = Number.parseFloat(job.customerTractionRate || "");
    if (Number.isFinite(tractionRate)) {
      const blocsTonnage = Number.parseFloat(job.customerBlocsTonnage || "") || 0;
      const blocsRate = Number.parseFloat(job.customerBlocsRate || "") || 0;
      const transport = Number.parseFloat(job.customerTransportCost || "") || 0;
      const adHoc = Number.parseFloat(job.customerAdHocCosts || "") || 0;
      updates.customerInvoiceValue = (
        (totals.pbKg / 1000) * tractionRate
        + blocsTonnage * blocsRate
        - transport
        - adHoc
      ).toFixed(2);
    }

    const [updated] = await tx
      .update(jobsTable)
      .set(updates)
      .where(eq(jobsTable.id, jobId))
      .returning();
    return updated;
  });
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
        ...(allSent ? { status: advanceJobStatusSql("awaiting_invoice") } : {}),
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
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      if (isNaN(jobId)) {
        res.status(400).json({ message: "Invalid job ID" });
        return;
      }

      const { status } = req.body;
      if (!isJobStatus(status)) {
        res.status(400).json({ message: "Invalid status. Must be one of: " + JOB_STATUSES.join(", ") });
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

      const canResolveReview = ["accounts", "head_office_admin"].includes(req.user!.role);
      if (batterySerial !== undefined) {
        const v = toTrimmedStr(batterySerial);
        updates.batterySerial = v;
        if (v !== null) {
          updates.serialFlagReason = null;
        }
      }
      if (clearSerialFlag === true || clearSerialFlag === "true") {
        updates.serialFlagReason = null;
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
        if (isUnknownManufacturerValue(v)) {
          updates.manufacturerFlagReason = null;
        } else if (v !== null && canResolveReview) {
          updates.manufacturerFlagReason = null;
        }
      }
      if (cellType !== undefined) {
        const v = toTrimmedStr(cellType);
        updates.cellType = v;
        if (v?.toLowerCase() === "other") {
          updates.cellModelFlagReason = "Other — requires Itinium review";
        } else if (v !== null && canResolveReview) {
          updates.cellModelFlagReason = null;
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
                .select({
                  cblLmeValue: jobsTable.cblLmeValue,
                  customerLmePercent: jobsTable.customerLmePercent,
                  customerTractionPercent: jobsTable.customerTractionPercent,
                })
                .from(jobsTable)
                .where(eq(jobsTable.id, jobId));
              const rate = await getEffectiveLmeRateForJob(parentJob?.cblLmeValue ?? null);
              if (rate !== null) {
                updates.valueGbp = calculateReceiptValueGbp(
                  derivedPb,
                  rate,
                  resolveCustomerLmePercent(
                    parentJob?.customerTractionPercent ?? null,
                    parentJob?.customerLmePercent ?? null
                  )
                );
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
        }
      }

      reconcileTokenWeightReview(existing, updates);
      const reviewResolved = reconcileBatteryReview(existing, updates, req.user!.id, canResolveReview);

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

      let updatedJob: typeof jobsTable.$inferSelect | undefined;
      if (receiptConfirmed !== undefined) {
        updatedJob = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT ${jobsTable.id} FROM ${jobsTable} WHERE ${jobsTable.id} = ${jobId} FOR UPDATE`);
          const [{ remaining }] = await tx
            .select({ remaining: count() })
            .from(jobBatteriesTable)
            .where(and(
              eq(jobBatteriesTable.jobId, jobId),
              sql`${jobBatteriesTable.receiptReviewed} IS DISTINCT FROM TRUE`
            ));
          if (Number(remaining) === 0) {
            const [advanced] = await tx
              .update(jobsTable)
              .set({ status: advanceJobStatusSql("received") })
              .where(eq(jobsTable.id, jobId))
              .returning();
            return advanced;
          }
          return undefined;
        });
      }

      if (
        receiptConfirmed !== undefined
        || pbContentKg !== undefined
        || valueGbp !== undefined
        || updates.estimatedWeightKg !== undefined
      ) {
        updatedJob = await syncReceivedJobTotals(jobId);
      }

      let resolvedByName: string | null = null;
      if (updated.resolvedById != null) {
        const [resolver] = await db
          .select({ fullName: usersTable.fullName })
          .from(usersTable)
          .where(eq(usersTable.id, updated.resolvedById));
        resolvedByName = resolver?.fullName || null;
      }

      res.json({ battery: { ...updated, resolvedByName }, ...(updatedJob ? { job: updatedJob } : {}) });

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

      if (reviewResolved && resolvedByName) {
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
      const requestedPercent = req.body?.customerLmePercent;
      const effectiveCustomerLmePercent =
        requestedPercent !== undefined
          ? String(requestedPercent)
          : resolveCustomerLmePercent(
              job.customerTractionPercent,
              job.customerLmePercent
            );

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
          valueStr = calculateReceiptValueGbp(pbNum, rate, effectiveCustomerLmePercent);
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
        sql`UPDATE job_batteries AS jb
            SET value_gbp = ROUND(
              (jb.pb_content_kg::numeric * ${gbpPrice} * COALESCE(j.customer_traction_percent, j.customer_lme_percent, 0) / 100000),
              2
            )
            FROM jobs AS j
            WHERE jb.job_id = j.id
              AND jb.pb_content_kg IS NOT NULL
              AND jb.pb_content_kg::numeric > 0
              AND (jb.value_gbp IS NULL OR jb.value_gbp::numeric = 0)`
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
        .where(and(jobScope(_req.user!), eq(jobsTable.status, "request")));

      const [tonnageResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.tonnage}), 0)`,
        })
        .from(jobsTable)
        .where(and(jobScope(_req.user!), sql`${jobsTable.submittedAt} >= ${startOfMonth}`));

      const [invoiceThisMonth] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable)
        .where(and(jobScope(_req.user!), sql`${jobsTable.submittedAt} >= ${startOfMonth}`));

      const [invoiceLastMonth] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable)
        .where(
          and(
            sql`${jobsTable.submittedAt} >= ${startOfLastMonth}`,
            jobScope(_req.user!),
            sql`${jobsTable.submittedAt} < ${startOfMonth}`,
          )
        );

      const [invoiceAllTime] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable).where(jobScope(_req.user!));

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
        .where(and(jobScope(_req.user!), sql`${jobsTable.cblLmePercent} IS NOT NULL`));

      const [completedInvoiceResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable)
        .where(
          and(jobScope(_req.user!), or(
            eq(jobsTable.status, "completed"),
            sql`${jobsTable.invoiceStatus} IN ('invoiced', 'paid')`,
          ))
        );

      const [grossProfitResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.grossProfit}), 0)`,
        })
        .from(jobsTable)
        .where(
          and(
            sql`${jobsTable.grossProfit} IS NOT NULL`,
            jobScope(_req.user!),
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
            jobScope(_req.user!),
          )
        );

      const [avgDaysToPayResult] = await db
        .select({
          avg: sql<string>`COALESCE(AVG(${jobsTable.daysToPay}), 0)`,
        })
        .from(jobsTable)
        .where(and(jobScope(_req.user!), sql`${jobsTable.daysToPay} IS NOT NULL`));

      const [overdueResult] = await db
        .select({ count: count() })
        .from(jobsTable)
        .where(and(jobScope(_req.user!), sql`${jobsTable.dueDate} IS NOT NULL AND ${jobsTable.dueDate} < CURRENT_DATE AND ${jobsTable.datePaid} IS NULL`));

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
