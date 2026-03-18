import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql, and, ilike, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

router.get(
  "/users/stats",
  requireAuth,
  requireRole("head_office_admin"),
  async (_req, res) => {
    try {
      const [stats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          depotUsers: sql<number>`count(*) filter (where ${usersTable.role} = 'depot_user')::int`,
          teamLeaders: sql<number>`count(*) filter (where ${usersTable.role} = 'team_leader')::int`,
          adminStaff: sql<number>`count(*) filter (where ${usersTable.role} in ('accounts', 'head_office_admin'))::int`,
        })
        .from(usersTable);

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
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const offset = parseInt(req.query.offset as string) || 0;
      const role = req.query.role as string | undefined;
      const search = req.query.search as string | undefined;

      const conditions = [];

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
          depot: usersTable.depot,
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

      res.json({ users, total: count });
    } catch (error) {
      console.error("Users list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const createUserSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["depot_user", "team_leader", "accounts", "head_office_admin"]),
  depot: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
});

router.post(
  "/users",
  requireAuth,
  requireRole("head_office_admin"),
  async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid user data", errors: parsed.error.issues });
        return;
      }

      const { fullName, email, role, depot, password } = parsed.data;

      if ((role === "depot_user" || role === "team_leader") && !depot) {
        res.status(400).json({ message: "Depot is required for Depot User and Team Leader roles" });
        return;
      }

      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email.toLowerCase().trim()));

      if (existing) {
        res.status(409).json({ message: "A user with this email already exists" });
        return;
      }

      const tempPassword = password || crypto.randomBytes(12).toString("base64url");
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const [user] = await db
        .insert(usersTable)
        .values({
          fullName,
          email: email.toLowerCase().trim(),
          role,
          depot: depot || null,
          passwordHash,
          isActive: true,
        })
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
          role: usersTable.role,
          depot: usersTable.depot,
          isActive: usersTable.isActive,
          createdAt: usersTable.createdAt,
        });

      res.status(201).json({ user });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(["depot_user", "team_leader", "accounts", "head_office_admin"]).optional(),
  depot: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/users/:id",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        res.status(400).json({ message: "Invalid user ID" });
        return;
      }

      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid update data", errors: parsed.error.issues });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
      if (parsed.data.role !== undefined) updates.role = parsed.data.role;
      if (parsed.data.depot !== undefined) updates.depot = parsed.data.depot;
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const [user] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, userId))
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
          role: usersTable.role,
          depot: usersTable.depot,
          isActive: usersTable.isActive,
          createdAt: usersTable.createdAt,
        });

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.json({ user });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
