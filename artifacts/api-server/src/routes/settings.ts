import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, systemSettingsTable } from "@workspace/db/schema";
import { eq, and, ne, gt } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";
import bcrypt from "bcrypt";

const router: IRouter = Router();

const profileSchema = z.object({
  fullName: z.string().min(1).max(255),
  depot: z.string().max(255).nullable().optional(),
});

router.patch(
  "/settings/profile",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid profile data" });
        return;
      }

      const [updated] = await db
        .update(usersTable)
        .set({
          fullName: parsed.data.fullName,
          depot: parsed.data.depot ?? null,
        })
        .where(eq(usersTable.id, req.user!.id))
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
          role: usersTable.role,
          depot: usersTable.depot,
        });

      res.json({ user: updated });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

router.post(
  "/settings/password",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = passwordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Current password and new password (min 6 chars) are required" });
        return;
      }

      const [user] = await db
        .select({ passwordHash: usersTable.passwordHash })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id));

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!valid) {
        res.status(400).json({ message: "Current password is incorrect" });
        return;
      }

      const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
      await db.transaction(async (tx) => {
        await tx
          .update(usersTable)
          .set({ passwordHash: newHash })
          .where(eq(usersTable.id, req.user!.id));
        // Keep this browser signed in; end other sessions after a password change.
        await tx.delete(sessionsTable).where(and(
          eq(sessionsTable.userId, req.user!.id),
          ne(sessionsTable.token, req.cookies.session_token),
        ));
      });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/settings/notifications",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await db
        .select({ notificationPreferences: usersTable.notificationPreferences })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id));

      const defaults = {
        newJobSubmitted: true,
        jobApprovedCompleted: true,
        invoiceGenerated: true,
        lmePriceAlerts: false,
        weeklySummary: true,
      };

      res.json({ preferences: { ...defaults, ...(user?.notificationPreferences as object || {}) } });
    } catch (error) {
      console.error("Notification prefs read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const notificationPrefsSchema = z.object({
  newJobSubmitted: z.boolean().optional(),
  jobApprovedCompleted: z.boolean().optional(),
  invoiceGenerated: z.boolean().optional(),
  lmePriceAlerts: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
});

router.patch(
  "/settings/notifications",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = notificationPrefsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid notification preferences" });
        return;
      }

      const [user] = await db
        .select({ notificationPreferences: usersTable.notificationPreferences })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id));

      const current = (user?.notificationPreferences as object) || {};
      const merged = { ...current, ...parsed.data };

      await db
        .update(usersTable)
        .set({ notificationPreferences: merged })
        .where(eq(usersTable.id, req.user!.id));

      res.json({ preferences: merged });
    } catch (error) {
      console.error("Notification prefs update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown Browser";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  return "Unknown Browser";
}

function maskIp(ip: string | null): string {
  if (!ip) return "Unknown";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip.substring(0, Math.min(ip.length, 12)) + "...";
}

router.get(
  "/settings/sessions",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const currentToken = req.cookies?.session_token;
      const sessions = await db
        .select({
          id: sessionsTable.id,
          userAgent: sessionsTable.userAgent,
          ipAddress: sessionsTable.ipAddress,
          lastUsedAt: sessionsTable.lastUsedAt,
          createdAt: sessionsTable.createdAt,
          expiresAt: sessionsTable.expiresAt,
          token: sessionsTable.token,
        })
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.userId, req.user!.id),
            gt(sessionsTable.expiresAt, new Date())
          )
        )
        .orderBy(sessionsTable.lastUsedAt);

      const mapped = sessions.map((s) => ({
        id: s.id,
        browser: parseUserAgent(s.userAgent),
        ipAddress: maskIp(s.ipAddress),
        lastUsedAt: s.lastUsedAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: s.token === currentToken,
      }));

      res.json({ sessions: mapped });
    } catch (error) {
      console.error("Sessions list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/settings/sessions/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = parseInt(req.params.id as string);
      if (isNaN(sessionId)) {
        res.status(400).json({ message: "Invalid session ID" });
        return;
      }

      const currentToken = req.cookies?.session_token;
      const [session] = await db
        .select({ token: sessionsTable.token })
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.id, sessionId),
            eq(sessionsTable.userId, req.user!.id)
          )
        );

      if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      if (session.token === currentToken) {
        res.status(400).json({ message: "Cannot revoke your current session" });
        return;
      }

      await db
        .delete(sessionsTable)
        .where(eq(sessionsTable.id, sessionId));

      res.json({ message: "Session revoked" });
    } catch (error) {
      console.error("Session revoke error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/settings/sessions",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const currentToken = req.cookies?.session_token;

      await db
        .delete(sessionsTable)
        .where(
          and(
            eq(sessionsTable.userId, req.user!.id),
            ne(sessionsTable.token, currentToken)
          )
        );

      res.json({ message: "All other sessions revoked" });
    } catch (error) {
      console.error("Revoke all sessions error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/settings/system",
  requireAuth,
  requireRole("head_office_admin"),
  async (_req, res) => {
    try {
      const [settings] = await db
        .select()
        .from(systemSettingsTable)
        .limit(1);

      res.json({ settings: settings || null });
    } catch (error) {
      console.error("System settings read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const systemSettingsSchema = z.object({
  companyName: z.string().min(1).max(255).optional(),
  invoicePrefix: z.string().min(1).max(20).optional(),
  dataRetentionDays: z.number().int().min(30).max(3650).optional(),
  autoFetchLme: z.boolean().optional(),
});

router.patch(
  "/settings/system",
  requireAuth,
  requireRole("head_office_admin"),
  async (_req, res) => {
    try {
      const parsed = systemSettingsSchema.safeParse(_req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid system settings" });
        return;
      }

      const [existing] = await db.select().from(systemSettingsTable).limit(1);

      let settings;
      if (existing) {
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (parsed.data.companyName !== undefined) updates.companyName = parsed.data.companyName;
        if (parsed.data.invoicePrefix !== undefined) updates.invoicePrefix = parsed.data.invoicePrefix;
        if (parsed.data.dataRetentionDays !== undefined) updates.dataRetentionDays = parsed.data.dataRetentionDays;
        if (parsed.data.autoFetchLme !== undefined) updates.autoFetchLme = parsed.data.autoFetchLme;

        [settings] = await db
          .update(systemSettingsTable)
          .set(updates)
          .where(eq(systemSettingsTable.id, existing.id))
          .returning();
      } else {
        [settings] = await db
          .insert(systemSettingsTable)
          .values({
            ...parsed.data,
            companyName: parsed.data.companyName || "Itinium Ltd",
            invoicePrefix: parsed.data.invoicePrefix || "INV",
            dataRetentionDays: parsed.data.dataRetentionDays || 365,
            autoFetchLme: parsed.data.autoFetchLme ?? false,
          })
          .returning();
      }

      res.json({ settings });
    } catch (error) {
      console.error("System settings update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
