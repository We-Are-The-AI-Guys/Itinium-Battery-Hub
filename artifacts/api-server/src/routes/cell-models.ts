import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cellModelsTable } from "@workspace/db/schema";
import { eq, ilike, or, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/cell-models",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { search, family, manufacturer } = req.query;
      let query = db.select().from(cellModelsTable).$dynamic();

      const conditions = [];
      if (manufacturer && typeof manufacturer === "string") {
        conditions.push(eq(cellModelsTable.manufacturer, manufacturer));
      }
      if (family && typeof family === "string") {
        conditions.push(eq(cellModelsTable.cellFamily, family));
      }
      if (search && typeof search === "string") {
        conditions.push(
          or(
            ilike(cellModelsTable.modelName, `%${search}%`),
            ilike(cellModelsTable.cellFamily, `%${search}%`)
          )!
        );
      }

      if (conditions.length > 0) {
        const { and } = await import("drizzle-orm");
        query = query.where(and(...conditions));
      }

      const models = await query.orderBy(
        cellModelsTable.cellFamily,
        cellModelsTable.cellHeightMm,
        cellModelsTable.cellsCount
      );

      res.json({ models });
    } catch (error) {
      console.error("Cell models list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/cell-models/lookup",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { modelName } = req.query;
      if (!modelName || typeof modelName !== "string") {
        res.status(400).json({ message: "modelName is required" });
        return;
      }

      const [model] = await db
        .select()
        .from(cellModelsTable)
        .where(eq(cellModelsTable.modelName, modelName));

      res.json({ model: model || null });
    } catch (error) {
      console.error("Cell model lookup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/cell-models",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { modelName, cellFamily, cellHeightMm, cellsCount, weightPerCellKg, manufacturer } = req.body;
      if (!modelName || !cellFamily || !cellHeightMm || !cellsCount || weightPerCellKg === undefined) {
        res.status(400).json({ message: "All fields are required" });
        return;
      }
      const trimmedName = String(modelName).trim();
      const trimmedFamily = String(cellFamily).trim();
      if (!trimmedName || !trimmedFamily) {
        res.status(400).json({ message: "modelName and cellFamily must not be empty" });
        return;
      }
      const height = parseInt(String(cellHeightMm), 10);
      const cells = parseInt(String(cellsCount), 10);
      if (isNaN(height) || !isFinite(height) || height <= 0) {
        res.status(400).json({ message: "cellHeightMm must be a positive integer" });
        return;
      }
      if (isNaN(cells) || !isFinite(cells) || cells <= 0) {
        res.status(400).json({ message: "cellsCount must be a positive integer" });
        return;
      }
      const weight = parseFloat(String(weightPerCellKg));
      if (isNaN(weight) || !isFinite(weight) || weight < 0) {
        res.status(400).json({ message: "weightPerCellKg must be a non-negative number" });
        return;
      }

      const [model] = await db
        .insert(cellModelsTable)
        .values({
          manufacturer: manufacturer ? String(manufacturer).trim() : "Unknown",
          modelName: trimmedName,
          cellFamily: trimmedFamily,
          cellHeightMm: height,
          cellsCount: cells,
          weightPerCellKg: weight.toFixed(3),
        })
        .returning();

      res.status(201).json({ model });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as Record<string, unknown>).code === "23505") {
        res.status(409).json({ message: "A cell model with this name already exists" });
        return;
      }
      console.error("Cell model create error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/cell-models/:id",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const { modelName, cellFamily, cellHeightMm, cellsCount, weightPerCellKg } = req.body;
      const updateFields: Record<string, unknown> = {};

      if (modelName !== undefined) {
        const trimmed = String(modelName).trim();
        if (!trimmed) { res.status(400).json({ message: "modelName must not be empty" }); return; }
        updateFields.modelName = trimmed;
      }
      if (cellFamily !== undefined) {
        const trimmed = String(cellFamily).trim();
        if (!trimmed) { res.status(400).json({ message: "cellFamily must not be empty" }); return; }
        updateFields.cellFamily = trimmed;
      }
      if (cellHeightMm !== undefined) {
        const h = parseInt(String(cellHeightMm), 10);
        if (isNaN(h) || h <= 0) { res.status(400).json({ message: "cellHeightMm must be a positive integer" }); return; }
        updateFields.cellHeightMm = h;
      }
      if (cellsCount !== undefined) {
        const c = parseInt(String(cellsCount), 10);
        if (isNaN(c) || c <= 0) { res.status(400).json({ message: "cellsCount must be a positive integer" }); return; }
        updateFields.cellsCount = c;
      }
      if (weightPerCellKg !== undefined) {
        const weight = parseFloat(String(weightPerCellKg));
        if (isNaN(weight) || !isFinite(weight) || weight < 0) {
          res.status(400).json({ message: "weightPerCellKg must be a non-negative number" });
          return;
        }
        updateFields.weightPerCellKg = weight.toFixed(3);
      }

      if (Object.keys(updateFields).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }

      const [updated] = await db
        .update(cellModelsTable)
        .set(updateFields)
        .where(eq(cellModelsTable.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Cell model not found" });
        return;
      }

      res.json({ model: updated });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as Record<string, unknown>).code === "23505") {
        res.status(409).json({ message: "A cell model with this name already exists" });
        return;
      }
      console.error("Cell model update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/cell-models/:id",
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
        .delete(cellModelsTable)
        .where(eq(cellModelsTable.id, id))
        .returning();

      if (!deleted) {
        res.status(404).json({ message: "Cell model not found" });
        return;
      }

      res.json({ message: "Cell model deleted" });
    } catch (error) {
      console.error("Cell model delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
