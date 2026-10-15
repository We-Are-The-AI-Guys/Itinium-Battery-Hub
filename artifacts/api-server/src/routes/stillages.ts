import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { stillageMovementsTable, locationsTable, clientsTable, accessAuditTable } from "@workspace/db/schema";
import { mayAccessDepot } from "../lib/depot-access";
import { isAdmin, clientWide } from "../lib/access-policy";
import { eq, desc, sql, and, inArray, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

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
    const internal = isAdmin(req.user!);
    const locations = await db.select({
      id: locationsTable.id, clientId: locationsTable.clientId,
      name: locationsTable.name, clientName: clientsTable.name,
    }).from(locationsTable).innerJoin(clientsTable, eq(clientsTable.id, locationsTable.clientId))
      .where(internal ? undefined : and(eq(locationsTable.clientId, req.user!.clientId ?? -1),
        clientWide(req.user!) ? undefined : req.user!.permittedLocationIds?.length ? inArray(locationsTable.id, req.user!.permittedLocationIds) : sql`false`))
      .orderBy(clientsTable.name, locationsTable.name);
    res.json({ locations });
  } catch (error) {
    console.error("Stillage locations error:", error);
    res.status(500).json({ message: "Could not load locations" });
  }
});

function resolveDepotScope(req: AuthenticatedRequest): { depot: string | null; forbidden: boolean } {
  if (isAdmin(req.user!)) {
    return { depot: null, forbidden: false };
  }
  if (!["lead_client", "accounts", "team_leader", "depot_user"].some(role => (req.user?.roles ?? [req.user?.role]).includes(role))) {
    return { depot: null, forbidden: true };
  }
  return { depot: null, forbidden: false };
}

function movementScope(req: AuthenticatedRequest): SQL {
  if (isAdmin(req.user!)) return sql`true`;
  if (!req.user!.clientId) return sql`false`;
  if (clientWide(req.user!)) return eq(stillageMovementsTable.clientId, req.user!.clientId);
  if (!req.user!.permittedLocationIds?.length) return sql`false`;
  return and(eq(stillageMovementsTable.clientId, req.user!.clientId), inArray(stillageMovementsTable.locationId, req.user!.permittedLocationIds))!;
}

async function buildSummary(depotFilter: string | undefined, scope: SQL) {
  let baseQuery = db
    .select({
      depot: stillageMovementsTable.depot,
      locationId: stillageMovementsTable.locationId,
      clientId: stillageMovementsTable.clientId,
      totalCollected: sql<number>`COALESCE(SUM(${stillageMovementsTable.collected}), 0)`.as("total_collected"),
      totalDroppedOff: sql<number>`COALESCE(SUM(${stillageMovementsTable.droppedOff}), 0)`.as("total_dropped_off"),
    })
    .from(stillageMovementsTable)
    .groupBy(stillageMovementsTable.clientId, stillageMovementsTable.locationId, stillageMovementsTable.depot)
    .orderBy(stillageMovementsTable.depot);

  baseQuery = baseQuery.where(and(scope, depotFilter ? eq(stillageMovementsTable.depot, depotFilter) : undefined)) as typeof baseQuery;

  const summaryRows = await baseQuery;

  const summary = summaryRows.map((row) => ({
    depot: row.depot,
    locationId: row.locationId,
    clientId: row.clientId,
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

      const movements = isAdmin(req.user!) ? await query : [];
      const { summary, totalInCirculation } = await buildSummary(filterDepot, movementScope(req));

      res.json(isAdmin(req.user!) ? { movements, summary, totalInCirculation }
        : { summary, scopedTotalInCirculation: totalInCirculation });
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

      res.json(isAdmin(req.user!) ? { summary, totalInCirculation }
        : { summary, scopedTotalInCirculation: totalInCirculation });
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
      if (!isAdmin(req.user!)) { res.status(403).json({ message: "Only Itinium Admin may log movements" }); return; }
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

router.patch("/stillages/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!)) { res.status(403).json({ message: "Only Itinium Admin may edit movements" }); return; }
  const id = Number(req.params.id);
  const parsed = createMovementSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success) { res.status(400).json({ message: "Provide a valid movement and location" }); return; }
  try {
    const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, parsed.data.locationId));
    if (!location) { res.status(400).json({ message: "Location not found" }); return; }
    const movement = await db.transaction(async tx => {
      const [before] = await tx.select().from(stillageMovementsTable).where(eq(stillageMovementsTable.id, id)).for("update");
      if (!before) return null;
      const [after] = await tx.update(stillageMovementsTable).set({
        ...parsed.data, depot: location.name, clientId: location.clientId, notes: parsed.data.notes || null,
      }).where(eq(stillageMovementsTable.id, id)).returning();
      await tx.insert(accessAuditTable).values({ actorId: req.user!.id, action: "stillage.updated", details: { before, after } });
      return after;
    });
    if (!movement) { res.status(404).json({ message: "Movement not found" }); return; }
    res.json({ movement });
  } catch { res.status(500).json({ message: "Could not update movement" }); }
});
export default router;
