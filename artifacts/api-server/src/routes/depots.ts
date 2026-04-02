import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

router.get(
  "/depots",
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await db.execute(
        sql`SELECT DISTINCT depot FROM users WHERE depot IS NOT NULL AND depot != '' ORDER BY depot`
      );
      const depots = (result.rows as Array<{ depot: string }>).map((r) => r.depot);
      res.json({ depots });
    } catch {
      res.status(500).json({ message: "Failed to fetch depots" });
    }
  }
);

export default router;
