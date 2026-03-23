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
      const jobId = parseInt(req.params.id, 10);
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

      const jobCount = await db.select({ count: count() }).from(jobsTable);
      const nextNum = (jobCount[0]?.count || 0) + 1;
      const reference = `JOB-${new Date().getFullYear()}-${String(nextNum).padStart(5, "0")}`;

      const [job] = await db
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

      const batteryRows = batteries.map((b: any) => ({
        jobId: job.id,
        palletNumber: b.palletNumber || null,
        assetNumber: b.assetNumber || null,
        batterySerial: b.batterySerial || null,
        manufacture: b.manufacture || null,
        cellType: b.cellType || null,
        voltage: b.voltage || null,
        looseCellsQty: b.looseCellsQty ? parseInt(b.looseCellsQty, 10) : null,
        notes: b.notes || null,
      }));

      const insertedBatteries = await db
        .insert(jobBatteriesTable)
        .values(batteryRows)
        .returning();

      res.status(201).json({ job, batteries: insertedBatteries });
    } catch (error) {
      console.error("Job creation error:", error);
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
