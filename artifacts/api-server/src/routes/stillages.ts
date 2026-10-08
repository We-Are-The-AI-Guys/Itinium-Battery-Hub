import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { stillageMovementsTable, locationsTable, clientsTable } from "@workspace/db/schema";
import { mayAccessDepot } from "../lib/depot-access";
import { eq, desc, sql, and, inArray, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const ADMIN_ROLES = ["accounts", "head_office_admin"];

const createMovementSchema = z.object({
  locationId: z.coerce.number().int().positive("Select a location"),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  collected: z.coerce.number().int().min(0, "Collected must be >= 0").default(0),
  droppedOff: z.coerce.number().int().min(0, "Dropped off must be >= 0").default(0),
  notes: z.string().nullable().optional(),
}).refine((data) => data.collected > 0 || data.droppedOff > 0, {
  message: "At least one of collected or dropped off must be greater than 0",
});

const router: IRouter = Router();

router.get("/stillages/locations", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (resolveDepotScope(req).forbidden) { res.status(403).json({ message: "Access denied" }); return; }
    const internal = ADMIN_ROLES.includes(req.user!.role);
    const locations = await db.select({
      id: locationsTable.id, clientId: locationsTable.clientId,
      name: locationsTable.name, clientName: clientsTable.name,
    }).from(locationsTable).innerJoin(clientsTable, eq(clientsTable.id, locationsTable.clientId))
      .where(internal ? undefined : and(eq(locationsTable.clientId, req.user!.clientId ?? -1),
        req.user!.permittedLocationIds?.length ? inArray(locationsTable.id, req.user!.permittedLocationIds) : sql`false`))
      .orderBy(clientsTable.name, locationsTable.name);
    res.json({ locations });
  } catch (error) {
    console.error("Stillage locations error:", error);
    res.status(500).json({ message: "Could not load locations" });
  }
});

function resolveDepotScope(req: AuthenticatedRequest): { depot: string | null; forbidden: boolean } {
  const isAdmin = ADMIN_ROLES.includes(req.user?.role || "");
  if (isAdmin) {
    return { depot: null, forbidden: false };
  }
  if (!["team_leader", "depot_user"].includes(req.user?.role || "")) {
    return { depot: null, forbidden: true };
  }
  return { depot: null, forbidden: false };
}

function movementScope(req: AuthenticatedRequest): SQL {
  if (ADMIN_ROLES.includes(req.user!.role)) return sql`true`;
  if (!req.user!.clientId || !req.user!.permittedLocationIds?.length) return sql`false`;
  return and(eq(stillageMovementsTable.clientId, req.user!.clientId), inArray(stillageMovementsTable.locationId, req.user!.permittedLocationIds))!;
}

async function buildSummary(depotFilter: string | undefined, scope: SQL) {
  let baseQuery = db
    .select({
      depot: stillageMovementsTable.depot,
      totalCollected: sql<number>`COALESCE(SUM(${stillageMovementsTable.collected}), 0)`.as("total_collected"),
      totalDroppedOff: sql<number>`COALESCE(SUM(${stillageMovementsTable.droppedOff}), 0)`.as("total_dropped_off"),
    })
    .from(stillageMovementsTable)
    .groupBy(stillageMovementsTable.depot)
    .orderBy(stillageMovementsTable.depot);

  baseQuery = baseQuery.where(and(scope, depotFilter ? eq(stillageMovementsTable.depot, depotFilter) : undefined)) as typeof baseQuery;

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

      const { depot } = req.query;
      const filterDepot = typeof depot === "string" ? depot : undefined;

      let query = db
        .select()
        .from(stillageMovementsTable)
        .orderBy(desc(stillageMovementsTable.movementDate), desc(stillageMovementsTable.createdAt));

      query = query.where(and(movementScope(req), filterDepot ? eq(stillageMovementsTable.depot, filterDepot) : undefined)) as typeof query;

      const movements = await query;
      const { summary, totalInCirculation } = await buildSummary(filterDepot, movementScope(req));

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

      const { summary, totalInCirculation } = await buildSummary(scope.depot || undefined, movementScope(req));

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

      const { locationId, movementDate, collected, droppedOff, notes } = parsed.data;
      const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
      if (!location || !mayAccessDepot(req.user!, { clientId: location.clientId, locationId: location.id })) {
        res.status(403).json({ message: "Select a permitted depot" }); return;
      }

      const [movement] = await db
        .insert(stillageMovementsTable)
        .values({
          depot: location.name,
          clientId: location.clientId,
          locationId: location.id,
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
