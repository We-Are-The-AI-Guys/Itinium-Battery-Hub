import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, locationsTable, usersTable } from "@workspace/db/schema";
import { eq, sql, ilike, or, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

router.get(
  "/clients",
  requireAuth,
  requireRole("head_office_admin"),
  async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const includeInactive = req.query.includeInactive === "true";

      const conditions = [];
      if (!includeInactive) {
        conditions.push(eq(clientsTable.isActive, true));
      }
      if (search) {
        conditions.push(
          or(
            ilike(clientsTable.name, `%${search}%`),
            ilike(clientsTable.contactName, `%${search}%`)
          )!
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const clients = await db
        .select({
          id: clientsTable.id,
          name: clientsTable.name,
          contactName: clientsTable.contactName,
          contactEmail: clientsTable.contactEmail,
          isActive: clientsTable.isActive,
          createdAt: clientsTable.createdAt,
          locationCount: sql<number>`(SELECT COUNT(*)::int FROM locations WHERE locations.client_id = ${clientsTable.id})`,
          userCount: sql<number>`(SELECT COUNT(*)::int FROM users WHERE users.client_id = ${clientsTable.id})`,
        })
        .from(clientsTable)
        .where(where)
        .orderBy(clientsTable.name);

      res.json({ clients });
    } catch (error) {
      console.error("Clients list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/clients/:id",
  requireAuth,
  requireRole("head_office_admin", "team_leader"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = parseInt(String(req.params.id), 10);
      if (isNaN(clientId)) {
        res.status(400).json({ message: "Invalid client ID" });
        return;
      }

      if (req.user!.role === "team_leader" && req.user!.clientId !== clientId) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const [client] = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId));

      if (!client) {
        res.status(404).json({ message: "Client not found" });
        return;
      }

      const locations = await db
        .select()
        .from(locationsTable)
        .where(and(eq(locationsTable.clientId, clientId), req.user!.role === "head_office_admin" ? undefined :
          req.user!.permittedLocationIds?.length ? inArray(locationsTable.id, req.user!.permittedLocationIds) : sql`false`))
        .orderBy(locationsTable.name);

      const teamLeaders = await db
        .select({
          id: usersTable.id,
          fullName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(usersTable)
        .where(and(eq(usersTable.clientId, clientId), eq(usersTable.role, "team_leader")));

      res.json({ client, locations, teamLeaders: req.user!.role === "head_office_admin" ? teamLeaders : [] });
    } catch (error) {
      console.error("Client detail error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const createClientSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
});

router.post(
  "/clients",
  requireAuth,
  requireRole("head_office_admin"),
  async (_req, res) => {
    try {
      const parsed = createClientSchema.safeParse(_req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
        return;
      }

      const { name, contactName, contactEmail } = parsed.data;

      const [existing] = await db
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(eq(clientsTable.name, name.trim()));

      if (existing) {
        res.status(409).json({ message: "A client with this name already exists" });
        return;
      }

      const [client] = await db
        .insert(clientsTable)
        .values({
          name: name.trim(),
          contactName: contactName || null,
          contactEmail: contactEmail || null,
        })
        .returning();

      res.status(201).json({ client });
    } catch (error) {
      console.error("Create client error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/clients/:id",
  requireAuth,
  requireRole("head_office_admin"),
  async (req, res) => {
    try {
      const clientId = parseInt(String(req.params.id), 10);
      if (isNaN(clientId)) {
        res.status(400).json({ message: "Invalid client ID" });
        return;
      }

      const parsed = updateClientSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
      if (parsed.data.contactName !== undefined) updates.contactName = parsed.data.contactName;
      if (parsed.data.contactEmail !== undefined) updates.contactEmail = parsed.data.contactEmail;
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const [updated] = await db
        .update(clientsTable)
        .set(updates)
        .where(eq(clientsTable.id, clientId))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Client not found" });
        return;
      }

      res.json({ client: updated });
    } catch (error) {
      console.error("Update client error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
