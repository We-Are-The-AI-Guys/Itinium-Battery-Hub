import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { userLocationsTable, locationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { isCustomer, clientWide } from "../lib/access-policy";

const router = Router();

router.get(
  "/depots",
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      if (isCustomer(_req.user!) && clientWide(_req.user!)) {
        const locations = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.clientId, _req.user!.clientId ?? -1));
        res.json({ depots: locations.map(row => row.name) }); return;
      }
      if (isCustomer(_req.user!)) {
        const locations = await db.select({ name: locationsTable.name }).from(locationsTable)
          .innerJoin(userLocationsTable, eq(userLocationsTable.locationId, locationsTable.id))
          .where(and(eq(userLocationsTable.userId, _req.user!.id), eq(locationsTable.clientId, _req.user!.clientId ?? -1)));
        res.json({ depots: locations.map(row => row.name) }); return;
      }
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
