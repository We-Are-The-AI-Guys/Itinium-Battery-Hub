import { rolesOf, validateRoles } from "../lib/access-policy";
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, clientsTable, locationsTable, sessionsTable, userLocationsTable } from "@workspace/db/schema";
import { userLocationIds } from "../lib/user-memberships";
import { eq, sql, and, ilike, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

function managedUserScope(user: NonNullable<AuthenticatedRequest["user"]>) {
  const ids = user.permittedLocationIds ?? [];
  if (!ids.length || !user.clientId) return sql`false`;
  return sql`${usersTable.clientId} = ${user.clientId} AND ${usersTable.role} = 'depot_user'
    AND EXISTS (SELECT 1 FROM user_locations ul WHERE ul.user_id = ${usersTable.id})
    AND NOT EXISTS (SELECT 1 FROM user_locations ul WHERE ul.user_id = ${usersTable.id} AND ul.location_id NOT IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)}))`;
}

router.get(
  "/users/stats",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const isTeamLeader = req.user!.role === "team_leader";
      if (isTeamLeader && !req.user!.clientId) {
        res.status(403).json({ message: "Team leader has no client assigned" });
        return;
      }
      const clientFilter = isTeamLeader
        ? sql`AND ${managedUserScope(req.user!)}`
        : sql``;

      const result = await db.execute(sql`
        SELECT
          count(*)::int as total,
          count(*) filter (where role = 'depot_user')::int as "depotUsers",
          count(*) filter (where role = 'team_leader')::int as "teamLeaders",
          count(*) filter (where role in ('accounts', 'head_office_admin'))::int as "adminStaff"
        FROM users
        WHERE 1=1 ${clientFilter}
      `);

      const rows = result.rows as Record<string, unknown>[];
      const stats = rows?.[0] ?? { total: 0, depotUsers: 0, teamLeaders: 0, adminStaff: 0 };
      res.json(stats);
    } catch (error) {
      console.error("User stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/users",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const offset = parseInt(req.query.offset as string) || 0;
      const role = req.query.role as string | undefined;
      const search = req.query.search as string | undefined;

      const conditions = [];

      if (req.user!.role === "team_leader") {
        if (!req.user!.clientId) {
          res.status(403).json({ message: "Team leader has no client assigned" });
          return;
        }
        conditions.push(eq(usersTable.clientId, req.user!.clientId));
        conditions.push(managedUserScope(req.user!));
      }

      if (role && role !== "all") {
        conditions.push(eq(usersTable.role, role));
      }

      if (search) {
        conditions.push(
          or(
            ilike(usersTable.fullName, `%${search}%`),
            ilike(usersTable.email, `%${search}%`)
          )!
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const users = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
          role: usersTable.role,
          roles: usersTable.roles,
          depot: usersTable.depot,
          clientId: usersTable.clientId,
          locationId: usersTable.locationId,
          collectionCompanyId: usersTable.collectionCompanyId,
          isActive: usersTable.isActive,
          lastActiveAt: usersTable.lastActiveAt,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .where(where)
        .orderBy(usersTable.fullName)
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(where);

      const enrichedUsers = [];
      for (const u of users) {
        let clientName: string | null = null;
        let locationName: string | null = null;
        if (u.clientId) {
          const [c] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, u.clientId));
          if (c) clientName = c.name;
        }
        if (u.locationId) {
          const [l] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, u.locationId));
          if (l) locationName = l.name;
        }
        enrichedUsers.push({ ...u, roles: rolesOf(u), clientName, locationName, permittedLocationIds: await userLocationIds(u.id, u.clientId) });
      }

      res.json({ users: enrichedUsers, total: count });
    } catch (error) {
      console.error("Users list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const createUserSchema = z.object({
  roles: z.array(z.enum(["head_office_admin", "lead_client", "accounts", "team_leader", "depot_user", "collection_company"])).min(1).optional(),
  permittedLocationIds: z.array(z.number().int().positive()).optional(),
  fullName: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["lead_client", "depot_user", "team_leader", "accounts", "head_office_admin", "collection_company"]),
  depot: z.string().nullable().optional(),
  clientId: z.number().nullable().optional(),
  locationId: z.number().nullable().optional(),
  collectionCompanyId: z.number().nullable().optional(),
  password: z.string().min(6).optional(),
});

router.post(
  "/users",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid user data", errors: parsed.error.issues });
        return;
      }

      const { fullName, email, depot, password } = parsed.data;
      const assignedRoles = [...new Set(parsed.data.roles ?? [parsed.data.role])];
      const role = assignedRoles[0];
      const roleError = validateRoles(assignedRoles, parsed.data.clientId ?? null, parsed.data.collectionCompanyId ?? null);
      if (roleError) { res.status(400).json({ message: roleError }); return; }
      let { clientId, locationId } = parsed.data;

      if (req.user!.role === "team_leader") {
        if (role !== "depot_user") {
          res.status(403).json({ message: "Team leaders can only create depot users" });
          return;
        }
        clientId = req.user!.clientId;
        if (!clientId) {
          res.status(400).json({ message: "Team leader has no client assigned" });
          return;
        }
        if (locationId) {
          const [loc] = await db
            .select({ clientId: locationsTable.clientId })
            .from(locationsTable)
            .where(eq(locationsTable.id, locationId));
          if (!loc || loc.clientId !== clientId) {
            res.status(400).json({ message: "Location does not belong to your client" });
            return;
          }
        }
      }

      const collectionCompanyId = parsed.data.collectionCompanyId ?? null;
      if (role === "collection_company") {
        if (req.user!.role !== "head_office_admin") {
          res.status(403).json({ message: "Only head office admins can create collection company users" });
          return;
        }
        if (!collectionCompanyId) {
          res.status(400).json({ message: "Collection company is required for the Collection Company role" });
          return;
        }
      }

      if ((role === "depot_user" || role === "team_leader") && !clientId) {
        res.status(400).json({ message: "Client is required for Depot User and Team Leader roles" });
        return;
      }

      const permittedIds = [...new Set(parsed.data.permittedLocationIds ?? (locationId ? [locationId] : []))];
      // An administrator's explicit default selection is also an access grant.
      if (!permittedIds.length && req.user!.role === "head_office_admin" && locationId) permittedIds.push(locationId);
      for (const id of permittedIds) {
        const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, id));
        if (!loc || loc.clientId !== clientId || (req.user!.role === "team_leader" && !req.user!.permittedLocationIds?.includes(id))) {
          res.status(403).json({ message: "Cannot grant access to this location" }); return;
        }
      }
      if (locationId && !permittedIds.includes(locationId)) {
        res.status(400).json({ message: "Default location must be a permitted location" }); return;
      }

      if (locationId && !clientId) {
        res.status(400).json({ message: "Cannot assign a location without a client" });
        return;
      }
      if (locationId && clientId) {
        const [loc] = await db
          .select({ clientId: locationsTable.clientId })
          .from(locationsTable)
          .where(eq(locationsTable.id, locationId));
        if (!loc || loc.clientId !== clientId) {
          res.status(400).json({ message: "Location does not belong to the specified client" });
          return;
        }
      }

      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email.toLowerCase().trim()));

      if (existing) {
        res.status(409).json({ message: "A user with this email already exists" });
        return;
      }

      let locationName: string | null = null;
      if (locationId) {
        const [loc] = await db
          .select({ name: locationsTable.name })
          .from(locationsTable)
          .where(eq(locationsTable.id, locationId));
        if (loc) locationName = loc.name;
      }

      const tempPassword = password || crypto.randomBytes(12).toString("base64url");
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const user = await db.transaction(async tx => {
      const [created] = await tx
        .insert(usersTable)
        .values({
          fullName,
          email: email.toLowerCase().trim(),
          role,
          roles: assignedRoles,
          depot: locationName || depot || null,
          clientId: clientId || null,
          locationId: locationId || null,
          collectionCompanyId: role === "collection_company" ? collectionCompanyId : null,
          passwordHash,
          isActive: true,
        })
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
          role: usersTable.role,
          depot: usersTable.depot,
          clientId: usersTable.clientId,
          locationId: usersTable.locationId,
          isActive: usersTable.isActive,
          createdAt: usersTable.createdAt,
        });

      if (permittedIds.length) await tx.insert(userLocationsTable).values(permittedIds.map(locationId => ({ userId: created.id, locationId })));
      return created;
      });
      res.status(201).json({ user: { ...user, permittedLocationIds: permittedIds }, tempPassword });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/users/:id/password",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = parseInt(req.params.id as string);
      if (isNaN(userId)) {
        res.status(400).json({ message: "Invalid user ID" });
        return;
      }

      const { password } = req.body as { password?: string };
      if (!password || password.length < 6) {
        res.status(400).json({ message: "Password must be at least 6 characters" });
        return;
      }

      const [target] = await db
        .select({ id: usersTable.id, clientId: usersTable.clientId, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId));

      if (!target) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      if (req.user!.role === "team_leader") {
        if (target.clientId !== req.user!.clientId || target.role !== "depot_user") {
          res.status(403).json({ message: "Access denied" });
          return;
        }
        const ids = await userLocationIds(userId, target.clientId);
        if (!ids.length || ids.some(id => !req.user!.permittedLocationIds?.includes(id))) {
          res.status(403).json({ message: "User is outside your permitted locations" }); return;
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await db.transaction(async (tx) => {
        await tx.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
        await tx.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const updateUserSchema = z.object({
  roles: z.array(z.enum(["head_office_admin", "lead_client", "accounts", "team_leader", "depot_user", "collection_company"])).min(1).optional(),
  permittedLocationIds: z.array(z.number().int().positive()).optional(),
  fullName: z.string().min(1).optional(),
  role: z.enum(["lead_client", "depot_user", "team_leader", "accounts", "head_office_admin", "collection_company"]).optional(),
  collectionCompanyId: z.number().nullable().optional(),
  depot: z.string().nullable().optional(),
  clientId: z.number().nullable().optional(),
  locationId: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/users/:id",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = parseInt(req.params.id as string);
      if (isNaN(userId)) {
        res.status(400).json({ message: "Invalid user ID" });
        return;
      }

      if (req.user!.role === "team_leader") {
        if (!req.user!.clientId) {
          res.status(403).json({ message: "Team leader has no client assigned" });
          return;
        }
        const [target] = await db
          .select({ clientId: usersTable.clientId, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, userId));

        if (!target || target.clientId !== req.user!.clientId) {
          res.status(403).json({ message: "Access denied" });
          return;
        }
        if (target.role !== "depot_user") {
          res.status(403).json({ message: "Team leaders can only edit depot users" });
          return;
        }
      }

      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid update data", errors: parsed.error.issues });
        return;
      }

      if (req.user!.role === "team_leader" && parsed.data.role && parsed.data.role !== "depot_user") {
        res.status(403).json({ message: "Team leaders can only assign depot_user role" });
        return;
      }

      const [membershipTarget] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!membershipTarget) { res.status(404).json({ message: "User not found" }); return; }
      const assignedRoles = [...new Set(parsed.data.roles ?? (parsed.data.role ? [parsed.data.role] : rolesOf(membershipTarget)))];
      const rolesChanged = parsed.data.roles !== undefined || parsed.data.role !== undefined || parsed.data.clientId !== undefined || parsed.data.collectionCompanyId !== undefined;
      const roleError = validateRoles(assignedRoles,
        parsed.data.clientId === undefined ? membershipTarget.clientId : parsed.data.clientId,
        parsed.data.collectionCompanyId === undefined ? membershipTarget.collectionCompanyId : parsed.data.collectionCompanyId);
      if (rolesChanged && roleError) { res.status(400).json({ message: roleError }); return; }
      const oldIds = await userLocationIds(userId, membershipTarget.clientId);
      if (req.user!.role === "team_leader" && (!oldIds.length || oldIds.some(id => !req.user!.permittedLocationIds?.includes(id)))) {
        res.status(403).json({ message: "User is outside your permitted locations" }); return;
      }
      const nextClient = req.user!.role === "head_office_admin" && parsed.data.clientId !== undefined ? parsed.data.clientId : membershipTarget.clientId;
      const permittedIds = [...new Set(parsed.data.permittedLocationIds ?? (nextClient !== membershipTarget.clientId ? [] : oldIds))];
      if (parsed.data.locationId && !nextClient) {
        res.status(400).json({ message: "Cannot assign a location without a client" }); return;
      }
      if (!permittedIds.length && req.user!.role === "head_office_admin" && parsed.data.locationId) {
        permittedIds.push(parsed.data.locationId);
      }
      for (const id of permittedIds) {
        const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, id));
        if (!loc || loc.clientId !== nextClient || (req.user!.role === "team_leader" && !req.user!.permittedLocationIds?.includes(id))) {
          res.status(403).json({ message: "Cannot grant access to this location" }); return;
        }
      }
      const requestedDefault = parsed.data.locationId === undefined ? membershipTarget.locationId : parsed.data.locationId;
      if (parsed.data.locationId && !permittedIds.includes(parsed.data.locationId)) {
        res.status(400).json({ message: "Default location must be a permitted location" }); return;
      }
      if (requestedDefault && !permittedIds.includes(requestedDefault)) parsed.data.locationId = null;
      const updates: Record<string, unknown> = {};
      if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
      if (parsed.data.role !== undefined || parsed.data.roles !== undefined) { updates.role = assignedRoles[0]; updates.roles = assignedRoles; }
      if (parsed.data.depot !== undefined) updates.depot = parsed.data.depot;
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      if (req.user!.role === "head_office_admin") {
        if (parsed.data.clientId !== undefined) updates.clientId = parsed.data.clientId;
        if (parsed.data.locationId !== undefined) updates.locationId = parsed.data.locationId;
        if (parsed.data.collectionCompanyId !== undefined) updates.collectionCompanyId = parsed.data.collectionCompanyId;

        const [existingUser] = await db
          .select({ clientId: usersTable.clientId, locationId: usersTable.locationId })
          .from(usersTable)
          .where(eq(usersTable.id, userId));

        if (!existingUser) {
          res.status(404).json({ message: "User not found" });
          return;
        }

        const effectiveClientId = updates.clientId !== undefined
          ? (updates.clientId as number | null)
          : existingUser.clientId;
        // A changed client cannot retain a default from the previous client.
        if (effectiveClientId !== existingUser.clientId && parsed.data.locationId === undefined) {
          updates.locationId = null;
          updates.depot = null;
        }
        const effectiveLocationId = updates.locationId !== undefined
          ? (updates.locationId as number | null)
          : existingUser.locationId;

        if (effectiveLocationId) {
          if (!effectiveClientId) {
            res.status(400).json({ message: "Cannot assign a location without a client" });
            return;
          }
          const [loc] = await db
            .select({ clientId: locationsTable.clientId, name: locationsTable.name })
            .from(locationsTable)
            .where(eq(locationsTable.id, effectiveLocationId));
          if (!loc || loc.clientId !== effectiveClientId) {
            res.status(400).json({ message: "Location does not belong to the specified client" });
            return;
          }
          if (parsed.data.locationId !== undefined) {
            updates.depot = loc.name;
          }
        } else if (updates.locationId === null) {
          updates.depot = null;
        }
      }

      if (parsed.data.locationId !== undefined && req.user!.role === "team_leader") {
        if (parsed.data.locationId) {
          const [loc] = await db
            .select({ clientId: locationsTable.clientId, name: locationsTable.name })
            .from(locationsTable)
            .where(eq(locationsTable.id, parsed.data.locationId));
          if (!loc || loc.clientId !== req.user!.clientId) {
            res.status(400).json({ message: "Location does not belong to your client" });
            return;
          }
          updates.locationId = parsed.data.locationId;
          updates.depot = loc.name;
        } else {
          updates.locationId = null;
          updates.depot = null;
        }
      }

      if (Object.keys(updates).length === 0 && parsed.data.permittedLocationIds === undefined) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const user = await db.transaction(async tx => {
      const [updated] = await tx
        .update(usersTable)
        .set(Object.keys(updates).length ? updates : { fullName: membershipTarget.fullName })
        .where(eq(usersTable.id, userId))
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
          role: usersTable.role,
          depot: usersTable.depot,
          clientId: usersTable.clientId,
          locationId: usersTable.locationId,
          isActive: usersTable.isActive,
          createdAt: usersTable.createdAt,
        });

      await tx.delete(userLocationsTable).where(eq(userLocationsTable.userId, userId));
      if (permittedIds.length) await tx.insert(userLocationsTable).values(permittedIds.map(locationId => ({ userId, locationId })));
      return updated;
      });
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.json({ user: { ...user, permittedLocationIds: permittedIds } });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
