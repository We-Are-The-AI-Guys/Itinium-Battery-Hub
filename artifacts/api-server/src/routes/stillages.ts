import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { stillageMovementsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const ADMIN_ROLES = ["team_leader", "accounts", "head_office_admin"];

const createMovementSchema = z.object({
  depot: z.string().min(1, "Depot is required"),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  collected: z.coerce.number().int().min(0, "Collected must be >= 0").default(0),
  droppedOff: z.coerce.number().int().min(0, "Dropped off must be >= 0").default(0),
  notes: z.string().nullable().optional(),
}).refine((data) => data.collected > 0 || data.droppedOff > 0, {
  message: "At least one of collected or dropped off must be greater than 0",
});

const router: IRouter = Router();

function resolveDepotScope(req: AuthenticatedRequest): { depot: string | null; forbidden: boolean } {
  const isAdmin = ADMIN_ROLES.includes(req.user?.role || "");
  if (isAdmin) {
    return { depot: null, forbidden: false };
  }
  if (!req.user?.depot) {
    return { depot: null, forbidden: true };
  }
  return { depot: req.user.depot, forbidden: false };
}

async function buildSummary(depotFilter?: string) {
  let baseQuery = db
    .select({
      depot: stillageMovementsTable.depot,
      totalCollected: sql<number>`COALESCE(SUM(${stillageMovementsTable.collected}), 0)`.as("total_collected"),
      totalDroppedOff: sql<number>`COALESCE(SUM(${stillageMovementsTable.droppedOff}), 0)`.as("total_dropped_off"),
    })
    .from(stillageMovementsTable)
    .groupBy(stillageMovementsTable.depot)
    .orderBy(stillageMovementsTable.depot);

  if (depotFilter) {
    baseQuery = baseQuery.where(eq(stillageMovementsTable.depot, depotFilter)) as typeof baseQuery;
  }

  const summaryRows = await baseQuery;

  const summary = summaryRows.map((row) => ({
    depot: row.depot,
    totalCollected: Number(row.totalCollected),
    totalDroppedOff: Number(row.totalDroppedOff),
    currentCount: Number(row.totalCollected) - Number(row.totalDroppedOff),
  }));

  const totalInCirculation = summary.reduce((acc, s) => acc + s.currentCount, 0);

  return { summary, totalInCirculation };
}

router.get(
  "/stillages",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const scope = resolveDepotScope(req);
      if (scope.forbidden) {
        res.status(403).json({ message: "No depot assigned to your account" });
        return;
      }

      const isAdmin = ADMIN_ROLES.includes(req.user?.role || "");
      const { depot } = req.query;

      let filterDepot: string | undefined;
      if (isAdmin) {
        if (depot && typeof depot === "string") {
          filterDepot = depot;
        }
      } else {
        filterDepot = scope.depot!;
      }

      let query = db
        .select()
        .from(stillageMovementsTable)
        .orderBy(desc(stillageMovementsTable.movementDate), desc(stillageMovementsTable.createdAt));

      if (filterDepot) {
        query = query.where(eq(stillageMovementsTable.depot, filterDepot)) as typeof query;
      }

      const movements = await query;
      const { summary, totalInCirculation } = await buildSummary(filterDepot);

      res.json({ movements, summary, totalInCirculation });
    } catch (error) {
      console.error("Error fetching stillage movements:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/stillages/summary",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const scope = resolveDepotScope(req);
      if (scope.forbidden) {
        res.status(403).json({ message: "No depot assigned to your account" });
        return;
      }

      const { summary, totalInCirculation } = await buildSummary(scope.depot || undefined);

      res.json({ summary, totalInCirculation });
    } catch (error) {
      console.error("Error fetching stillage summary:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/stillages",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = createMovementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0]?.message || "Validation error" });
        return;
      }

      const { depot, movementDate, collected, droppedOff, notes } = parsed.data;
      const isAdmin = ADMIN_ROLES.includes(req.user?.role || "");

      if (!isAdmin && !req.user?.depot) {
        res.status(403).json({ message: "No depot assigned to your account" });
        return;
      }

      const effectiveDepot = isAdmin ? depot : req.user?.depot;

      if (!isAdmin && depot !== req.user?.depot) {
        res.status(403).json({ message: "You can only log movements for your own depot" });
        return;
      }

      const [movement] = await db
        .insert(stillageMovementsTable)
        .values({
          depot: effectiveDepot!,
          movementDate,
          collected,
          droppedOff,
          notes: notes || null,
          createdById: req.user?.id,
        })
        .returning();

      res.status(201).json({ movement });
    } catch (error) {
      console.error("Error creating stillage movement:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
