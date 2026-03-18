import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db/schema";
import { eq, sql, and, count } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/jobs",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { status, page = "1", limit = "10" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 10));
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];
      if (status && status !== "All") {
        conditions.push(eq(jobsTable.status, (status as string).toLowerCase()));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [jobs, [totalResult]] = await Promise.all([
        db
          .select()
          .from(jobsTable)
          .where(whereClause)
          .orderBy(sql`${jobsTable.submittedAt} DESC`)
          .limit(limitNum)
          .offset(offset),
        db
          .select({ count: count() })
          .from(jobsTable)
          .where(whereClause),
      ]);

      const total = totalResult?.count || 0;

      res.json({
        jobs,
        pagination: {
          page: pageNum,
          limit: limitNum,
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
