import { rolesOf } from "../lib/access-policy";
import { Router, type IRouter } from "express";
import { userLocationIds } from "../lib/user-memberships";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, clientsTable, locationsTable, passwordResetTokensTable } from "@workspace/db/schema";
import { eq, lt, and, isNull, gt } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { sendEmail, buildPasswordResetEmail } from "../lib/email";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    const rl = (req as typeof req & { rateLimit?: { resetTime?: Date } }).rateLimit;
    const resetTime = rl?.resetTime instanceof Date ? rl.resetTime.getTime() : Date.now() + options.windowMs;
    const remainingMs = Math.max(0, resetTime - Date.now());
    const retryAfterMins = Math.max(1, Math.ceil(remainingMs / 1000 / 60));
    res.status(429).json({
      message: `Too many failed login attempts — please try again in ${retryAfterMins} minute${retryAfterMins === 1 ? "" : "s"}.`,
      retryAfter: retryAfterMins,
    });
  },
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/login", loginRateLimiter, async (req, res) => {
  try {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ message: "Account has been deactivated. Contact your administrator." });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(sessionsTable).values({
      userId: user.id,
      token,
      expiresAt,
      userAgent: (req.headers["user-agent"] || "").substring(0, 500),
      ipAddress: (req.headers["x-forwarded-for"] as string || req.ip || "").split(",")[0].trim().substring(0, 45),
    });

    res.cookie("session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    let clientName: string | null = null;
    let locationName: string | null = null;
    if (user.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, user.clientId));
      if (client) clientName = client.name;
    }
    if (user.locationId) {
      const [location] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, user.locationId));
      if (location) locationName = location.name;
    }

    loginRateLimiter.resetKey(req.ip || "unknown");

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        roles: rolesOf(user),
        depot: user.depot,
        clientId: user.clientId,
        permittedLocationIds: await userLocationIds(user.id, user.clientId),
        locationId: user.locationId,
        collectionCompanyId: user.collectionCompanyId,
        clientName,
        locationName,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = req.cookies?.session_token;
    if (!token) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, token));

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ message: "Session expired" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, session.userId));

    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ message: "Account has been deactivated" });
      return;
    }

    let clientName: string | null = null;
    let locationName: string | null = null;
    if (user.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, user.clientId));
      if (client) clientName = client.name;
    }
    if (user.locationId) {
      const [location] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, user.locationId));
      if (location) locationName = location.name;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        roles: rolesOf(user),
        depot: user.depot,
        clientId: user.clientId,
        permittedLocationIds: await userLocationIds(user.id, user.clientId),
        locationId: user.locationId,
        collectionCompanyId: user.collectionCompanyId,
        clientName,
        locationName,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    const token = req.cookies?.session_token;
    if (token) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    }
    res.clearCookie("session_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    res.json({ message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post("/auth/forgot-password", async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A valid email address is required" });
      return;
    }
    const { email } = parsed.data;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase().trim()));

    if (user && user.isActive) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokensTable).values({
        userId: user.id,
        token,
        expiresAt,
      });

      const domain =
        process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.APP_URL || "http://localhost:3000";

      const resetUrl = `${domain}/reset-password?token=${token}`;
      const html = buildPasswordResetEmail(resetUrl, user.fullName);

      sendEmail(user.email, "Reset your Itinium password", html).catch((err) => {
        console.error("Failed to send password reset email:", err);
      });
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.json({ message: "If that email is registered, a reset link has been sent." });
  }
});

router.get("/auth/check-reset-token", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!token) {
      res.status(400).json({ message: "Token is required" });
      return;
    }
    const [resetToken] = await db
      .select({ id: passwordResetTokensTable.id, expiresAt: passwordResetTokensTable.expiresAt, usedAt: passwordResetTokensTable.usedAt })
      .from(passwordResetTokensTable)
      .where(and(eq(passwordResetTokensTable.token, token), isNull(passwordResetTokensTable.usedAt)));

    if (!resetToken || resetToken.expiresAt < new Date()) {
      res.status(410).json({ message: "This reset link has expired or has already been used." });
      return;
    }
    res.json({ valid: true });
  } catch (error) {
    console.error("Check reset token error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid request" });
      return;
    }
    const { token, newPassword } = parsed.data;

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const now = new Date();
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokensTable.token, token),
            isNull(passwordResetTokensTable.usedAt),
            gt(passwordResetTokensTable.expiresAt, now),
          )
        )
        .returning({ userId: passwordResetTokensTable.userId });

      if (!row) return null;

      await tx.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, row.userId));
      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, row.userId));

      return row;
    });

    if (!claimed) {
      res.status(410).json({ message: "This reset link has expired or has already been used." });
      return;
    }

    res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

setInterval(async () => {
  try {
    await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
    await db
      .delete(passwordResetTokensTable)
      .where(lt(passwordResetTokensTable.expiresAt, new Date()));
  } catch {}
}, 60 * 60 * 1000);

export default router;
