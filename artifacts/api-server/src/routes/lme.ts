import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { lmePricesTable } from "@workspace/db/schema";
import { and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

export function previousCalendarMonth(referenceDate: Date): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

export function averageGbpPrice(
  rows: readonly { gbpPrice: string | number }[]
): string | null {
  const values = rows
    .map((row) => Number(row.gbpPrice))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function collectionMonthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

router.get(
  "/lme/current",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
  async (req, res) => {
    try {
      const effectiveDate =
        typeof req.query.effectiveDate === "string" ? req.query.effectiveDate : null;
      if (effectiveDate && !isValidIsoDate(effectiveDate)) {
        res.status(400).json({ message: "effectiveDate must be YYYY-MM-DD" });
        return;
      }

      const [latest] = await db
        .select()
        .from(lmePricesTable)
        .orderBy(desc(lmePricesTable.createdAt))
        .limit(1);

      const month = previousCalendarMonth(new Date());
      const previousMonthRows = await db
        .select({ gbpPrice: lmePricesTable.gbpPrice })
        .from(lmePricesTable)
        .where(
          sql`${lmePricesTable.priceDate} >= ${month.startDate}
            AND ${lmePricesTable.priceDate} < ${month.endDate}`
        );
      const [effectivePrice] = effectiveDate
        ? await db
            .select()
            .from(lmePricesTable)
            .where(
              and(
                gte(lmePricesTable.priceDate, collectionMonthStart(effectiveDate)),
                lte(lmePricesTable.priceDate, effectiveDate)
              )
            )
            .orderBy(desc(lmePricesTable.priceDate), desc(lmePricesTable.createdAt))
            .limit(1)
        : [];

      res.json({
        price: latest || null,
        effectivePrice: effectivePrice || null,
        previousMonthAverage: {
          month: month.label,
          averageGbpPrice: averageGbpPrice(previousMonthRows),
          sampleCount: previousMonthRows.length,
        },
      });
    } catch (error) {
      console.error("LME current price error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const updatePriceSchema = z.object({
  usdPrice: z.string().or(z.number()).transform(String).refine(
    (v) => { const n = parseFloat(v); return !isNaN(n) && n > 0; },
    { message: "USD price must be a positive number" }
  ),
  exchangeRate: z.string().or(z.number()).transform(String).refine(
    (v) => { const n = parseFloat(v); return !isNaN(n) && n > 0 && n < 10; },
    { message: "Exchange rate must be a positive number less than 10" }
  ),
});

router.post(
  "/lme/update",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req, res) => {
    try {
      const parsed = updatePriceSchema.safeParse(req.body);
      if (!parsed.success) {
        const messages = parsed.error.issues.map(i => i.message).join("; ");
        res.status(400).json({ message: messages || "USD price and exchange rate are required" });
        return;
      }

      const { usdPrice, exchangeRate } = parsed.data;
      // exchangeRate is GBP/USD (USD per 1 GBP, e.g. ~1.27), so convert by dividing
      const gbpPrice = (parseFloat(usdPrice) / parseFloat(exchangeRate)).toFixed(2);

      const today = new Date().toISOString().split("T")[0];
      const [price] = await db
        .insert(lmePricesTable)
        .values({
          priceDate: today,
          usdPrice,
          exchangeRate,
          gbpPrice,
          source: "manual",
        })
        .onConflictDoUpdate({
          target: lmePricesTable.priceDate,
          set: { usdPrice, exchangeRate, gbpPrice, source: "manual" },
        })
        .returning();

      const gbpNum = parseFloat(gbpPrice);
      let backfilledCount = 0;
      if (isFinite(gbpNum) && gbpNum > 0) {
        const backfillResult = await db.execute(
          sql`UPDATE job_batteries AS jb
              SET value_gbp = ROUND(
                (jb.pb_content_kg::numeric * ${gbpNum} * COALESCE(j.customer_traction_percent, j.customer_lme_percent, 0) / 100000),
                2
              )
              FROM jobs AS j
              WHERE jb.job_id = j.id
                AND jb.pb_content_kg IS NOT NULL
                AND jb.pb_content_kg::numeric > 0
                AND (jb.value_gbp IS NULL OR jb.value_gbp::numeric = 0)`
        );
        backfilledCount = Number(backfillResult.rowCount) || 0;
      }

      res.json({ price, backfilledBatteries: backfilledCount });
    } catch (error) {
      console.error("LME update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/lme/history",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const history = await db
        .select()
        .from(lmePricesTable)
        .orderBy(desc(lmePricesTable.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(lmePricesTable);

      res.json({ history, total: count });
    } catch (error) {
      console.error("LME history error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/lme/history.csv",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(lmePricesTable)
        .orderBy(desc(lmePricesTable.priceDate));

      const escape = (v: string | number | null | undefined) => {
        const s = v == null ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const lines = ["Date,USD Price,Exchange Rate,GBP Price,Source"];
      for (const r of rows) {
        lines.push([
          escape(r.priceDate),
          escape(r.usdPrice),
          escape(r.exchangeRate),
          escape(r.gbpPrice),
          escape(r.source),
        ].join(","));
      }
      const csv = lines.join("\r\n") + "\r\n";

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="lme-price-history-${stamp}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("LME history CSV error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
