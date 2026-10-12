import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function migrateAccessWorkflows() {
  await db.transaction(async tx => {
    await tx.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS roles jsonb`);
    // Preserve existing identities: never promote internal Accounts to Admin or
    // infer a customer client from names/history. Unassigned Accounts fail closed.
    await tx.execute(sql`UPDATE users SET roles = jsonb_build_array(role) WHERE roles IS NULL`);
    await tx.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS weight_verification_required boolean NOT NULL DEFAULT false`);
    await tx.execute(sql`UPDATE jobs SET weight_verification_required = true
      WHERE status IN ('request','confirmed') AND EXISTS (
        SELECT 1 FROM job_batteries b WHERE b.job_id = jobs.id
        AND (b.estimated_weight_kg IS NULL OR b.estimated_weight_kg <= 0
          OR b.cell_model_flag_reason = 'Missing battery details — 500kg token weight applied')
      )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS action_requests (
      id serial PRIMARY KEY, job_id integer NOT NULL REFERENCES jobs(id),
      requester_id integer NOT NULL REFERENCES users(id), kind text NOT NULL,
      notes text NOT NULL, outcome text, status text NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending','Approved','Rejected')),
      decision_notes text, decided_by_id integer REFERENCES users(id), decided_at timestamp,
      notification_status text NOT NULL DEFAULT 'Pending configuration', created_at timestamp NOT NULL DEFAULT now()
    )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS support_enquiries (
      id serial PRIMARY KEY, requester_id integer NOT NULL REFERENCES users(id),
      title text NOT NULL, details text NOT NULL, status text NOT NULL DEFAULT 'New'
        CHECK (status IN ('New','In Progress','Resolved')),
      notification_status text NOT NULL DEFAULT 'Pending configuration',
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS access_settings (
      id integer PRIMARY KEY DEFAULT 1 CHECK(id=1), operations_email text, support_email text, sender_email text
    )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS access_audit (
      id serial PRIMARY KEY, actor_id integer REFERENCES users(id), action text NOT NULL,
      job_id integer REFERENCES jobs(id), details jsonb, created_at timestamp NOT NULL DEFAULT now()
    )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS exception_evidence (
      id serial PRIMARY KEY, request_id integer NOT NULL REFERENCES action_requests(id),
      object_path text NOT NULL, file_name text NOT NULL, content_type text NOT NULL,
      size_bytes integer NOT NULL, created_at timestamp NOT NULL DEFAULT now()
    )`);
  });
}
