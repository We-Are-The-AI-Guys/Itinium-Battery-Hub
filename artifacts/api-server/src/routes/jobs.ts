import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobsTable, jobBatteriesTable, cellModelsTable, lmePricesTable, locationsTable, clientsTable, usersTable, jobDraftsTable } from "@workspace/db/schema";
import { eq, sql, and, count, ilike, or, inArray, desc, asc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { MANUFACTURERS } from "./manufacturers";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { createBrandedDoc } from "../lib/pdf-branding";
import { notifyAdminsNewJob, notifyAdminsFlaggedBatteries, notifySubmitterStatusChange, notifyFlagResolved } from "../lib/notifications";

const CSV_FLAG_REASON = "Missing from CSV import";
const CSV_UNKNOWN_FLAG_REASON = "Unknown value from CSV — please correct";

const SAFE_LOAD_FACTOR = 1.35;

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

      const batteries = await db
        .select()
        .from(jobBatteriesTable)
        .where(eq(jobBatteriesTable.jobId, jobId));

      const invoiceRef = job.itiniumInvoiceNo || job.customerInvoiceNo || job.reference;
      const collectionLabel = job.collectionDate
        ? new Date(`${job.collectionDate}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
          })
        : "—";

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="remittance-${job.reference.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf"`
      );

      const { doc, finalize } = createBrandedDoc(
        `Remittance Advice — ${job.reference}`,
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
        .text(`Remittance Advice`, 40, doc.y, { continued: false });
      doc.moveDown(0.3);

      const generatedStr = `Issued: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
      doc.fontSize(9).fillColor("#475569").font("Helvetica").text(generatedStr, 40);
      doc.moveDown(0.8);

      const topY = doc.y;

      doc.fontSize(10).fillColor(NAVY).font("Helvetica-Bold").text("Supplier:", 40, topY);
      doc.fontSize(10).fillColor("#334155").font("Helvetica")
        .text(job.clientName, 40)
        .text(job.depot, 40);
      if (job.collectionPoint) doc.text(job.collectionPoint, 40);

      doc.fontSize(10).fillColor(NAVY).font("Helvetica-Bold").text("Buyer:", 40);
      doc.fontSize(10).fillColor("#334155").font("Helvetica").text("Itinium Ltd", 40);

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
      infoRow("Itinium Invoice No:", job.itiniumInvoiceNo || "—", topY + 32);
      infoRow("Customer Invoice No:", job.customerInvoiceNo || "—", topY + 48);
      infoRow("Invoice Status:", job.invoiceStatus || "—", topY + 64);

      doc.y = Math.max(doc.y, topY + 105);
      doc.moveDown(1.2);

      doc.moveTo(40, doc.y).lineTo(pageW - 40, doc.y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.moveDown(0.8);

      const batCols = [
        { label: "Pallet", x: 40, w: 48 },
        { label: "Manufacturer / Cell Type", x: 92, w: 160 },
        { label: "Qty", x: 256, w: 35, align: "right" as const },
        { label: "Wt (kg)", x: 295, w: 55, align: "right" as const },
        { label: "Pb (kg)", x: 354, w: 55, align: "right" as const },
        { label: "Value (£)", x: 413, w: 70, align: "right" as const },
      ];

      const headerY = doc.y;
      doc.rect(40, headerY - 4, contentW, 22).fill("#f1f5f9");
      doc.fontSize(8.5).fillColor(NAVY).font("Helvetica-Bold");
      for (const c of batCols) {
        doc.text(c.label, c.x, headerY + 2, { width: c.w, align: c.align, lineBreak: false });
      }
      doc.moveDown(0.2);
      doc.y = headerY + 22;
      doc.font("Helvetica").fillColor("#1e293b");

      let totalPb = 0;
      let totalValue = 0;
      let rowIdx = 0;

      for (const b of batteries) {
        ensureRoom(20);
        const ry = doc.y;
        if (rowIdx % 2 === 1) {
          doc.rect(40, ry - 2, contentW, 18).fill("#f8fafc");
        }
        const pbNum = b.pbContentKg ? parseFloat(b.pbContentKg) : null;
        const valNum = b.valueGbp ? parseFloat(b.valueGbp) : null;
        if (pbNum) totalPb += pbNum;
        if (valNum) totalValue += valNum;

        const qty = b.isLooseCells ? (b.looseCellsQty ? String(b.looseCellsQty) : "—") : "1";
        const weight = b.estimatedWeightKg ? `${parseFloat(b.estimatedWeightKg).toFixed(1)}` : "—";
        const pbStr = pbNum !== null ? pbNum.toFixed(3) : "—";
        const valStr = valNum !== null ? `${valNum.toFixed(2)}` : "—";
        const cellLabel = [b.manufacture, b.cellType].filter(Boolean).join(" / ") || "—";

        doc.fontSize(8.5).fillColor("#1e293b").font("Helvetica");
        doc.text(b.palletNumber || "—", batCols[0].x, ry, { width: batCols[0].w, lineBreak: false });
        doc.text(cellLabel, batCols[1].x, ry, { width: batCols[1].w, lineBreak: false });
        doc.text(qty, batCols[2].x, ry, { width: batCols[2].w, align: "right", lineBreak: false });
        doc.text(weight, batCols[3].x, ry, { width: batCols[3].w, align: "right", lineBreak: false });
        doc.text(pbStr, batCols[4].x, ry, { width: batCols[4].w, align: "right", lineBreak: false });
        doc.text(valStr, batCols[5].x, ry, { width: batCols[5].w, align: "right", lineBreak: false });
        doc.y = ry + 18;
        rowIdx++;
      }

      if (batteries.length === 0) {
        doc.fontSize(9).fillColor("#94a3b8").text("No battery items recorded.", 40);
      }

      ensureRoom(30);
      doc.moveDown(0.4);
      doc.moveTo(40, doc.y).lineTo(pageW - 40, doc.y).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
      doc.moveDown(0.6);

      function summaryRow(label: string, value: string, highlight = false) {
        ensureRoom(18);
        const sy = doc.y;
        doc.fontSize(9)
          .fillColor(highlight ? NAVY : "#475569")
          .font(highlight ? "Helvetica-Bold" : "Helvetica")
          .text(label, 40, sy, { width: contentW - 90, lineBreak: false });
        doc.fontSize(9)
          .fillColor(highlight ? NAVY : "#1e293b")
          .font(highlight ? "Helvetica-Bold" : "Helvetica")
          .text(value, 40, sy, { width: contentW, align: "right", lineBreak: false });
        doc.y = sy + 16;
      }

      summaryRow("Total Pb Content:", `${totalPb.toFixed(3)} kg`);
      summaryRow("LME Rate Used:", job.lmeRateUsed ? `£${parseFloat(job.lmeRateUsed).toLocaleString("en-GB", { minimumFractionDigits: 2 })} / tonne` : "—");
      summaryRow("Tonnage:", job.tonnage ? `${parseFloat(job.tonnage).toFixed(3)} t` : "—");

      doc.moveDown(0.3);
      doc.moveTo(pageW - 190, doc.y).lineTo(pageW - 40, doc.y).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      const calcValue = job.calculatedValue ? parseFloat(job.calculatedValue) : totalValue;
      summaryRow("Calculated Value:", `£${calcValue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, true);

      if (job.grossProfit) {
        const gp = parseFloat(job.grossProfit);
        summaryRow(
          "Gross Profit:",
          `£${gp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          true
        );
      }

      doc.moveDown(1.5);
      ensureRoom(50);
      doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
        .text(
          "This remittance advice is issued by Itinium Ltd and confirms the payment due to the above supplier for batteries collected. All values are calculated based on the LME lead price and Pb content of the batteries collected. Please retain for your records.",
          40, doc.y, { width: contentW }
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

      const batteryRows = await db
        .select()
        .from(jobBatteriesTable)
        .where(eq(jobBatteriesTable.jobId, jobId));

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
  notes?: string | null;
  isLooseCells?: boolean;
  serialFlagReason?: string | null;
  manufacturerFlagReason?: string | null;
  cellModelFlagReason?: string | null;
  voltageFlagReason?: string | null;
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

      if (resolvedLocationId) {
        const [location] = await db
          .select({ name: locationsTable.name, clientId: locationsTable.clientId })
          .from(locationsTable)
          .where(eq(locationsTable.id, resolvedLocationId));
        if (location) {
          depot = location.name;
          if (!resolvedClientId) resolvedClientId = location.clientId;
        }
      }

      if (!depot) {
        res.status(400).json({ message: "Depot is required" });
        return;
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
          const w = b.estimatedWeightKg;
          const parsed = w !== null && w !== undefined && w !== "" ? parseFloat(String(w)) : NaN;
          if (!isFinite(parsed) || parsed <= 0) {
            res.status(400).json({ message: `Battery row ${i + 1}: Estimated weight is required for loose cells and must be a positive number.` });
            return;
          }
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

      let autoTonnage = 0;
      for (const b of batteryInputs) {
        const w = sanitizeWeight(b.estimatedWeightKg);
        if (w !== null) autoTonnage += parseFloat(w);
      }
      const autoTonnageStr = (autoTonnage / 1000).toFixed(3);
      const parsedTonnage = tonnage ? parseFloat(String(tonnage)) : NaN;
      const finalTonnage = (tonnageManualOverride && !isNaN(parsedTonnage) && isFinite(parsedTonnage) && parsedTonnage >= 0)
        ? String(parsedTonnage)
        : autoTonnageStr;

      const finalTonnageNum = parseFloat(finalTonnage);
      const MIN_TONNAGE = 9.5;
      const MAX_TONNAGE = 26.0;
      if (isFinite(finalTonnageNum)) {
        if (finalTonnageNum < MIN_TONNAGE) {
          res.status(400).json({ message: `Minimum collection weight is 10t. Current load is ${finalTonnageNum.toFixed(3)}t.` });
          return;
        }
        if (finalTonnageNum > MAX_TONNAGE) {
          res.status(400).json({ message: `Maximum collection weight is ${MAX_TONNAGE}t. Current load is ${finalTonnageNum.toFixed(3)}t.` });
          return;
        }
      }

      const knownManufacturers = new Set(
        MANUFACTURERS.filter((m) => m.toLowerCase() !== "other").map((m) => m.toLowerCase())
      );
      const allCellModels = await db
        .select({
          manufacturer: cellModelsTable.manufacturer,
          modelName: cellModelsTable.modelName,
          pbContentKgPerCell: cellModelsTable.pbContentKgPerCell,
          cellsCount: cellModelsTable.cellsCount,
        })
        .from(cellModelsTable);

      for (const b of batteryInputs) {
        const mfrStr = (b.manufacture || "").trim();
        const cellTypeStr = (b.cellType || "").trim();
        const cellModelApplies = cellTypeStr !== "Blocs" && cellTypeStr !== "Other";

        if (!b.manufacturerFlagReason) {
          if (!mfrStr) {
            b.manufacturerFlagReason = CSV_FLAG_REASON;
          } else if (!knownManufacturers.has(mfrStr.toLowerCase())) {
            b.manufacturerFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
        }

        if (!b.cellModelFlagReason && cellModelApplies) {
          if (!cellTypeStr) {
            b.cellModelFlagReason = CSV_FLAG_REASON;
          } else if (allCellModels.length > 0) {
            const matches = allCellModels.some(
              (m) =>
                m.modelName.toLowerCase() === cellTypeStr.toLowerCase() &&
                (!mfrStr || m.manufacturer.toLowerCase() === mfrStr.toLowerCase())
            );
            if (!matches) b.cellModelFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
        }
      }

      const result = await db.transaction(async (tx) => {
        const jobCount = await tx.select({ count: count() }).from(jobsTable);
        const nextNum = (jobCount[0]?.count || 0) + 1;
        const reference = `JOB-${new Date().getFullYear()}-${String(nextNum).padStart(5, "0")}`;

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
            status: "request",
            notes: notes || null,
            submittedById: req.user!.id,
            lmeRateUsed: latestLmeGbpPrice !== null ? String(latestLmeGbpPrice) : null,
          })
          .returning();

        const uniqueCellKeys = [...new Set(
          batteryInputs
            .filter(b => b.manufacture && b.cellType)
            .map(b => `${b.manufacture}|${b.cellType}`)
        )];
        const pbLookup = new Map<string, string>();
        if (uniqueCellKeys.length > 0) {
          for (const cm of allCellModels) {
            if (cm.pbContentKgPerCell != null) {
              const key = `${cm.manufacturer}|${cm.modelName}`;
              const totalPb = parseFloat(cm.pbContentKgPerCell) * cm.cellsCount;
              pbLookup.set(key, totalPb.toFixed(3));
            }
          }
        }

        const batteryRows = batteryInputs.map((b) => {
          const pbKey = `${b.manufacture}|${b.cellType}`;
          const pbContentKg = pbLookup.get(pbKey) || null;
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
            isLooseCells: b.isLooseCells || false,
            serialFlagReason: b.serialFlagReason || null,
            manufacturerFlagReason: b.manufacturerFlagReason || null,
            cellModelFlagReason: b.cellModelFlagReason || null,
            voltageFlagReason: b.voltageFlagReason || null,
            rowPhoto: b.rowPhoto || null,
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
    } catch (error) {
      console.error("Job creation error:", error);
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
        customerInvoiceValue, customerInvoiceNo, cblWasteAdviceNoteNo,
        cblDate, totalInvoiceValue, grossProfit, itiniumInvoiceNo,
        tonnage, lmeRateUsed, calculatedValue, invoiceStatus,
        invoiceReceivedDate, dueDate, datePaid,
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
      const isValidDate = (v: unknown): boolean => {
        if (!v || typeof v !== "string") return false;
        const match = /^\d{4}-\d{2}-\d{2}$/.test(v);
        if (!match) return false;
        const d = new Date(v);
        return !isNaN(d.getTime());
      };

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

      const { receiptConfirmed, pbContentKg, valueGbp, adminNotes, manufacture, cellType, voltage, batterySerial, clearSerialFlag } = req.body;

      const toDecimal = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;
      const toTrimmedStr = (v: unknown): string | null => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      };

      const updates: Record<string, string | boolean | number | Date | null> = {};
      if (receiptConfirmed !== undefined) updates.receiptConfirmed = receiptConfirmed === true || receiptConfirmed === "true";
      if (pbContentKg !== undefined) updates.pbContentKg = toDecimal(pbContentKg);
      if (valueGbp !== undefined) updates.valueGbp = toDecimal(valueGbp);
      if (adminNotes !== undefined) updates.adminNotes = adminNotes !== null && adminNotes !== undefined && adminNotes !== "" ? String(adminNotes) : null;

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

      if (manufacture !== undefined) {
        const v = toTrimmedStr(manufacture);
        updates.manufacture = v;
        if (v !== null) {
          updates.manufacturerFlagReason = null;
          if (existing.manufacturerFlagReason) clearedAnyFlag = true;
        }
      }
      if (cellType !== undefined) {
        const v = toTrimmedStr(cellType);
        updates.cellType = v;
        if (v !== null) {
          updates.cellModelFlagReason = null;
          if (existing.cellModelFlagReason) clearedAnyFlag = true;
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

      let resolvedByName: string | null = null;
      if (updated.resolvedById != null) {
        const [resolver] = await db
          .select({ fullName: usersTable.fullName })
          .from(usersTable)
          .where(eq(usersTable.id, updated.resolvedById));
        resolvedByName = resolver?.fullName || null;
      }

      res.json({ battery: { ...updated, resolvedByName } });

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

export default router;
