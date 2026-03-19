import app from "./app";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable } from "@workspace/db/schema";
import { count } from "drizzle-orm";
import bcrypt from "bcrypt";

async function bootstrap() {
  try {
    const [{ value: userCount }] = await db.select({ value: count() }).from(usersTable);
    if (userCount === 0) {
      console.log("No users found — creating default admin user...");
      const hash = await bcrypt.hash("password123", 10);
      await db.insert(usersTable).values({
        email: "admin@itinium.co.uk",
        passwordHash: hash,
        fullName: "Sarah Mitchell",
        role: "head_office_admin",
        depot: null,
      });
      console.log("Default admin user created: admin@itinium.co.uk");
    }

    const [{ value: settingsCount }] = await db.select({ value: count() }).from(systemSettingsTable);
    if (settingsCount === 0) {
      await db.insert(systemSettingsTable).values({
        companyName: "Itinium Ltd",
        invoicePrefix: "INV",
        dataRetentionDays: 365,
        autoFetchLme: false,
      });
      console.log("Default system settings created");
    }
  } catch (err) {
    console.error("Bootstrap error:", err);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

bootstrap().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
