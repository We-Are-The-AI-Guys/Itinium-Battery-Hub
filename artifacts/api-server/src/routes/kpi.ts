import { Router } from "express";
import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db/schema";
import { sql, and, eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

router.get(
  "/kpi/summary",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { from, to, clientId } = req.query as Record<string, string>;

      const now = new Date();

      let fromDate: Date;
      if (from && /^\d{4}-\d{2}$/.test(from)) {
        fromDate = new Date(from + "-01T00:00:00");
      } else {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      }

      let toDate: Date;
      if (to && /^\d{4}-\d{2}$/.test(to)) {
        const [yr, mo] = to.split("-").map(Number);
        toDate = new Date(yr, mo, 1);
      } else {
        toDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      }

      const clientFilter =
        clientId && !isNaN(parseInt(clientId))
          ? eq(jobsTable.clientId, parseInt(clientId))
          : undefined;

      const dateFilter = sql`${jobsTable.submittedAt} >= ${fromDate} AND ${jobsTable.submittedAt} < ${toDate}`;
      const whereConditions = clientFilter ? and(dateFilter, clientFilter) : dateFilter;

      const monthlyRows = await db
        .select({
          month: sql<string>`TO_CHAR(${jobsTable.submittedAt}, 'YYYY-MM')`,
          jobCount: sql<number>`COUNT(*)::int`,
          tonnage: sql<string>`COALESCE(SUM(${jobsTable.tonnage}), 0)`,
          invoiceValue: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
          grossProfit: sql<string>`COALESCE(SUM(${jobsTable.grossProfit}), 0)`,
          avgCblLmePct: sql<string>`COALESCE(AVG(${jobsTable.cblLmePercent}) FILTER (WHERE ${jobsTable.cblLmePercent} IS NOT NULL), 0)`,
          avgDaysToPay: sql<string>`COALESCE(AVG(${jobsTable.daysToPay}) FILTER (WHERE ${jobsTable.daysToPay} IS NOT NULL), 0)`,
        })
        .from(jobsTable)
        .where(whereConditions)
        .groupBy(sql`TO_CHAR(${jobsTable.submittedAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${jobsTable.submittedAt}, 'YYYY-MM')`);

      const overdueRows = await db
        .select({
          month: sql<string>`TO_CHAR(${jobsTable.submittedAt}, 'YYYY-MM')`,
          overdueCount: sql<number>`COUNT(*)::int`,
          overdueValue: sql<string>`COALESCE(SUM(${jobsTable.calculatedValue}), 0)`,
        })
        .from(jobsTable)
        .where(
          and(
            whereConditions,
            sql`${jobsTable.dueDate} IS NOT NULL AND ${jobsTable.dueDate} < CURRENT_DATE AND ${jobsTable.datePaid} IS NULL`,
          )
        )
        .groupBy(sql`TO_CHAR(${jobsTable.submittedAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${jobsTable.submittedAt}, 'YYYY-MM')`);

      const statusRows = await db
        .select({
          status: jobsTable.status,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(jobsTable)
        .where(whereConditions)
        .groupBy(jobsTable.status);

      const overdueMap = new Map(overdueRows.map((r) => [r.month, r]));
      const monthlyMap = new Map(monthlyRows.map((r) => [r.month, r]));

      const allMonths: string[] = [];
      const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
      while (cur < toDate) {
        const label = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        allMonths.push(label);
        cur.setMonth(cur.getMonth() + 1);
      }

      const months = allMonths.map((m) => {
        const row = monthlyMap.get(m);
        const overdue = overdueMap.get(m);
        const invVal = parseFloat(row?.invoiceValue || "0");
        const gp = parseFloat(row?.grossProfit || "0");
        return {
          month: m,
          jobCount: row?.jobCount || 0,
          tonnage: Math.round(parseFloat(row?.tonnage || "0") * 10) / 10,
          invoiceValue: Math.round(invVal * 100) / 100,
          grossProfit: Math.round(gp * 100) / 100,
          grossMarginPct: invVal > 0 ? Math.round((gp / invVal) * 10000) / 100 : 0,
          avgCblLmePct: Math.round(parseFloat(row?.avgCblLmePct || "0") * 100) / 100,
          avgDaysToPay: Math.round(parseFloat(row?.avgDaysToPay || "0") * 10) / 10,
          overdueCount: overdue?.overdueCount || 0,
          overdueValue: Math.round(parseFloat(overdue?.overdueValue || "0") * 100) / 100,
        };
      });

      const totalInvoiceValue = months.reduce((s, m) => s + m.invoiceValue, 0);
      const totalGrossProfit = months.reduce((s, m) => s + m.grossProfit, 0);

      const [overallAvgs] = await db
        .select({
          avgCblLmePct: sql<string>`COALESCE(AVG(${jobsTable.cblLmePercent}) FILTER (WHERE ${jobsTable.cblLmePercent} IS NOT NULL), 0)`,
          avgDaysToPay: sql<string>`COALESCE(AVG(${jobsTable.daysToPay}) FILTER (WHERE ${jobsTable.daysToPay} IS NOT NULL), 0)`,
        })
        .from(jobsTable)
        .where(whereConditions);

      const avgCblLmePct = parseFloat(overallAvgs?.avgCblLmePct || "0");
      const avgDaysToPay = parseFloat(overallAvgs?.avgDaysToPay || "0");

      const statusBreakdown: Record<string, number> = {};
      for (const r of statusRows) {
        statusBreakdown[r.status] = r.count;
      }

      res.json({
        months,
        totals: {
          jobCount: months.reduce((s, m) => s + m.jobCount, 0),
          tonnage: Math.round(months.reduce((s, m) => s + m.tonnage, 0) * 10) / 10,
          invoiceValue: Math.round(totalInvoiceValue * 100) / 100,
          grossProfit: Math.round(totalGrossProfit * 100) / 100,
          grossMarginPct:
            totalInvoiceValue > 0
              ? Math.round((totalGrossProfit / totalInvoiceValue) * 10000) / 100
              : 0,
          avgCblLmePct: Math.round(avgCblLmePct * 100) / 100,
          avgDaysToPay: Math.round(avgDaysToPay * 10) / 10,
          overdueCount: months.reduce((s, m) => s + m.overdueCount, 0),
          overdueValue: Math.round(months.reduce((s, m) => s + m.overdueValue, 0) * 100) / 100,
        },
        statusBreakdown,
      });
    } catch (error) {
      console.error("KPI summary error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
