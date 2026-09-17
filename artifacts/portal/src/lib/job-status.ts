export const JOB_STATUS_JOURNEY = [
  "request",
  "confirmed",
  "received",
  "awaiting_invoice",
  "invoice",
  "completed",
] as const;

export interface JobStatusContext {
  status: string;
  scheduleStatus: string;
  invoiceReceivedDate: string | null;
  invoiceStatus: string | null;
  datePaid: string | null;
  receiptClientDeliveryStatus: string | null;
  receiptAccountsDeliveryStatus: string | null;
  remainingReviewCount: number;
}

export function getJobNextStep(context: JobStatusContext): string {
  if (context.status === "completed") return "No further action is required.";
  if (context.scheduleStatus !== "confirmed") {
    return "Confirm the collection schedule when the collection company has proposed the date, driver and vehicle.";
  }
  if (context.remainingReviewCount > 0) {
    return `Review the remaining ${context.remainingReviewCount} battery item${context.remainingReviewCount === 1 ? "" : "s"}.`;
  }
  if (
    context.receiptClientDeliveryStatus !== "sent"
    || context.receiptAccountsDeliveryStatus !== "sent"
  ) {
    return "Preview the recipients and send the completed receipt documents.";
  }
  if (
    !context.invoiceReceivedDate
    && context.invoiceStatus !== "invoiced"
    && context.invoiceStatus !== "paid"
  ) {
    return "Record the received invoice or mark the invoice as invoiced.";
  }
  if (!context.datePaid) return "Enter the paid date when payment is complete.";
  return "The recorded milestones are complete.";
}

export function isBackwardJobStatusChange(current: string, next: string): boolean {
  const currentIndex = JOB_STATUS_JOURNEY.indexOf(current as (typeof JOB_STATUS_JOURNEY)[number]);
  const nextIndex = JOB_STATUS_JOURNEY.indexOf(next as (typeof JOB_STATUS_JOURNEY)[number]);
  return currentIndex >= 0 && nextIndex >= 0 && nextIndex < currentIndex;
}
