import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { batteryWeightReferenceTable } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/weight-reference",
  requireAuth,
  requireRole("head_office_admin"),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const refs = await db
        .select()
        .from(batteryWeightReferenceTable)
        .orderBy(batteryWeightReferenceTable.cellType, batteryWeightReferenceTable.voltage);
      res.json({ references: refs });
    } catch (error) {
      console.error("Weight reference list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/weight-reference/lookup",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { cellType, voltage } = req.query;
      if (!cellType) {
        res.status(400).json({ message: "cellType is required" });
        return;
      }

      const conditions = [eq(batteryWeightReferenceTable.cellType, cellType as string)];
      if (voltage) {
        conditions.push(eq(batteryWeightReferenceTable.voltage, voltage as string));
      } else {
        conditions.push(isNull(batteryWeightReferenceTable.voltage));
      }

      const [ref] = await db
        .select()
        .from(batteryWeightReferenceTable)
        .where(and(...conditions));

      res.json({ reference: ref || null });
    } catch (error) {
      console.error("Weight reference lookup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/weight-reference",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { cellType, voltage, weightKg } = req.body;
      if (!cellType || weightKg === undefined || weightKg === null) {
        res.status(400).json({ message: "cellType and weightKg are required" });
        return;
      }
      const parsedWeight = parseFloat(String(weightKg));
      if (isNaN(parsedWeight) || !isFinite(parsedWeight) || parsedWeight < 0) {
        res.status(400).json({ message: "weightKg must be a non-negative number" });
        return;
      }

      const [ref] = await db
        .insert(batteryWeightReferenceTable)
        .values({
          cellType,
          voltage: voltage || null,
          weightKg: String(parsedWeight),
        })
        .returning();

      res.status(201).json({ reference: ref });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as Record<string, unknown>).code === "23505") {
        res.status(409).json({ message: "A weight reference for this cell type and voltage already exists" });
        return;
      }
      console.error("Weight reference create error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/weight-reference/:id",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const { weightKg, cellType, voltage } = req.body;
      if (weightKg === undefined || weightKg === null) {
        res.status(400).json({ message: "weightKg is required" });
        return;
      }
      const parsedWeight = parseFloat(String(weightKg));
      if (isNaN(parsedWeight) || !isFinite(parsedWeight) || parsedWeight < 0) {
        res.status(400).json({ message: "weightKg must be a non-negative number" });
        return;
      }

      const updateFields: Record<string, unknown> = { weightKg: String(parsedWeight) };
      if (cellType !== undefined) updateFields.cellType = cellType;
      if (voltage !== undefined) updateFields.voltage = voltage || null;

      const [updated] = await db
        .update(batteryWeightReferenceTable)
        .set(updateFields)
        .where(eq(batteryWeightReferenceTable.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Weight reference not found" });
        return;
      }

      res.json({ reference: updated });
    } catch (error) {
      console.error("Weight reference update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/weight-reference/:id",
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
        .delete(batteryWeightReferenceTable)
        .where(eq(batteryWeightReferenceTable.id, id))
        .returning();

      if (!deleted) {
        res.status(404).json({ message: "Weight reference not found" });
        return;
      }

      res.json({ message: "Weight reference deleted" });
    } catch (error) {
      console.error("Weight reference delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
