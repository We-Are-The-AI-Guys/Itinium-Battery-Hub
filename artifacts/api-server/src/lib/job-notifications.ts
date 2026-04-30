import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendEmail, buildBrandedEmail } from "./email";

type Job = {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionDate?: string | null;
  tonnage?: string | null;
  status?: string | null;
  submittedById?: number | null;
};

const STATUS_LABELS: Record<string, string> = {
  request: "Request Submitted",
  confirmed: "Confirmed",
  received: "Received",
  invoice: "Invoice Raised",
  awaiting_invoice: "Awaiting Invoice",
  completed: "Completed",
};

function statusSentence(status: string): string {
  switch (status) {
    case "confirmed": return "Your collection request has been <strong>confirmed</strong> and is being arranged.";
    case "received": return "Your batteries have been <strong>received</strong> at our facility.";
    case "invoice": return "An invoice has been <strong>raised</strong> for your collection.";
    case "awaiting_invoice": return "Your collection is <strong>awaiting invoice</strong> from the depot.";
    case "completed": return "Your collection has been <strong>completed</strong>. Thank you.";
    default: return `Your collection status has been updated to <strong>${STATUS_LABELS[status] ?? status}</strong>.`;
  }
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding: 7px 12px 7px 0; color: #64748b; font-size: 13px; white-space: nowrap; vertical-align: top;">${label}</td>
    <td style="padding: 7px 0; color: #1e293b; font-size: 13px; font-weight: 600;">${value}</td>
  </tr>`;
}

function jobTable(job: Job): string {
  const rows = [
    infoRow("Reference:", job.reference),
    infoRow("Client:", job.clientName),
    infoRow("Depot:", job.depot),
  ];
  if (job.collectionDate) rows.push(infoRow("Collection Date:", job.collectionDate));
  if (job.tonnage) rows.push(infoRow("Tonnage:", `${parseFloat(job.tonnage).toFixed(3)} t`));
  return `<table cellpadding="0" cellspacing="0" style="margin: 20px 0; border-left: 3px solid #0ea5e9; padding-left: 16px;">
    ${rows.join("\n")}
  </table>`;
}

function wantsEmail(prefs: unknown, key: string): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  const p = prefs as Record<string, unknown>;
  return p[key] !== false;
}

export async function notifyAdminsNewJob(job: Job): Promise<void> {
  try {
    const admins = await db
      .select({ email: usersTable.email, fullName: usersTable.fullName, notificationPreferences: usersTable.notificationPreferences })
      .from(usersTable)
      .where(inArray(usersTable.role, ["accounts", "head_office_admin"]));

    const eligible = admins.filter(u => wantsEmail(u.notificationPreferences, "newJobSubmitted"));
    if (eligible.length === 0) return;

    const html = buildBrandedEmail(
      "New collection request submitted",
      `<p style="color: #475569; margin: 0 0 4px;">A new battery collection request has been submitted and requires your attention.</p>
      ${jobTable(job)}
      <p style="color: #475569; margin: 16px 0 0; font-size: 13px;">Please log in to the portal to review and confirm this request.</p>`,
      "You are receiving this because you are an admin or accounts user on the Itinium Battery Portal."
    );

    await Promise.allSettled(
      eligible.map(u =>
        sendEmail(u.email, `New Collection Request — ${job.reference}`, html).catch(err =>
          console.error(`[notifications] Failed to email ${u.email}:`, err)
        )
      )
    );
  } catch (err) {
    console.error("[notifications] notifyAdminsNewJob error:", err);
  }
}

export async function notifyAdminsFlaggedBatteries(job: Job, flagCount: number): Promise<void> {
  if (flagCount === 0) return;
  try {
    const admins = await db
      .select({ email: usersTable.email, notificationPreferences: usersTable.notificationPreferences })
      .from(usersTable)
      .where(inArray(usersTable.role, ["accounts", "head_office_admin"]));

    const eligible = admins.filter(u => wantsEmail(u.notificationPreferences, "newJobSubmitted"));
    if (eligible.length === 0) return;

    const html = buildBrandedEmail(
      `Flag alert — ${job.reference}`,
      `<p style="color: #475569; margin: 0 0 4px;">Collection <strong>${job.reference}</strong> has <strong style="color: #d97706;">${flagCount} batter${flagCount === 1 ? "y" : "ies"} requiring review</strong> due to unresolved flags (unknown manufacturer, cell model, or serial number).</p>
      ${jobTable(job)}
      <p style="color: #475569; margin: 16px 0 0; font-size: 13px;">Please log in to the portal to review and resolve the flagged items.</p>`,
      "You are receiving this because you are an admin or accounts user on the Itinium Battery Portal."
    );

    await Promise.allSettled(
      eligible.map(u =>
        sendEmail(u.email, `Flag Alert — ${job.reference} (${flagCount} item${flagCount === 1 ? "" : "s"})`, html).catch(err =>
          console.error(`[notifications] Failed to email ${u.email}:`, err)
        )
      )
    );
  } catch (err) {
    console.error("[notifications] notifyAdminsFlaggedBatteries error:", err);
  }
}

export async function notifySubmitterStatusChange(job: Job, newStatus: string): Promise<void> {
  if (!job.submittedById) return;
  try {
    const [submitter] = await db
      .select({ email: usersTable.email, fullName: usersTable.fullName, notificationPreferences: usersTable.notificationPreferences })
      .from(usersTable)
      .where(eq(usersTable.id, job.submittedById));

    if (!submitter) return;
    if (!wantsEmail(submitter.notificationPreferences, "jobApprovedCompleted")) return;

    const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
    const html = buildBrandedEmail(
      `Collection update — ${job.reference}`,
      `<p style="color: #475569; margin: 0 0 8px;">Hi ${submitter.fullName},</p>
      <p style="color: #475569; margin: 0 0 4px;">${statusSentence(newStatus)}</p>
      ${jobTable(job)}`,
      "You are receiving this because you submitted this collection request. To opt out of status notifications, contact your administrator."
    );

    await sendEmail(
      submitter.email,
      `Collection ${statusLabel} — ${job.reference}`,
      html
    ).catch(err => console.error(`[notifications] Failed to email submitter ${submitter.email}:`, err));
  } catch (err) {
    console.error("[notifications] notifySubmitterStatusChange error:", err);
  }
}
