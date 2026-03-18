import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    fullName: string;
    role: string;
    depot: string | null;
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
        .then(([user]) => {
          if (!user) {
            res.status(401).json({ message: "User not found" });
            return;
          }

          if (!user.isActive) {
            res.status(403).json({ message: "Account has been deactivated" });
            return;
          }

          req.user = {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            depot: user.depot,
          };
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
