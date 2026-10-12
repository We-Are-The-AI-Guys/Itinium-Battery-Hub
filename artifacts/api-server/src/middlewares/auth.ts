import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, userLocationsTable, locationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { jobsTable, jobBatteriesTable, accessAuditTable } from "@workspace/db/schema";
import { isClientUser, mayAccessDepot } from "../lib/depot-access";
import { rolesOf, hasRole, isAdmin, clientWide, policyAllows, customerJob, customerBattery } from "../lib/access-policy";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    fullName: string;
    role: string;
    roles?: string[];
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

          const memberships = user.clientId && clientWide(user) ? await db.select({ id: locationsTable.id }).from(locationsTable).where(eq(locationsTable.clientId, user.clientId)) : user.clientId ? await db.select({ id: locationsTable.id })
            .from(userLocationsTable).innerJoin(locationsTable, eq(locationsTable.id, userLocationsTable.locationId))
            .where(and(eq(userLocationsTable.userId, user.id), eq(locationsTable.clientId, user.clientId))) : [];
          req.user = {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            roles: rolesOf(user),
            depot: user.depot,
            clientId: user.clientId,
            locationId: user.locationId,
            permittedLocationIds: memberships.map(row => row.id),
            collectionCompanyId: user.collectionCompanyId,
          };
          if (!policyAllows(req.user, req.method, String(req.route?.path || req.path))) {
            res.status(403).json({ message: "Insufficient permissions" }); return;
          }
          if (isClientUser(req.user) && ["/jobs", "/jobs/:id", "/jobs/schedule"].includes(String(req.route?.path))) {
            const originalJson = res.json.bind(res);
            res.json = ((body: any) => originalJson(body && typeof body === "object" ? {
              ...body,
              ...(body.job ? { job: customerJob(body.job) } : {}),
              ...(body.jobs ? { jobs: body.jobs.map(customerJob) } : {}),
              ...(body.batteries ? { batteries: body.batteries.map(customerBattery) } : {}),
            } : body)) as typeof res.json;
          }

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
          const routePath = String(req.route?.path || "");
          if (isAdmin(req.user) && req.method !== "GET" && req.params.id &&
            (routePath.startsWith("/jobs/") || routePath.includes("confirm-schedule"))) {
            const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, Number(req.params.id)));
            const confirming = ["confirmed", "received", "awaiting_invoice", "invoice", "completed"].includes(req.body?.status) || routePath.includes("confirm-schedule") || routePath.endsWith("/schedule/confirm");
            if (confirming && job && (job.weightVerificationRequired || Number(job.tonnage) > 26)) {
              res.status(409).json({ message: "Itinium must verify provisional weight and reduce any load above 26 tonnes before confirmation" }); return;
            }
            if (job && req.body?.status && job.status !== req.body.status) {
              await db.insert(accessAuditTable).values({ actorId: user.id, jobId: job.id, action: "job.status.requested",
                details: { before: job.status, requested: req.body.status, documentRelease: req.body.status === "completed" } });
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

    const path = String(req.route?.path || req.path);
    if (!policyAllows(req.user, req.method, path)) {
      res.status(403).json({ message: "Insufficient permissions" }); return;
    }
    const customerRead = req.method === "GET" && isClientUser(req.user) && (
      ["/jobs", "/jobs/:id", "/jobs/schedule", "/dashboard/stats", "/customer/documents", "/clients/:clientId/locations"].includes(path)
      || path.startsWith("/jobs/:id/documents")
    );
    if (!customerRead && !hasRole(req.user, ...roles) && !(isAdmin(req.user) && path.includes("/documents"))) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    next();
  };
}
