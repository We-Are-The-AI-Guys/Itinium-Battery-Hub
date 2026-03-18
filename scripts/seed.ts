import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import bcrypt from "bcrypt";

async function seed() {
  const password = await bcrypt.hash("password123", 10);

  const users = [
    { email: "depot@itinium.co.uk", fullName: "Dave Mitchell", role: "depot_user", depot: "Birmingham Depot" },
    { email: "team@itinium.co.uk", fullName: "Sarah Cooper", role: "team_leader", depot: "Birmingham Depot" },
    { email: "accounts@itinium.co.uk", fullName: "Jane Williams", role: "accounts", depot: null },
    { email: "admin@itinium.co.uk", fullName: "Mark Johnson", role: "head_office_admin", depot: null },
  ];

  for (const u of users) {
    await db
      .insert(usersTable)
      .values({ ...u, passwordHash: password })
      .onConflictDoNothing();
  }

  console.log("Seeded 4 demo users (password: password123)");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });