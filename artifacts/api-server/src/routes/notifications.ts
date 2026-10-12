import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationsTable, jobsTable } from "@workspace/db/schema";
import { eq, and, desc, asc, inArray, or, isNull } from "drizzle-orm";
import { isClientUser, jobScope } from "../lib/depot-access";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/notifications",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const rows = await db
        .select()
        .from(notificationsTable)
        .where(and(eq(notificationsTable.userId, userId),
          isClientUser(req.user!) ? or(and(isNull(notificationsTable.jobId), eq(notificationsTable.type, "support_resolved")), inArray(notificationsTable.jobId, db.select({ id: jobsTable.id }).from(jobsTable).where(jobScope(req.user!)))) : undefined))
        .orderBy(asc(notificationsTable.isRead), desc(notificationsTable.createdAt))
        .limit(50);
      res.json({ notifications: rows });
    } catch (err) {
      console.error("[notifications] GET /notifications error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/notifications/read-all",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      await db
        .update(notificationsTable)
        .set({ isRead: true })
        .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[notifications] PATCH /notifications/read-all error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/notifications/:id/read",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid notification ID" });
        return;
      }
      const userId = req.user!.id;
      await db
        .update(notificationsTable)
        .set({ isRead: true })
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[notifications] PATCH /notifications/:id/read error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
