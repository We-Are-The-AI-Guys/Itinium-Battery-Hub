import { db } from "@workspace/db";
import { notificationsTable, usersTable, jobsTable, userLocationsTable } from "@workspace/db/schema";
import { userLocationIds } from "./user-memberships";
import { isClientUser, mayAccessDepot } from "./depot-access";
import { eq, inArray, and, lt } from "drizzle-orm";
import { Resend } from "resend";
import { buildBrandedEmail } from "./email";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = "notifications@portal.itinium.co.uk";

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

export function shouldSendNotificationEmail(
  role: string,
  prefs: unknown,
  key: string
): boolean {
  // Waste collector accounts are running parallel tests. Keep their in-app
  // notifications active, but suppress all notification emails until testing
  // is complete. Account-security emails use a separate delivery path.
  if (role === "collection_company") return false;
  return wantsEmail(prefs, key);
}

// Escape user-controlled values before interpolating them into email HTML.
// Job fields, fleet names/registrations, and site details are all free text
// that non-admin users can set, so nothing dynamic may be rendered raw.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// `allowHtml` is only for trusted, already-escaped template fragments.
function infoRow(label: string, value: string, allowHtml = false): string {
  return `<tr>
    <td style="padding: 7px 12px 7px 0; color: #64748b; font-size: 13px; white-space: nowrap; vertical-align: top;">${label}</td>
    <td style="padding: 7px 0; color: #1e293b; font-size: 13px; font-weight: 600;">${allowHtml ? value : escapeHtml(value)}</td>
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
  jobId?: number;
  type: string;
  title: string;
  body: string;
  link?: string;
  emailSubject?: string;
  emailHtml?: string;
  emailPrefKey?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

export async function dispatchNotification(
  userId: number,
  payload: NotificationPayload
): Promise<void> {
  const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!recipient?.isActive) return;
  // Resolve legacy callers' exact job reference; never guess a depot from text.
  const reference = `${payload.title} ${payload.body}`.match(/\bJOB-\d{4}-\d{5}\b/)?.[0];
  const linkedId = payload.jobId ?? Number(payload.link?.match(/^\/jobs\/(\d+)/)?.[1]);
  const [job] = linkedId || reference ? await db.select().from(jobsTable)
    .where(linkedId ? eq(jobsTable.id, linkedId) : eq(jobsTable.reference, reference!)) : [];
  if (isClientUser(recipient) && (!job || !mayAccessDepot({
    ...recipient, permittedLocationIds: await userLocationIds(recipient.id, recipient.clientId),
  }, job))) return;
  try {
    await db.insert(notificationsTable).values({
      userId,
      jobId: job?.id ?? null,
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
      .select({
        email: usersTable.email,
        role: usersTable.role,
        notificationPreferences: usersTable.notificationPreferences,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) return;
    const prefKey = payload.emailPrefKey ?? "jobApprovedCompleted";
    if (!shouldSendNotificationEmail(user.role, user.notificationPreferences, prefKey)) return;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: user.email,
      subject: payload.emailSubject,
      html: payload.emailHtml,
      attachments: payload.attachments,
    });
  } catch (err) {
    console.error("[notifications] Failed to send email:", err);
  }
}

type RequiredDocumentRecipient = {
  id: number;
  email: string;
  fullName: string;
};

export type DocumentDeliveryResult = {
  sent: string[];
  failed: Array<{ email: string; error: string }>;
};

async function deliverRequiredDocument(
  recipients: RequiredDocumentRecipient[],
  payload: NotificationPayload
): Promise<DocumentDeliveryResult> {
  const result: DocumentDeliveryResult = { sent: [], failed: [] };
  for (const recipient of recipients) {
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, recipient.id));
      if (!user?.isActive) throw new Error("Recipient account is inactive");
      const ref = `${payload.title} ${payload.body}`.match(/\bJOB-\d{4}-\d{5}\b/)?.[0];
      const id = payload.jobId ?? Number(payload.link?.match(/^\/jobs\/(\d+)/)?.[1]);
      const [job] = id || ref ? await db.select().from(jobsTable)
        .where(id ? eq(jobsTable.id, id) : eq(jobsTable.reference, ref!)) : [];
      if (isClientUser(user) && (!job || !mayAccessDepot({ ...user,
        permittedLocationIds: await userLocationIds(user.id, user.clientId),
      }, job))) throw new Error("Recipient no longer has access to this job");
      await db.insert(notificationsTable).values({
        userId: recipient.id,
        jobId: job?.id ?? null,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        link: payload.link ?? null,
      });
      if (!resend || !payload.emailSubject || !payload.emailHtml) {
        throw new Error("Email service is not configured");
      }
      const response = await resend.emails.send({
        from: FROM_ADDRESS,
        to: recipient.email,
        subject: payload.emailSubject,
        html: payload.emailHtml,
        attachments: payload.attachments,
      });
      if (response.error) throw new Error(response.error.message);
      result.sent.push(recipient.email);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed";
      console.error(`[notifications] Required document delivery to ${recipient.email} failed:`, error);
      result.failed.push({ email: recipient.email, error: message });
    }
  }
  return result;
}

export async function sendCompletedReceiptToClient(
  recipients: RequiredDocumentRecipient[],
  job: JobRef,
  pdf: Buffer
): Promise<DocumentDeliveryResult> {
  const emailHtml = buildBrandedEmail(
    `Completed collection receipt — ${escapeHtml(job.reference)}`,
    `<p style="color:#475569;margin:0 0 12px;">The receipt review for collection <strong>${escapeHtml(job.reference)}</strong> is complete.</p>
    <p style="color:#475569;margin:0;">The attached completed collection receipt shows which items were received and any notes recorded by Itinium.</p>`,
    "This client copy intentionally excludes weights and financial information."
  );
  return deliverRequiredDocument(recipients, {
    type: "completed_receipt_sent",
    title: `Completed receipt — ${job.reference}`,
    body: `The completed collection receipt for ${job.reference} is attached to your email.`,
    link: `/`,
    emailSubject: `Completed Collection Receipt — ${job.reference}`,
    emailHtml,
    attachments: [{
      filename: `completed-collection-receipt-${job.reference.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    }],
  });
}

export async function sendJobValueToAccounts(
  recipients: RequiredDocumentRecipient[],
  job: JobRef,
  totalValue: string,
  pdf: Buffer
): Promise<DocumentDeliveryResult> {
  const formattedValue = Number(totalValue).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const emailHtml = buildBrandedEmail(
    `Job complete — ${escapeHtml(job.reference)}`,
    `<p style="color:#475569;margin:0 0 12px;">Collection <strong>${escapeHtml(job.reference)}</strong> is complete.</p>
    ${infoRow("Total confirmed job value:", `£${formattedValue}`)}
    <p style="color:#475569;margin:16px 0 0;">Use this value when preparing the invoice to Itinium. A minimal accounts completion document is attached.</p>`,
    "This accounts message intentionally excludes item details, weights, Pb figures and receipt notes."
  );
  return deliverRequiredDocument(recipients, {
    type: "job_value_sent_to_accounts",
    title: `Job complete — ${job.reference}`,
    body: `${job.reference} is complete. Confirmed value: £${formattedValue}.`,
    link: `/jobs/${job.id}`,
    emailSubject: `Job Complete — ${job.reference} — £${formattedValue}`,
    emailHtml,
    attachments: [{
      filename: `accounts-job-complete-${job.reference.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    }],
  });
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
  }
  const [ownedJob] = await db.select({ clientId: jobsTable.clientId, locationId: jobsTable.locationId })
    .from(jobsTable).where(eq(jobsTable.id, job.id));
    if (ownedJob?.clientId && ownedJob.locationId) {
      const teamLeaders = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .innerJoin(userLocationsTable, eq(userLocationsTable.userId, usersTable.id))
        .where(
          and(
            eq(usersTable.clientId, ownedJob.clientId),
            eq(userLocationsTable.locationId, ownedJob.locationId),
            eq(usersTable.role, "team_leader"),
            eq(usersTable.isActive, true)
          )
        );
      for (const tl of teamLeaders) submitterAndTeamLeaderIds.add(tl.id);
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

async function collectionCompanyUserIds(companyId: number): Promise<number[]> {
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "collection_company"),
        eq(usersTable.collectionCompanyId, companyId),
        eq(usersTable.isActive, true)
      )
    );
  return users.map((u) => u.id);
}

// Collection released by Itinium — tell the assigned collection company so they can
// log in and assign a vehicle, driver, and collection date.
export async function notifyCollectionCompanyNewJob(job: JobRef, companyId: number): Promise<void> {
  const userIds = await collectionCompanyUserIds(companyId);
  if (userIds.length === 0) return;
  const link = portalLink(`/collections`);
  const emailHtml = buildBrandedEmail(
    "New collection to schedule",
    `<p style="color:#475569;margin:0 0 4px;">Itinium has reviewed and submitted a battery collection for scheduling. Please check the collection weight, pallet count and any provisional-item notes in the portal before selecting a vehicle and driver.</p>
    ${jobTable(job)}
    ${ctaButton(link, "Schedule Collection")}
    <p style="color:#475569;margin:16px 0 0;font-size:13px;">Please log in to the portal to assign a vehicle and driver and propose a collection date.</p>`,
    "You are receiving this because your company carries out collections for Itinium Partnership Ltd."
  );
  await dispatchToMany(userIds, {
    type: "collection_to_schedule",
    title: `New collection — ${job.reference}`,
    body: `${job.clientName} / ${job.depot} — assign a vehicle, driver, and date.`,
    link: `/collections`,
    emailSubject: `New Collection to Schedule — ${job.reference}`,
    emailHtml,
    emailPrefKey: "newJobSubmitted",
  });
}

// Exported for tests: builds the admin "schedule proposed" email body with
// all user-controlled values escaped.
export function buildScheduleProposedEmailHtml(
  job: Pick<JobRef, "id" | "reference">,
  details: { companyName: string; driverName: string; vehicleReg: string; proposedDate: string }
): string {
  const link = portalLink(`/jobs/${job.id}`);
  const dateLabel = new Date(`${details.proposedDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  return buildBrandedEmail(
    `Collection date proposed — ${escapeHtml(job.reference)}`,
    `<p style="color:#475569;margin:0 0 4px;"><strong>${escapeHtml(details.companyName)}</strong> has proposed a schedule for collection <strong>${escapeHtml(job.reference)}</strong>:</p>
    <table cellpadding="0" cellspacing="0" style="margin: 20px 0; border-left: 3px solid #0ea5e9; padding-left: 16px;">
      ${infoRow("Proposed Date:", dateLabel)}
      ${infoRow("Driver:", details.driverName)}
      ${infoRow("Vehicle:", details.vehicleReg)}
    </table>
    ${ctaButton(link, "Review & Confirm")}
    <p style="color:#475569;margin:16px 0 0;font-size:13px;">Please confirm the date (or adjust it) so the customer site contact can be notified.</p>`,
    "You are receiving this because you are an admin or accounts user on the Itinium Battery Portal."
  );
}

// Collection company proposed a schedule — ask Itinium to confirm the date.
export async function notifyAdminsScheduleProposed(
  job: JobRef,
  details: { companyName: string; driverName: string; vehicleReg: string; proposedDate: string }
): Promise<void> {
  const { adminIds } = await recipientsForJob(job);
  const dateLabel = new Date(`${details.proposedDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  const emailHtml = buildScheduleProposedEmailHtml(job, details);
  await dispatchToMany(adminIds, {
    type: "schedule_proposed",
    title: `Date proposed — ${job.reference}`,
    body: `${details.companyName} proposed ${dateLabel} (${details.driverName}, ${details.vehicleReg}). Please confirm.`,
    link: `/jobs/${job.id}`,
    emailSubject: `Collection Date Proposed — ${job.reference}`,
    emailHtml,
    emailPrefKey: "newJobSubmitted",
  });
}

// Exported for tests: builds the "collection confirmed" email body (Ingrid's
// template, 11 Aug 2026) with all user-controlled values escaped.
export function buildScheduleConfirmedEmailHtml(
  job: Pick<JobRef, "reference">,
  firstName: string,
  details: {
    collectionDate: string;
    driverName: string;
    vehicleReg: string;
    siteAddress: string;
    siteHours: string | null;
    siteContacts: string | null;
    specialInstructions: string | null;
  }
): string {
  const dateLabel = new Date(`${details.collectionDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  const addressHtml = details.siteAddress
    .split(/\s*[—\n]\s*/)
    .map((line) => escapeHtml(line))
    .join("<br/>");

  return buildBrandedEmail(
    `Collection confirmed — ${escapeHtml(job.reference)}`,
    `<p style="color:#475569;margin:0 0 12px;">Dear ${escapeHtml(firstName)},</p>
    <p style="color:#475569;margin:0 0 12px;">We can arrange collection on <strong>${dateLabel}</strong>; our driver <strong>${escapeHtml(details.driverName)}</strong> will be in vehicle <strong>${escapeHtml(details.vehicleReg)}</strong> and have all necessary paperwork with him.</p>
    <table cellpadding="0" cellspacing="0" style="margin: 20px 0; border-left: 3px solid #0ea5e9; padding-left: 16px;">
      ${infoRow("Collection address:", addressHtml, true)}
      ${infoRow("Site access hours:", details.siteHours || "—")}
      ${infoRow("Site contact:", details.siteContacts || "—")}
      ${infoRow("Special loading instructions:", details.specialInstructions || "None")}
    </table>
    <p style="color:#475569;margin:0 0 12px;">If you can kindly confirm that the above date is agreeable with yourself, and of course if any of the information above is incorrect please let one of the team know and we will adjust.</p>
    <p style="color:#475569;margin:0;">Finally, if we can assist in any other way please don't hesitate to contact one of the team.</p>`,
    "You are receiving this because you requested this collection on the Itinium Battery Portal. Please pass these details to the site contact if that isn't you."
  );
}

// Itinium confirmed the schedule — send the collection requester the
// collection specifics, following Ingrid's template (11 Aug 2026).
export async function notifySiteContactScheduleConfirmed(
  job: JobRef,
  details: {
    collectionDate: string;
    driverName: string;
    vehicleReg: string;
    siteAddress: string;
    siteHours: string | null;
    siteContacts: string | null;
    specialInstructions: string | null;
  }
): Promise<void> {
  if (!job.submittedById) return;

  const [contact] = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, job.submittedById));
  const firstName = contact?.fullName?.split(" ")[0] || "there";

  const dateLabel = new Date(`${details.collectionDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  const emailHtml = buildScheduleConfirmedEmailHtml(job, firstName, details);

  await dispatchNotification(job.submittedById, {
    type: "schedule_confirmed",
    title: `Collection confirmed — ${job.reference}`,
    body: `Collection on ${dateLabel}: ${details.driverName} in ${details.vehicleReg}.`,
    link: `/jobs/${job.id}`,
    emailSubject: `Collection Confirmed — ${dateLabel} — ${job.reference}`,
    emailHtml,
    emailPrefKey: "jobApprovedCompleted",
  });
}

// The collection company uploaded their statement — accounts raise the
// Itinium invoice from it, so tell them it has arrived.
export async function notifyAccountsStatementUploaded(job: JobRef, fileName: string): Promise<void> {
  const { accountIds } = await recipientsForJob(job);
  const link = portalLink(`/jobs/${job.id}`);
  const emailHtml = buildBrandedEmail(
    `Statement uploaded — ${escapeHtml(job.reference)}`,
    `<p style="color:#475569;margin:0 0 4px;">The collection company has uploaded their statement (<strong>${escapeHtml(fileName)}</strong>) for collection <strong>${escapeHtml(job.reference)}</strong>. You can now raise the invoice to them.</p>
    ${jobTable(job)}
    ${ctaButton(link, "View Documents")}`,
    "You are receiving this because you are an accounts user on the Itinium Battery Portal."
  );
  await dispatchToMany(accountIds, {
    type: "statement_uploaded",
    title: `Statement uploaded — ${job.reference}`,
    body: `The collection company uploaded their statement for ${job.reference}. Ready to invoice.`,
    link: `/jobs/${job.id}`,
    emailSubject: `Statement Uploaded — ${job.reference}`,
    emailHtml,
    emailPrefKey: "invoiceGenerated",
  });
}

export function buildDocumentsCompleteEmailHtml(job: JobRef): string {
  const link = portalLink(`/jobs/${job.id}`);
  return buildBrandedEmail(
    `Collection documents complete — ${escapeHtml(job.reference)}`,
    `<p style="color:#475569;margin:0 0 4px;">CBL has uploaded all required documents for collection <strong>${escapeHtml(job.reference)}</strong>.</p>
    ${jobTable(job)}
    ${ctaButton(link, "Review Documents")}
    <p style="color:#475569;margin:16px 0 0;font-size:13px;">The signed collection sheet, signed consignment note, and statement are now available in the portal.</p>`,
    "You are receiving this because you are an administrator on the Itinium Battery Portal."
  );
}

export async function notifyAdminsDocumentsComplete(job: JobRef): Promise<void> {
  const adminIds = await recipientsWithRoles(["head_office_admin"]);
  await dispatchToMany(adminIds, {
    type: "collection_documents_complete",
    title: `Documents complete — ${job.reference}`,
    body: `CBL uploaded all required documents for ${job.reference}.`,
    link: `/jobs/${job.id}`,
    emailSubject: `Collection Documents Complete — ${job.reference}`,
    emailHtml: buildDocumentsCompleteEmailHtml(job),
    emailPrefKey: "jobApprovedCompleted",
  });
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
