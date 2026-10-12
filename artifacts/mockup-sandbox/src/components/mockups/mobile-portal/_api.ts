const API_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(_path: string): Promise<T> {return {job:{id:49,reference:"JOB-1026-00049",status:"confirmed",depot:"Birmingham Depot",collectionPoint:"Birmingham Depot",collectionDate:"2026-10-15",submittedAt:"2026-10-12T09:15:00Z",tonnage:"0.700",palletCount:2},batteries:[{id:1,palletNumber:"P1",manufacture:"TAB",cellType:"5 PzS 625",voltage:"24V",assetNumber:"FL-142"},{id:2,palletNumber:"P2",manufacture:"Hoppecke",cellType:"4 PzS 500",voltage:"48V",batterySerial:"B-7821"}]} as unknown as T;}

export const STATUS_LABELS: Record<string, string> = {
  request: "Requested",
  confirmed: "Confirmed",
  received: "Received",
  invoice: "Invoice",
  awaiting_invoice: "Awaiting Invoice",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_STYLES: Record<string, string> = {
  request: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-teal-100 text-teal-800 border-teal-200",
  received: "bg-blue-100 text-blue-800 border-blue-200",
  invoice: "bg-violet-100 text-violet-800 border-violet-200",
  awaiting_invoice: "bg-orange-100 text-orange-800 border-orange-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Customers see a simplified journey: internal invoicing stages read as "Processing". */
export function customerStatusLabel(status: string): string {
  if (status === "invoice" || status === "awaiting_invoice") return "Processing";
  return STATUS_LABELS[status] || status.replace(/_/g, " ");
}

export const DECISION_STYLES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-800 border-amber-200",
  Approved: "bg-green-50 text-green-800 border-green-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  New: "bg-sky-50 text-sky-800 border-sky-200",
  "In Progress": "bg-amber-50 text-amber-800 border-amber-200",
  Resolved: "bg-green-50 text-green-800 border-green-200",
};

export const REQUEST_KIND_LABELS: Record<string, string> = {
  amendment: "Amendment request",
  cancellation: "Cancellation request",
  transport_exception: "Transport exception",
};

export const EXCEPTION_OUTCOMES: { value: string; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "partially_completed", label: "Partially completed" },
  { value: "failed", label: "Failed" },
  { value: "missed", label: "Missed" },
  { value: "other", label: "Other" },
];

export interface SafeJob {
  id: number;
  reference: string;
  clientName?: string | null;
  depot?: string | null;
  collectionPoint?: string | null;
  collectionDate?: string | null;
  submittedAt?: string | null;
  status: string;
  palletCount?: number | null;
  tonnage?: string | number | null;
  signedDocumentTypes?: string[];
}

export interface JobRequest {
  id: number;
  kind: string;
  notes: string | null;
  outcome?: string | null;
  status: "Pending" | "Approved" | "Rejected";
  decisionNotes?: string | null;
  createdAt: string;
  requesterName?: string | null;
}

export interface ActionRequest extends JobRequest {
  jobId: number;
  reference?: string | null;
  notificationStatus?: string | null;
  decidedAt?: string | null;
}

export interface SupportTicket {
  id: number;
  title: string;
  details: string | null;
  status: "New" | "In Progress" | "Resolved";
  createdAt: string;
  notificationStatus?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
}

export function fmtDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function fmtTonnes(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}t` : "—";
}

export function fmtGBP(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

export function notificationLabel(s: string | null | undefined): string {
  if (!s) return "Not sent";
  const map: Record<string, string> = {
    sent: "Email sent",
    failed: "Email failed",
    not_configured: "Email not configured",
    pending: "Email pending",
    skipped: "Email skipped",
  };
  return map[s] || s.replace(/_/g, " ");
}
