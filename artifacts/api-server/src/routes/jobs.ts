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
  assetNumber?: string | null;
  batterySerial?: string | null;
  manufacture?: string | null;
  cellType?: string | null;
  voltage?: string | null;
  looseCellsQty?: string | number | null;
  estimatedWeightKg?: string | number | null;
  notes?: string | null;
}

router.post(
  "/jobs",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { clientName, depot, collectionPoint, collectionDate, tonnage, tonnageManualOverride, notes, batteries } = req.body;

      if (!clientName || !depot) {
        res.status(400).json({ message: "Client name and depot are required" });
        return;
      }

      if (!batteries || !Array.isArray(batteries) || batteries.length === 0) {
        res.status(400).json({ message: "At least one battery item is required" });
        return;
      }

      const batteryInputs = batteries as BatteryInput[];

      function sanitizeWeight(val: string | number | null | undefined): string | null {
        if (val === null || val === undefined || val === "") return null;
        const parsed = parseFloat(String(val));
        return isFinite(parsed) && parsed >= 0 ? String(parsed) : null;
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
            tonnage: finalTonnage,
            status: "pending",
            notes: notes || null,
            submittedById: req.user!.id,
          })
          .returning();

        const batteryCount = batteryInputs.length;
        const seqResult = await tx.execute(
          sql`SELECT nextval('pallet_number_seq') AS seq FROM generate_series(1, ${batteryCount})`
        );
        const palletNumbers = (seqResult.rows as { seq: string }[]).map(
          (r) => `PLT-${String(r.seq).padStart(5, "0")}`
        );

        const batteryRows = batteryInputs.map((b, idx) => ({
          jobId: job.id,
          palletNumber: palletNumbers[idx],
          assetNumber: b.assetNumber || null,
          batterySerial: b.batterySerial || null,
          manufacture: b.manufacture || null,
          cellType: b.cellType || null,
          voltage: b.voltage || null,
          looseCellsQty: b.looseCellsQty ? parseInt(String(b.looseCellsQty), 10) : null,
          estimatedWeightKg: sanitizeWeight(b.estimatedWeightKg),
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

      const toDecimal = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;
      const toStr = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;

      const updates: Record<string, string | null> = {};
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
      if (invoiceStatus !== undefined) updates.invoiceStatus = toStr(invoiceStatus);

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

      const toDecimal = (v: unknown): string | null =>
        v !== undefined && v !== null && v !== "" ? String(v) : null;

      const updates: Record<string, string | boolean | null> = {};
      if (receiptConfirmed !== undefined) updates.receiptConfirmed = receiptConfirmed === true || receiptConfirmed === "true";
      if (pbContentKg !== undefined) updates.pbContentKg = toDecimal(pbContentKg);
      if (valueGbp !== undefined) updates.valueGbp = toDecimal(valueGbp);
      if (adminNotes !== undefined) updates.adminNotes = adminNotes !== null && adminNotes !== undefined && adminNotes !== "" ? String(adminNotes) : null;

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
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

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
            eq(jobsTable.status, "pending"),
            sql`${jobsTable.submittedAt} >= NOW() - INTERVAL '7 days'`,
          )
        );

      res.json({
        pendingJobs: pendingResult?.count || 0,
        flaggedExceptions: flaggedResult?.count || 0,
        monthlyTonnage: parseFloat(tonnageResult?.total || "0"),
        totalInvoiceValue: parseFloat(invoiceAllTime?.total || "0"),
        pendingThisWeek: weekJobsResult?.count || 0,
        monthOnMonthChange: Math.round(monthOnMonthChange * 10) / 10,
        avgCblLmePercent: Math.round(parseFloat(avgLmeResult?.avg || "0") * 100) / 100,
        totalGrossProfit: parseFloat(grossProfitResult?.total || "0"),
        completedInvoiceValue: parseFloat(completedInvoiceResult?.total || "0"),
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
