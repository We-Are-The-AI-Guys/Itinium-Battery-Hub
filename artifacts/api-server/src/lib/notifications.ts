import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db/schema";
import { eq, inArray, and, lt } from "drizzle-orm";
import { Resend } from "resend";
import { buildBrandedEmail } from "./email";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = "notifications@itinium.co.uk";

const STATUS_LABELS: Record<string, string> = {
  request: "Request Submitted",
  confirmed: "Confirmed",
  received: "Received",
  invoice: "Invoice Raised",
  awaiting_invoice: "Awaiting Invoice",
  completed: "Completed",
};

function wantsEmail(prefs: unknown, key: string): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  const p = prefs as Record<string, unknown>;
  return p[key] !== false;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding: 7px 12px 7px 0; color: #64748b; font-size: 13px; white-space: nowrap; vertical-align: top;">${label}</td>
    <td style="padding: 7px 0; color: #1e293b; font-size: 13px; font-weight: 600;">${value}</td>
  </tr>`;
}

function jobTable(job: JobRef): string {
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

function ctaButton(href: string, label = "View Job"): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#0ea5e9;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>`;
}

function portalLink(path: string): string {
  const base = process.env.PORTAL_URL || "https://itinium.replit.app";
  return `${base.replace(/\/$/, "")}${path}`;
}

export type JobRef = {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionDate?: string | null;
  tonnage?: string | null;
  submittedById?: number | null;
};

export type NotificationPayload = {
  type: string;
  title: string;
  body: string;
  link?: string;
  emailSubject?: string;
  emailHtml?: string;
  emailPrefKey?: string;
};

export async function dispatchNotification(
  userId: number,
  payload: NotificationPayload
): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
    });
  } catch (err) {
    console.error("[notifications] Failed to insert notification:", err);
  }

  if (!resend || !payload.emailSubject || !payload.emailHtml) return;

  try {
    const [user] = await db
      .select({ email: usersTable.email, notificationPreferences: usersTable.notificationPreferences })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) return;
    const prefKey = payload.emailPrefKey ?? "jobApprovedCompleted";
    if (!wantsEmail(user.notificationPreferences, prefKey)) return;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: user.email,
      subject: payload.emailSubject,
      html: payload.emailHtml,
    });
  } catch (err) {
    console.error("[notifications] Failed to send email:", err);
  }
}

export async function dispatchToMany(
  userIds: number[],
  payload: NotificationPayload
): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.allSettled(userIds.map((id) => dispatchNotification(id, payload)));
}

export async function recipientsWithRoles(roles: string[]): Promise<number[]> {
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(inArray(usersTable.role, roles), eq(usersTable.isActive, true)));
  return users.map((u) => u.id);
}

export type RecipientsForJob = {
  adminIds: number[];
  accountIds: number[];
  submitterAndTeamLeaderIds: number[];
};

export async function recipientsForJob(job: JobRef): Promise<RecipientsForJob> {
  const [adminIds, accountIds] = await Promise.all([
    recipientsWithRoles(["head_office_admin", "accounts"]),
    recipientsWithRoles(["accounts"]),
  ]);

  const submitterAndTeamLeaderIds = new Set<number>();
  if (job.submittedById) {
    submitterAndTeamLeaderIds.add(job.submittedById);
    const submitter = await db
      .select({ clientId: usersTable.clientId })
      .from(usersTable)
      .where(eq(usersTable.id, job.submittedById))
      .then((rows) => rows[0] ?? null);
    if (submitter?.clientId) {
      const teamLeaders = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.clientId, submitter.clientId),
            eq(usersTable.role, "team_leader"),
            eq(usersTable.isActive, true)
          )
        );
      for (const tl of teamLeaders) submitterAndTeamLeaderIds.add(tl.id);
    }
  }

  return {
    adminIds,
    accountIds,
    submitterAndTeamLeaderIds: [...submitterAndTeamLeaderIds],
  };
}

export async function notifyAdminsNewJob(job: JobRef): Promise<void> {
  const { adminIds } = await recipientsForJob(job);
  const link = portalLink(`/jobs/${job.id}`);
  const emailHtml = buildBrandedEmail(
    "New collection request submitted",
    `<p style="color:#475569;margin:0 0 4px;">A new battery collection request has been submitted and requires your attention.</p>
    ${jobTable(job)}
    ${ctaButton(link)}
    <p style="color:#475569;margin:16px 0 0;font-size:13px;">Please log in to the portal to review and confirm this request.</p>`,
    "You are receiving this because you are an admin or accounts user on the Itinium Battery Portal."
  );
  await dispatchToMany(adminIds, {
    type: "job_submitted",
    title: `New collection — ${job.reference}`,
    body: `${job.clientName} / ${job.depot} submitted a new collection request.`,
    link: `/jobs/${job.id}`,
    emailSubject: `New Collection Request — ${job.reference}`,
    emailHtml,
    emailPrefKey: "newJobSubmitted",
  });
}

export async function notifyAdminsFlaggedBatteries(job: JobRef, flagCount: number): Promise<void> {
  if (flagCount === 0) return;
  const { adminIds } = await recipientsForJob(job);
  const link = portalLink(`/jobs/${job.id}`);
  const emailHtml = buildBrandedEmail(
    `Flag alert — ${job.reference}`,
    `<p style="color:#475569;margin:0 0 4px;">Collection <strong>${job.reference}</strong> has <strong style="color:#d97706;">${flagCount} batter${flagCount === 1 ? "y" : "ies"} requiring review</strong> due to unresolved flags (unknown manufacturer, cell model, or serial number).</p>
    ${jobTable(job)}
    ${ctaButton(link)}
    <p style="color:#475569;margin:16px 0 0;font-size:13px;">Please log in to the portal to review and resolve the flagged items.</p>`,
    "You are receiving this because you are an admin or accounts user on the Itinium Battery Portal."
  );
  await dispatchToMany(adminIds, {
    type: "batteries_flagged",
    title: `Flags on ${job.reference}`,
    body: `${flagCount} batter${flagCount === 1 ? "y" : "ies"} require review on ${job.reference}.`,
    link: `/jobs/${job.id}`,
    emailSubject: `Flag Alert — ${job.reference} (${flagCount} item${flagCount === 1 ? "" : "s"})`,
    emailHtml,
    emailPrefKey: "newJobSubmitted",
  });
}

export async function notifySubmitterStatusChange(job: JobRef, newStatus: string): Promise<void> {
  if (!job.submittedById) return;

  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;

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

  const link = portalLink(`/jobs/${job.id}`);

  if (newStatus === "awaiting_invoice") {
    const accountsEmailHtml = buildBrandedEmail(
      `Awaiting invoice — ${job.reference}`,
      `<p style="color:#475569;margin:0 0 4px;">Collection <strong>${job.reference}</strong> is now <strong>awaiting invoice</strong> from the depot.</p>
      ${jobTable(job)}
      ${ctaButton(link)}`,
      "You are receiving this because you are an accounts user on the Itinium Battery Portal."
    );
    const { accountIds } = await recipientsForJob(job);
    await dispatchToMany(accountIds, {
      type: "status_changed",
      title: `${job.reference} — Awaiting Invoice`,
      body: `Collection ${job.reference} is awaiting invoice from the depot.`,
      link: `/jobs/${job.id}`,
      emailSubject: `Awaiting Invoice — ${job.reference}`,
      emailHtml: accountsEmailHtml,
      emailPrefKey: "invoiceGenerated",
    });
    return;
  }

  const emailHtml = buildBrandedEmail(
    `Collection update — ${job.reference}`,
    `<p style="color:#475569;margin:0 0 8px;">Hi there,</p>
    <p style="color:#475569;margin:0 0 4px;">${statusSentence(newStatus)}</p>
    ${jobTable(job)}
    ${ctaButton(link)}`,
    "You are receiving this because you submitted this collection request. To opt out of status notifications, contact your administrator."
  );

  const notif: NotificationPayload = {
    type: "status_changed",
    title: `${job.reference} — ${statusLabel}`,
    body: statusSentence(newStatus).replace(/<[^>]+>/g, ""),
    link: `/jobs/${job.id}`,
    emailSubject: `Collection ${statusLabel} — ${job.reference}`,
    emailHtml,
    emailPrefKey: "jobApprovedCompleted",
  };

  const promises: Promise<void>[] = [dispatchNotification(job.submittedById, notif)];

  if (newStatus === "invoice") {
    const { accountIds } = await recipientsForJob(job);
    const filteredIds = accountIds.filter((id) => id !== job.submittedById);
    if (filteredIds.length > 0) {
      promises.push(
        dispatchToMany(filteredIds, {
          ...notif,
          emailPrefKey: "invoiceGenerated",
        })
      );
    }
  }

  await Promise.allSettled(promises);
}

export async function notifyFlagResolved(job: JobRef, resolvedByName: string): Promise<void> {
  if (!job.submittedById) return;
  const link = portalLink(`/jobs/${job.id}`);
  const emailHtml = buildBrandedEmail(
    `Flag resolved — ${job.reference}`,
    `<p style="color:#475569;margin:0 0 4px;">A flagged battery on <strong>${job.reference}</strong> has been reviewed and resolved by <strong>${resolvedByName}</strong>.</p>
    ${jobTable(job)}
    ${ctaButton(link)}`,
    "You are receiving this because you submitted this collection request or manage the submitting team."
  );
  const notif: NotificationPayload = {
    type: "flag_resolved",
    title: `Flag resolved on ${job.reference}`,
    body: `A flagged battery was resolved by ${resolvedByName}.`,
    link: `/jobs/${job.id}`,
    emailSubject: `Flag Resolved — ${job.reference}`,
    emailHtml,
    emailPrefKey: "jobApprovedCompleted",
  };

  const { submitterAndTeamLeaderIds } = await recipientsForJob(job);
  await dispatchToMany(submitterAndTeamLeaderIds, notif);
}

export async function pruneOldNotifications(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await db.delete(notificationsTable).where(lt(notificationsTable.createdAt, cutoff));
    const deleted = (result as { rowCount?: number }).rowCount ?? 0;
    if (deleted > 0) console.log(`[notifications] Pruned ${deleted} notifications older than 90 days`);
  } catch (err) {
    console.error("[notifications] Failed to prune old notifications:", err);
  }
}
