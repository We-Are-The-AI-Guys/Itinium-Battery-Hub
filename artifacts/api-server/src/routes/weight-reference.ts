import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { batteryWeightReferenceTable, cellModelsTable } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { selectCatalogueModel } from "./jobs";

const router: IRouter = Router();

router.get(
  "/weight-reference",
  requireAuth,
  requireRole("team_leader", "accounts", "head_office_admin"),
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
      const { cellType, voltage, cellModel, manufacturer } = req.query;

      if (cellModel && typeof cellModel === "string" && voltage) {
        const voltageNum = parseInt(String(voltage).replace(/[^0-9]/g, ""), 10);
        if (isNaN(voltageNum) || voltageNum <= 0 || voltageNum % 2 !== 0) {
          res.status(400).json({ message: "voltage must be a valid even positive number (e.g. 12V, 24V, 48V)" });
          return;
        }

        // Same matching rules as the depot form and job submission: candidates
        // are matched on the model name ignoring case/spacing/punctuation, then
        // picked by exact manufacturer first, falling back to TAB, then any
        // manufacturer. Keeping this endpoint aligned with the form prevents
        // CSV validators or other callers from silently disagreeing with it.
        const candidates = await db
          .select()
          .from(cellModelsTable);

        const mfr = typeof manufacturer === "string" ? manufacturer.trim() : "";
        const model = selectCatalogueModel(candidates, mfr, cellModel as string);

        if (model) {
          const numCells = voltageNum / 2;
          const totalWeight = parseFloat(model.weightPerCellKg) * numCells;
          res.json({
            reference: {
              id: model.id,
              cellType: model.modelName,
              voltage: voltage as string,
              weightKg: totalWeight.toFixed(3),
            },
            cellModel: model,
          });
          return;
        }
      }

      const lookupType = cellType || cellModel;
      if (!lookupType) {
        res.status(400).json({ message: "cellType or cellModel is required" });
        return;
      }

      const conditions = [eq(batteryWeightReferenceTable.cellType, lookupType as string)];
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
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as Record<string, unknown>).code === "23505") {
        res.status(409).json({ message: "A weight reference for this cell type and voltage already exists" });
        return;
      }
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
