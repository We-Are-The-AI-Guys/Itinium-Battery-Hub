import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, clientsTable, locationsTable } from "@workspace/db/schema";
import { eq, lt } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";

const router: IRouter = Router();

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res) => {
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

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        depot: user.depot,
        clientId: user.clientId,
        locationId: user.locationId,
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
        depot: user.depot,
        clientId: user.clientId,
        locationId: user.locationId,
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

setInterval(async () => {
  try {
    await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
  } catch {}
}, 60 * 60 * 1000);

export default router;
