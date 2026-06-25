import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { correctionAuditLogTable } from "@workspace/db/schema";
import { and, gte, lte, eq, desc, count } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/admin/correction-audit",
  requireAuth,
  requireRole("head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { dateFrom, dateTo, fieldName, wasAccepted, limit = "200", offset = "0" } = req.query as Record<string, string>;

      const conditions = [];

      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) conditions.push(gte(correctionAuditLogTable.createdAt, from));
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          conditions.push(lte(correctionAuditLogTable.createdAt, to));
        }
      }
      if (fieldName && fieldName !== "all") {
        conditions.push(eq(correctionAuditLogTable.fieldName, fieldName));
      }
      if (wasAccepted === "true") {
        conditions.push(eq(correctionAuditLogTable.wasAccepted, true));
      } else if (wasAccepted === "false") {
        conditions.push(eq(correctionAuditLogTable.wasAccepted, false));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
      const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

      const [rows, totalResult] = await Promise.all([
        db
          .select()
          .from(correctionAuditLogTable)
          .where(where)
          .orderBy(desc(correctionAuditLogTable.createdAt))
          .limit(parsedLimit)
          .offset(parsedOffset),
        db
          .select({ total: count() })
          .from(correctionAuditLogTable)
          .where(where),
      ]);

      res.json({ rows, total: Number(totalResult[0]?.total ?? 0) });
    } catch (err) {
      console.error("Correction audit fetch error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
