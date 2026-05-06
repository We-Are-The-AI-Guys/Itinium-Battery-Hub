import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobDraftsTable, usersTable } from "@workspace/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/job-drafts",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const role = user.role;

      let drafts;

      if (role === "depot_user") {
        if (!user.clientId) {
          res.json({ drafts: [] });
          return;
        }
        drafts = await db
          .select()
          .from(jobDraftsTable)
          .where(
            and(
              eq(jobDraftsTable.depot, user.depot || ""),
              eq(jobDraftsTable.clientId, user.clientId)
            )
          )
          .orderBy(desc(jobDraftsTable.updatedAt));
      } else if (role === "team_leader") {
        if (!user.clientId) {
          res.json({ drafts: [] });
          return;
        }
        drafts = await db
          .select()
          .from(jobDraftsTable)
          .where(eq(jobDraftsTable.clientId, user.clientId))
          .orderBy(desc(jobDraftsTable.updatedAt));
      } else {
        drafts = await db
          .select()
          .from(jobDraftsTable)
          .orderBy(desc(jobDraftsTable.updatedAt));
      }

      const saverIds = [...new Set(drafts.map((d) => d.savedById))];
      const saverMap = new Map<number, string>();
      if (saverIds.length > 0) {
        const savers = await db
          .select({ id: usersTable.id, fullName: usersTable.fullName })
          .from(usersTable)
          .where(or(...saverIds.map((id) => eq(usersTable.id, id))));
        for (const s of savers) saverMap.set(s.id, s.fullName);
      }

      res.json({
        drafts: drafts.map((d) => ({
          ...d,
          savedByName: saverMap.get(d.savedById) || null,
        })),
      });
    } catch (error) {
      console.error("Draft list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/job-drafts",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const { draftId, formData, collectionPoint, batteryCount } = req.body;

      if (!formData) {
        res.status(400).json({ message: "formData is required" });
        return;
      }

      const formDataJson = typeof formData === "string" ? JSON.parse(formData) : formData;
      const cpValue = collectionPoint || null;
      const bcValue = typeof batteryCount === "number" ? batteryCount : parseInt(String(batteryCount || "0"), 10) || 0;

      if (draftId) {
        const draftIdNum = parseInt(String(draftId), 10);
        if (!isNaN(draftIdNum)) {
          const canSee = await canUserAccessDraft(user, draftIdNum);
          if (!canSee) {
            res.status(403).json({ message: "Not authorised to update this draft" });
            return;
          }
          const [updated] = await db
            .update(jobDraftsTable)
            .set({
              formData: formDataJson,
              collectionPoint: cpValue,
              batteryCount: bcValue,
              updatedAt: new Date(),
            })
            .where(eq(jobDraftsTable.id, draftIdNum))
            .returning();
          res.json({ draft: updated });
          return;
        }
      }

      const [created] = await db
        .insert(jobDraftsTable)
        .values({
          savedById: user.id,
          depot: user.depot || "",
          clientId: user.clientId || null,
          locationId: user.locationId || null,
          formData: formDataJson,
          collectionPoint: cpValue,
          batteryCount: bcValue,
        })
        .returning();
      res.status(201).json({ draft: created });
    } catch (error) {
      console.error("Draft save error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/job-drafts/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const draftId = parseInt(String(req.params.id), 10);
      if (isNaN(draftId)) {
        res.status(400).json({ message: "Invalid draft ID" });
        return;
      }

      const canSee = await canUserAccessDraft(user, draftId);
      if (!canSee) {
        res.status(403).json({ message: "Not authorised to delete this draft" });
        return;
      }

      const [deleted] = await db
        .delete(jobDraftsTable)
        .where(eq(jobDraftsTable.id, draftId))
        .returning();

      if (!deleted) {
        res.status(404).json({ message: "Draft not found" });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Draft delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

async function canUserAccessDraft(
  user: NonNullable<AuthenticatedRequest["user"]>,
  draftId: number
): Promise<boolean> {
  const [draft] = await db
    .select()
    .from(jobDraftsTable)
    .where(eq(jobDraftsTable.id, draftId));
  if (!draft) return false;

  const role = user.role;
  if (role === "head_office_admin" || role === "accounts") return true;
  if (role === "team_leader") return draft.clientId === user.clientId;
  if (role === "depot_user") {
    return draft.depot === user.depot && draft.clientId === user.clientId;
  }
  return false;
}

export default router;
