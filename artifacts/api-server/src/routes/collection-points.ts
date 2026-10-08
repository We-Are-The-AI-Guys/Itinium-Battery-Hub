import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { collectionPointsTable, locationsTable } from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/collection-points",
  requireAuth,
  async (_req: AuthenticatedRequest, res) => {
    try {
      if (["depot_user", "team_leader"].includes(_req.user!.role)) {
        const points = await db.select({ id: locationsTable.id, name: locationsTable.name, address: locationsTable.address }).from(locationsTable)
          .where(and(eq(locationsTable.clientId, _req.user!.clientId ?? -1),
            _req.user!.permittedLocationIds?.length ? inArray(locationsTable.id, _req.user!.permittedLocationIds) : sql`false`));
        res.json({ collectionPoints: points }); return;
      }
      const points = await db
        .select()
        .from(collectionPointsTable)
        .orderBy(collectionPointsTable.name);
      res.json({ collectionPoints: points });
    } catch (error) {
      console.error("Collection points list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/collection-points",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { name, address } = req.body;
      if (!name || typeof name !== "string" || !address || typeof address !== "string") {
        res.status(400).json({ message: "Name and address are required and must be strings" });
        return;
      }
      if (name.trim().length === 0 || name.trim().length > 255) {
        res.status(400).json({ message: "Name must be between 1 and 255 characters" });
        return;
      }
      if (address.trim().length === 0 || address.trim().length > 500) {
        res.status(400).json({ message: "Address must be between 1 and 500 characters" });
        return;
      }

      const [point] = await db
        .insert(collectionPointsTable)
        .values({ name: name.trim(), address: address.trim() })
        .returning();

      res.status(201).json({ collectionPoint: point });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as Record<string, unknown>).code === "23505") {
        res.status(409).json({ message: "A collection point with this name already exists" });
        return;
      }
      console.error("Collection point create error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/collection-points/:id",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const { name, address } = req.body;
      const updateFields: Record<string, unknown> = {};
      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 255) {
          res.status(400).json({ message: "Name must be a string between 1 and 255 characters" });
          return;
        }
        updateFields.name = name.trim();
      }
      if (address !== undefined) {
        if (typeof address !== "string" || address.trim().length === 0 || address.trim().length > 500) {
          res.status(400).json({ message: "Address must be a string between 1 and 500 characters" });
          return;
        }
        updateFields.address = address.trim();
      }

      if (Object.keys(updateFields).length === 0) {
        res.status(400).json({ message: "At least one field (name or address) is required" });
        return;
      }

      const [updated] = await db
        .update(collectionPointsTable)
        .set(updateFields)
        .where(eq(collectionPointsTable.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Collection point not found" });
        return;
      }

      res.json({ collectionPoint: updated });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as Record<string, unknown>).code === "23505") {
        res.status(409).json({ message: "A collection point with this name already exists" });
        return;
      }
      console.error("Collection point update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/collection-points/:id",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const [deleted] = await db
        .delete(collectionPointsTable)
        .where(eq(collectionPointsTable.id, id))
        .returning();

      if (!deleted) {
        res.status(404).json({ message: "Collection point not found" });
        return;
      }

      res.json({ message: "Collection point deleted" });
    } catch (error) {
      console.error("Collection point delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
