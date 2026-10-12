import { Router } from "express";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { jobScope } from "../lib/depot-access";

const router = Router();
export function customerJobWorkbook(job: typeof jobsTable.$inferSelect) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Customer job");
  ws.columns = [
    { header: "Job reference", key: "reference", width: 22 },
    { header: "Tonnage", key: "tonnage", width: 16 },
    { header: "% LME Traction (Customer)", key: "traction", width: 29 },
    { header: "Pb Tonnage Blocs", key: "blocs", width: 22 },
    { header: "Transport Costs", key: "transport", width: 22 },
    { header: "Ad hoc costs", key: "adHoc", width: 20 },
    { header: "Net invoice value", key: "invoice", width: 22 },
    { header: "Customer invoice Number", key: "invoiceNo", width: 28 },
  ];
  const number = (v: string | null) => v == null || v === "" ? null : Number(v);
  ws.addRow({ reference: job.reference, tonnage: number(job.tonnage),
    traction: number(job.customerTractionPercent), blocs: number(job.customerBlocsTonnage),
    transport: number(job.customerTransportCost), adHoc: number(job.customerAdHocCosts),
    invoice: number(job.customerInvoiceValue), invoiceNo: job.customerInvoiceNo ?? "" });
  ws.getRow(1).font = { bold: true };
  for (const key of ["tonnage", "blocs"]) ws.getColumn(key).numFmt = "0.000";
  ws.getColumn("traction").numFmt = '0.00"%"';
  for (const key of ["transport", "adHoc", "invoice"]) ws.getColumn(key).numFmt = '£#,##0.00';
  ws.getColumn("invoiceNo").numFmt = "@";
  return wb;
}

router.get("/jobs/:id/customer-export.xlsx", requireAuth,
  requireRole("head_office_admin", "lead_client", "accounts"),
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) { res.status(404).json({ message: "Job not found" }); return; }
    try {
      const [job] = await db.select().from(jobsTable).where(and(eq(jobsTable.id, id), jobScope(req.user!)));
      if (!job) { res.status(404).json({ message: "Job not found" }); return; }
      const buffer = await customerJobWorkbook(job).xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="job-${id}-customer.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Customer job export failed:", error);
      res.status(500).json({ message: "Could not export this job" });
    }
  });
export default router;
