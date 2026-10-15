export function requestAllowed(kind: string, status: string, physicalCollectionReported = false): boolean {
  if (kind === "transport_exception") return true;
  if (["completed", "cancelled", "draft"].includes(status)) return false;
  if (kind === "amendment") return ["request", "confirmed", "received", "processing", "awaiting_invoice", "invoice", "invoiced"].includes(status);
  if (kind === "cancellation") return ["request", "confirmed"].includes(status) && !physicalCollectionReported;
  return false;
}
