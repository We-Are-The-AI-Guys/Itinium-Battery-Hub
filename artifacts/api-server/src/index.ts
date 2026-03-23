import app from "./app";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable } from "@workspace/db/schema";
import { count, sql } from "drizzle-orm";
import bcrypt from "bcrypt";

async function bootstrap() {
  try {
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS pallet_number_seq START WITH 1 INCREMENT BY 1`);
  } catch (err) {
    console.error("Bootstrap: failed to create pallet_number_seq:", err);
  }

  try {
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_job_batteries_pallet_number ON job_batteries (pallet_number) WHERE pallet_number IS NOT NULL`);
  } catch (err) {
    console.error("Bootstrap: failed to create pallet_number unique index:", err);
  }

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
  } catch (err) {
    console.error("Bootstrap: failed to init default admin user:", err);
  }

  try {
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
    console.error("Bootstrap: failed to init system settings:", err);
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
