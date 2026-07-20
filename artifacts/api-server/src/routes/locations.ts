import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { locationsTable, clientsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

function canAccessClient(req: AuthenticatedRequest, clientId: number): boolean {
  if (req.user!.role === "head_office_admin") return true;
  if (req.user!.role === "team_leader" && req.user!.clientId === clientId) return true;
  return false;
}

router.get(
  "/clients/:clientId/locations",
  requireAuth,
  requireRole("head_office_admin", "team_leader"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = parseInt(String(req.params.clientId), 10);
      if (isNaN(clientId)) {
        res.status(400).json({ message: "Invalid client ID" });
        return;
      }

      if (req.user!.role !== "head_office_admin" && req.user!.clientId !== clientId) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const [client] = await db
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId));

      if (!client) {
        res.status(404).json({ message: "Client not found" });
        return;
      }

      const locations = await db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.clientId, clientId))
        .orderBy(locationsTable.name);

      res.json({ locations });
    } catch (error) {
      console.error("Locations list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const createLocationSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  address: z.string().nullable().optional(),
  siteContacts: z.string().nullable().optional(),
  siteContactName: z.string().max(255).nullable().optional(),
  siteContactPhone: z.string().max(100).nullable().optional(),
  siteHours: z.string().max(255).nullable().optional(),
  specialInstructions: z.string().nullable().optional(),
});

router.post(
  "/clients/:clientId/locations",
  requireAuth,
  requireRole("head_office_admin", "team_leader"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = parseInt(String(req.params.clientId), 10);
      if (isNaN(clientId)) {
        res.status(400).json({ message: "Invalid client ID" });
        return;
      }

      if (!canAccessClient(req, clientId)) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const parsed = createLocationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
        return;
      }

      const [client] = await db
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId));

      if (!client) {
        res.status(404).json({ message: "Client not found" });
        return;
      }

      const { name, address, siteContacts, siteContactName, siteContactPhone, siteHours, specialInstructions } = parsed.data;

      const [location] = await db
        .insert(locationsTable)
        .values({
          clientId,
          name: name.trim(),
          address: address || null,
          siteContacts: siteContacts || null,
          siteContactName: siteContactName || null,
          siteContactPhone: siteContactPhone || null,
          siteHours: siteHours || null,
          specialInstructions: specialInstructions || null,
        })
        .returning();

      res.status(201).json({ location });
    } catch (error) {
      console.error("Create location error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  siteContacts: z.string().nullable().optional(),
  siteContactName: z.string().max(255).nullable().optional(),
  siteContactPhone: z.string().max(100).nullable().optional(),
  siteHours: z.string().max(255).nullable().optional(),
  specialInstructions: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/clients/:clientId/locations/:id",
  requireAuth,
  requireRole("head_office_admin", "team_leader"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = parseInt(String(req.params.clientId), 10);
      const locationId = parseInt(String(req.params.id), 10);
      if (isNaN(clientId) || isNaN(locationId)) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      if (!canAccessClient(req, clientId)) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const parsed = updateLocationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
      if (parsed.data.address !== undefined) updates.address = parsed.data.address;
      if (parsed.data.siteContacts !== undefined) updates.siteContacts = parsed.data.siteContacts;
      if (parsed.data.siteContactName !== undefined) updates.siteContactName = parsed.data.siteContactName;
      if (parsed.data.siteContactPhone !== undefined) updates.siteContactPhone = parsed.data.siteContactPhone;
      if (parsed.data.siteHours !== undefined) updates.siteHours = parsed.data.siteHours;
      if (parsed.data.specialInstructions !== undefined) updates.specialInstructions = parsed.data.specialInstructions;
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const [updated] = await db
        .update(locationsTable)
        .set(updates)
        .where(and(eq(locationsTable.id, locationId), eq(locationsTable.clientId, clientId)))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Location not found" });
        return;
      }

      res.json({ location: updated });
    } catch (error) {
      console.error("Update location error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
