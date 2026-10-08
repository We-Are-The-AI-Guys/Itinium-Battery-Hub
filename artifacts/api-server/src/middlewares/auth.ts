import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, userLocationsTable, locationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { jobsTable, jobBatteriesTable } from "@workspace/db/schema";
import { isClientUser, mayAccessDepot } from "../lib/depot-access";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    fullName: string;
    role: string;
    depot: string | null;
    clientId: number | null;
    locationId: number | null;
    permittedLocationIds?: number[];
    collectionCompanyId: number | null;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  db.select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, token))
    .then(([session]) => {
      if (!session || session.expiresAt < new Date()) {
        res.status(401).json({ message: "Session expired" });
        return;
      }

      return db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, session.userId))
        .then(async ([user]) => {
          if (!user) {
            res.status(401).json({ message: "User not found" });
            return;
          }

          if (!user.isActive) {
            res.status(403).json({ message: "Account has been deactivated" });
            return;
          }

          const memberships = user.clientId ? await db.select({ id: locationsTable.id })
            .from(userLocationsTable).innerJoin(locationsTable, eq(locationsTable.id, userLocationsTable.locationId))
            .where(and(eq(userLocationsTable.userId, user.id), eq(locationsTable.clientId, user.clientId))) : [];
          req.user = {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            depot: user.depot,
            clientId: user.clientId,
            locationId: user.locationId,
            permittedLocationIds: memberships.map(row => row.id),
            collectionCompanyId: user.collectionCompanyId,
          };

          db.update(sessionsTable)
            .set({ lastUsedAt: new Date() })
            .where(eq(sessionsTable.token, token))
            .catch(() => {});

          if (isClientUser(req.user)) {
            if (String(req.route?.path).startsWith("/jobs/") && req.params.id !== undefined) {
              const id = Number(req.params.id);
              if (!/^[1-9]\d*$/.test(String(req.params.id)) || !Number.isSafeInteger(id)) { res.status(404).json({ message: "Job not found" }); return; }
              const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
              if (!job || !mayAccessDepot(req.user, job)) {
                res.status(404).json({ message: "Job not found" }); return;
              }
              if (req.params.batteryId !== undefined) {
                const batteryId = Number(req.params.batteryId);
                if (!/^[1-9]\d*$/.test(String(req.params.batteryId)) || !Number.isSafeInteger(batteryId)) { res.status(404).json({ message: "Battery not found" }); return; }
                const [row] = await db.select({ id: jobBatteriesTable.id }).from(jobBatteriesTable)
                  .where(and(eq(jobBatteriesTable.id, batteryId), eq(jobBatteriesTable.jobId, job.id)));
                if (!row) { res.status(404).json({ message: "Battery not found" }); return; }
              }
            }
          }
          next();
        });
    })
    .catch((error) => {
      console.error("Auth middleware error:", error);
      res.status(500).json({ message: "Internal server error" });
    });
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    next();
  };
}
