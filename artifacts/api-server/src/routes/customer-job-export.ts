import { Router } from "express";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db/schema";
import { and, eq, sql, asc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { jobScope } from "../lib/depot-access";
import { isAdmin } from "../lib/access-policy";
import { kpiDateRange } from "../lib/kpi-policy";

const router = Router();
export function customerJobWorkbook(jobs: (typeof jobsTable.$inferSelect)[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("KPI jobs");
  ws.columns = [
    { header: "Job reference", key: "reference", width: 22 },
    { header: "Tonnage", key: "tonnage", width: 16 },
    { header: "£/t Traction", key: "traction", width: 22 },
    { header: "Pb Tonnage Blocs", key: "blocs", width: 22 },
    { header: "Transport Costs", key: "transport", width: 22 },
    { header: "Ad hoc costs", key: "adHoc", width: 20 },
    { header: "Net invoice value", key: "invoice", width: 22 },
    { header: "Customer invoice Number", key: "invoiceNo", width: 28 },
  ];
  const number = (v: string | null) => v == null || v === "" ? null : Number(v);
  for (const job of jobs) ws.addRow({ reference: job.reference, tonnage: number(job.tonnage),
    traction: number(job.customerTractionRate), blocs: number(job.customerBlocsTonnage),
    transport: number(job.customerTransportCost), adHoc: number(job.customerAdHocCosts),
    invoice: number(job.customerInvoiceValue), invoiceNo: job.customerInvoiceNo ?? "" });
  ws.getRow(1).font = { bold: true };
  for (const key of ["tonnage", "blocs"]) ws.getColumn(key).numFmt = "0.000";
  ws.getColumn("traction").numFmt = '£#,##0.00';
  for (const key of ["transport", "adHoc", "invoice"]) ws.getColumn(key).numFmt = '£#,##0.00';
  ws.getColumn("invoiceNo").numFmt = "@";
  return wb;
}

router.get("/kpi/export.xlsx", requireAuth,
  requireRole("head_office_admin", "lead_client", "accounts"),
  async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req.user!) && !req.user!.clientId) { res.status(403).json({ message: "Client assignment required" }); return; }
    const { from, to, clientId } = req.query as Record<string, string>;
    let dates;
    try { dates = kpiDateRange(from, to); }
    catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Invalid date range" }); return; }
    try {
      const { fromDate, toDate } = dates;
      const jobs = await db.select().from(jobsTable).where(and(
        jobScope(req.user!),
        sql`${jobsTable.submittedAt} >= ${fromDate} AND ${jobsTable.submittedAt} < ${toDate}`,
        isAdmin(req.user!) && clientId && !isNaN(parseInt(clientId)) ? eq(jobsTable.clientId, parseInt(clientId)) : undefined,
      )).orderBy(asc(jobsTable.submittedAt), asc(jobsTable.id));
      const buffer = await customerJobWorkbook(jobs).xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="kpi-jobs-${fromDate.toISOString().slice(0, 10)}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Customer job export failed:", error);
      res.status(500).json({ message: "Could not export this job" });
    }
  });
export default router;
