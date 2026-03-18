import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { lmePricesTable } from "@workspace/db/schema";
import { desc, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

router.get(
  "/lme/current",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (_req, res) => {
    try {
      const [latest] = await db
        .select()
        .from(lmePricesTable)
        .orderBy(desc(lmePricesTable.createdAt))
        .limit(1);

      res.json({ price: latest || null });
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
        res.status(400).json({ message: "USD price and exchange rate are required" });
        return;
      }

      const { usdPrice, exchangeRate } = parsed.data;
      const gbpPrice = (parseFloat(usdPrice) * parseFloat(exchangeRate)).toFixed(2);

      const [price] = await db
        .insert(lmePricesTable)
        .values({
          priceDate: new Date().toISOString().split("T")[0],
          usdPrice,
          exchangeRate,
          gbpPrice,
          source: "manual",
        })
        .returning();

      res.json({ price });
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

export default router;
