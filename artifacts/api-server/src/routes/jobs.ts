import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobsTable, jobBatteriesTable } from "@workspace/db/schema";
import { eq, sql, and, count, ilike, or } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/jobs",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { status, invoiceStatus, search, limit = "10", offset = "0" } = req.query;
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 10));
      const offsetNum = Math.max(0, parseInt(offset as string, 10) || 0);

      const conditions = [];
      if (status && status !== "All") {
        conditions.push(eq(jobsTable.status, (status as string).toLowerCase()));
      }
      if (invoiceStatus) {
        conditions.push(eq(jobsTable.invoiceStatus, invoiceStatus as string));
      }
      if (search) {
        conditions.push(
          or(
            ilike(jobsTable.reference, `%${search}%`),
            ilike(jobsTable.clientName, `%${search}%`)
          )!
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [jobs, [totalResult]] = await Promise.all([
        db
          .select()
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
  "/jobs/:id",
  requireAuth,
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

      const user = req.user!;
      const isAdmin = ["team_leader", "accounts", "head_office_admin"].includes(user.role);
      if (!isAdmin && job.submittedById !== user.id) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const batteries = await db
        .select()
        .from(jobBatteriesTable)
        .where(eq(jobBatteriesTable.jobId, jobId));

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
  notes?: string | null;
}

router.post(
  "/jobs",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { clientName, depot, collectionPoint, collectionDate, tonnage, notes, batteries } = req.body;

      if (!clientName || !depot || !tonnage) {
        res.status(400).json({ message: "Client name, depot, and tonnage are required" });
        return;
      }

      if (!batteries || !Array.isArray(batteries) || batteries.length === 0) {
        res.status(400).json({ message: "At least one battery item is required" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        const jobCount = await tx.select({ count: count() }).from(jobsTable);
        const nextNum = (jobCount[0]?.count || 0) + 1;
        const reference = `JOB-${new Date().getFullYear()}-${String(nextNum).padStart(5, "0")}`;

        const [job] = await tx
          .insert(jobsTable)
          .values({
            reference,
            clientName,
            depot,
            collectionPoint: collectionPoint || null,
            collectionDate: collectionDate || null,
            tonnage: String(tonnage),
            status: "pending",
            notes: notes || null,
            submittedById: req.user!.id,
          })
          .returning();

        const batteryRows = (batteries as BatteryInput[]).map((b) => ({
          jobId: job.id,
          palletNumber: b.palletNumber || null,
          assetNumber: b.assetNumber || null,
          batterySerial: b.batterySerial || null,
          manufacture: b.manufacture || null,
          cellType: b.cellType || null,
          voltage: b.voltage || null,
          looseCellsQty: b.looseCellsQty ? parseInt(String(b.looseCellsQty), 10) : null,
          notes: b.notes || null,
        }));

        const insertedBatteries = await tx
          .insert(jobBatteriesTable)
          .values(batteryRows)
          .returning();

        return { job, batteries: insertedBatteries };
      });

      res.status(201).json(result);
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
      } = req.body;

      const updates: Record<string, string | null> = {};
      if (cblLmeValue !== undefined) updates.cblLmeValue = cblLmeValue ? String(cblLmeValue) : null;
      if (cblLmePercent !== undefined) updates.cblLmePercent = cblLmePercent ? String(cblLmePercent) : null;
      if (cblLmePrice !== undefined) updates.cblLmePrice = cblLmePrice ? String(cblLmePrice) : null;
      if (transportCost !== undefined) updates.transportCost = transportCost ? String(transportCost) : null;
      if (customerInvoiceValue !== undefined) updates.customerInvoiceValue = customerInvoiceValue ? String(customerInvoiceValue) : null;
      if (customerInvoiceNo !== undefined) updates.customerInvoiceNo = customerInvoiceNo || null;
      if (cblWasteAdviceNoteNo !== undefined) updates.cblWasteAdviceNoteNo = cblWasteAdviceNoteNo || null;
      if (cblDate !== undefined) updates.cblDate = cblDate || null;
      if (totalInvoiceValue !== undefined) updates.totalInvoiceValue = totalInvoiceValue ? String(totalInvoiceValue) : null;
      if (grossProfit !== undefined) updates.grossProfit = grossProfit ? String(grossProfit) : null;
      if (itiniumInvoiceNo !== undefined) updates.itiniumInvoiceNo = itiniumInvoiceNo || null;
      if (tonnage !== undefined) updates.tonnage = tonnage ? String(tonnage) : null;
      if (lmeRateUsed !== undefined) updates.lmeRateUsed = lmeRateUsed ? String(lmeRateUsed) : null;
      if (calculatedValue !== undefined) updates.calculatedValue = calculatedValue ? String(calculatedValue) : null;
      if (invoiceStatus !== undefined) updates.invoiceStatus = invoiceStatus || null;

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
      const validStatuses = ["pending", "approved", "completed", "flagged"];
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

      const { receiptConfirmed, pbContentKg, valueGbp, adminNotes } = req.body;

      const updates: Record<string, string | boolean | null> = {};
      if (receiptConfirmed !== undefined) updates.receiptConfirmed = Boolean(receiptConfirmed);
      if (pbContentKg !== undefined) updates.pbContentKg = pbContentKg ? String(pbContentKg) : null;
      if (valueGbp !== undefined) updates.valueGbp = valueGbp ? String(valueGbp) : null;
      if (adminNotes !== undefined) updates.adminNotes = adminNotes || null;

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

      res.json({ battery: updated });
    } catch (error) {
      console.error("Battery admin update error:", error);
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

      const [pendingResult] = await db
        .select({ count: count() })
        .from(jobsTable)
        .where(eq(jobsTable.status, "pending"));

      const [flaggedResult] = await db
        .select({ count: count() })
        .from(jobsTable)
        .where(eq(jobsTable.status, "flagged"));

      const [tonnageResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.tonnage}), 0)`,
        })
        .from(jobsTable)
        .where(
          and(
            sql`${jobsTable.submittedAt} >= ${startOfMonth}`,
          )
        );

      const [invoiceResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable);

      const [weekJobsResult] = await db
        .select({ count: count() })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.status, "pending"),
            sql`${jobsTable.submittedAt} >= NOW() - INTERVAL '7 days'`,
          )
        );

      res.json({
        pendingJobs: pendingResult?.count || 0,
        flaggedExceptions: flaggedResult?.count || 0,
        monthlyTonnage: parseFloat(tonnageResult?.total || "0"),
        totalInvoiceValue: parseFloat(invoiceResult?.total || "0"),
        pendingThisWeek: weekJobsResult?.count || 0,
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
