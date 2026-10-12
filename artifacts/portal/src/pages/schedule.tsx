import { useState, useEffect, useRef, useCallback } from "react";
import { calendarDate as isoDate } from "@/lib/calendar-date";
import { useLocation } from "wouter";
import {
  ChevronLeft, ChevronRight, CalendarDays, Calendar,
  GanttChartSquare, X, ExternalLink, Battery,
  SlidersHorizontal, ClipboardList, AlertTriangle,
} from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface ScheduleJob {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  tonnage: string;
  palletCount: number;
  collectionDate: string;
  status: string;
}

interface JobDetail {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionPoint: string | null;
  collectionDate: string | null;
  submittedAt: string;
  tonnage: string;
  status: string;
  notes: string | null;
  invoiceStatus: string | null;
  lmeRateUsed: string | null;
  calculatedValue: string | null;
  cblLmeValue: string | null;
  cblLmePercent: string | null;
  cblLmePrice: string | null;
  transportCost: string | null;
  customerInvoiceValue: string | null;
  customerInvoiceNo: string | null;
  cblWasteAdviceNoteNo: string | null;
  cblDate: string | null;
  totalInvoiceValue: string | null;
  grossProfit: string | null;
  itiniumInvoiceNo: string | null;
  invoiceReceivedDate: string | null;
  dueDate: string | null;
  datePaid: string | null;
  daysToPay: number | null;
}

interface BatteryDetail {
  id: number;
  palletNumber: string | null;
  assetNumber: string | null;
  batterySerial: string | null;
  manufacture: string | null;
  cellType: string | null;
  voltage: string | null;
  looseCellsQty: number | null;
  notes: string | null;
  pbContentKg: string | null;
  estimatedWeightKg: string | null;
  isLooseCells: boolean;
  receiptConfirmed: boolean;
}

interface AuditEntry {
  id: number;
  jobId: number;
  jobReference: string;
  oldDate: string | null;
  newDate: string;
  changedByName: string;
  changedAt: string;
}

interface PendingReschedule {
  jobId: number;
  reference: string;
  oldDate: string | null;
  newDate: string;
}

type ViewMode = "month" | "week" | "gantt";

// ─── Status colour maps ───────────────────────────────────────────────────────

const STATUS_COLOUR: Record<string, { bg: string; text: string; border: string }> = {
  request:          { bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-300" },
  confirmed:        { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300"  },
  received:         { bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300" },
  awaiting_invoice: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300"},
  invoice:          { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300"},
  completed:        { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300"},
};

const STATUS_LABEL: Record<string, string> = {
  request:          "Pending",
  confirmed:        "Confirmed",
  received:         "In Progress",
  awaiting_invoice: "Awaiting Invoice",
  invoice:          "Invoiced",
  completed:        "Closed",
};

const DOT_COLOUR: Record<string, string> = {
  request:          "bg-amber-500",
  confirmed:        "bg-blue-500",
  received:         "bg-green-500",
  awaiting_invoice: "bg-purple-500",
  invoice:          "bg-purple-500",
  completed:        "bg-purple-500",
};

const STATUS_BORDER_HEX: Record<string, string> = {
  request:          "#f59e0b",
  confirmed:        "#3b82f6",
  received:         "#22c55e",
  awaiting_invoice: "#a855f7",
  invoice:          "#a855f7",
  completed:        "#a855f7",
};

// ─── Gantt constants ──────────────────────────────────────────────────────────

const GANTT_SIDEBAR_W = 196;
const GANTT_DAY_W     = 44;
const GANTT_ROW_H     = 34;
const GANTT_HEADER_H  = 52;
const GANTT_PAD_DAYS  = 14;
const GANTT_FUTURE    = 30;

const SITE_PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#14b8a6", "#f97316", "#84cc16", "#ec4899", "#06b6d4", "#e11d48",
];

const LS_COLOURS_KEY = "itinium_gantt_site_colours";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getColour(status: string) {
  return STATUS_COLOUR[status] ?? { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
}


function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + n);
  return result;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
  }
  return `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s + (s.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtGbp(v: string | null | undefined): string {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
}

function loadSiteColours(): Record<string, string> {
  try { const raw = localStorage.getItem(LS_COLOURS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

function saveSiteColours(c: Record<string, string>) {
  try { localStorage.setItem(LS_COLOURS_KEY, JSON.stringify(c)); } catch {}
}

function packJobs(jobs: ScheduleJob[]): Array<ScheduleJob & { row: number }> {
  const sorted = [...jobs].sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  const lastDateInRow: string[] = [];
  return sorted.map((job) => {
    const date = job.collectionDate.slice(0, 10);
    let assigned = -1;
    for (let r = 0; r < lastDateInRow.length; r++) {
      if (lastDateInRow[r] !== date) { assigned = r; lastDateInRow[r] = date; break; }
    }
    if (assigned === -1) { assigned = lastDateInRow.length; lastDateInRow.push(date); }
    return { ...job, row: assigned };
  });
}

// ─── Reschedule confirmation modal ────────────────────────────────────────────

function RescheduleModal({
  pending,
  saving,
  error,
  onConfirm,
  onCancel,
}: {
  pending: PendingReschedule;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [saving, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!saving ? onCancel : undefined} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0f2744]">Confirm Reschedule</h2>
            <p className="text-sm text-slate-500 mt-0.5">This will update the collection date in the database.</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Job Reference</span>
            <span className="font-semibold text-[#0f2744]">{pending.reference}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">From</span>
            <span className="font-medium text-slate-700">{formatDate(pending.oldDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">To</span>
            <span className="font-semibold text-[#0ea5e9]">{formatDate(pending.newDate)}</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#0f2744] hover:bg-[#1a3a6b] text-white text-sm font-medium disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</> : "Confirm Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Audit log drawer ─────────────────────────────────────────────────────────

function AuditLogDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/schedule/audit-log", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setEntries(d.entries ?? []); setError(null); })
      .catch(() => setError("Could not load audit log."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div className={`fixed top-0 right-0 h-full w-[520px] bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-slate-400" />
            <h2 className="text-base font-bold text-[#0f2744]">Reschedule Audit Log</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-48">
              <div className="w-5 h-5 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="p-5 text-sm text-red-500">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <ClipboardList className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No reschedule events recorded yet.</p>
            </div>
          )}
          {!loading && entries.length > 0 && (
            <div className="divide-y divide-slate-100">
              {entries.map((e) => (
                <div key={e.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#0f2744]">{e.jobReference}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span>{formatDate(e.oldDate)}</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-[#0ea5e9] font-medium">{formatDate(e.newDate)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-600">{e.changedByName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(e.changedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        {" "}
                        {new Date(e.changedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          <p className="text-xs text-slate-400 text-center">Showing most recent 200 entries</p>
        </div>
      </div>
    </>
  );
}

// ─── Job detail panel ─────────────────────────────────────────────────────────

function PanelRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs text-slate-800 font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-5 mb-2 px-5">
      {children}
    </h3>
  );
}

function JobDetailPanel({
  jobId, onClose, onViewFull,
}: {
  jobId: number | null; onClose: () => void; onViewFull: (id: number) => void;
}) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [batteries, setBatteries] = useState<BatteryDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOpen = jobId !== null;

  useEffect(() => {
    if (jobId === null) { setJob(null); setBatteries([]); return; }
    setLoading(true); setError(null);
    fetch(`/api/jobs/${jobId}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setJob(d.job); setBatteries(d.batteries ?? []); })
      .catch(() => setError("Could not load job details."))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  const statusClr = job ? getColour(job.status) : null;

  return (
    <>
      <div className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-200 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} onClick={onClose} />
      <div className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            {job ? (<><p className="text-xs text-slate-400 font-medium">{job.reference}</p><h2 className="text-base font-bold text-[#0f2744] leading-tight">{job.clientName}</h2></>) : (
              <div className="h-10 flex items-center"><p className="text-sm text-slate-400">{loading ? "Loading…" : "Job Record"}</p></div>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close panel">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex items-center justify-center h-48"><div className="w-5 h-5 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" /></div>}
          {error && <div className="p-5"><p className="text-sm text-red-500">{error}</p></div>}
          {job && !loading && (
            <>
              <div className="px-5 pt-4">
                {statusClr && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusClr.bg} ${statusClr.text} ${statusClr.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLOUR[job.status] ?? "bg-slate-400"}`} />
                    {STATUS_LABEL[job.status] ?? job.status}
                  </span>
                )}
              </div>
              <SectionHeading>Job Information</SectionHeading>
              <div className="px-5">
                <PanelRow label="Client" value={job.clientName} />
                <PanelRow label="Site / Depot" value={job.depot} />
                <PanelRow label="Collection Point" value={job.collectionPoint} />
                <PanelRow label="Collection Date" value={formatDate(job.collectionDate)} />
                <PanelRow label="Submitted" value={formatDate(job.submittedAt)} />
                <PanelRow label="Tonnage" value={job.tonnage ? `${parseFloat(job.tonnage).toFixed(3)} t` : "—"} />
                <PanelRow label="Invoice Status" value={job.invoiceStatus ?? "—"} />
                {job.notes && <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-100"><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">Notes</p><p className="text-xs text-amber-900 leading-relaxed whitespace-pre-line">{job.notes}</p></div>}
              </div>
              <SectionHeading>Financial</SectionHeading>
              <div className="px-5">
                <PanelRow label="LME Rate Used" value={job.lmeRateUsed ? `£${parseFloat(job.lmeRateUsed).toLocaleString("en-GB", { minimumFractionDigits: 2 })}/t` : "—"} />
                <PanelRow label="Calculated Value" value={fmtGbp(job.calculatedValue)} />
                <PanelRow label="CBL LME %" value={job.cblLmePercent ? `${parseFloat(job.cblLmePercent).toFixed(2)}%` : "—"} />
                <PanelRow label="CBL LME Value" value={fmtGbp(job.cblLmeValue)} />
                <PanelRow label="CBL LME Price" value={fmtGbp(job.cblLmePrice)} />
                <PanelRow label="Transport Cost" value={fmtGbp(job.transportCost)} />
                <PanelRow label="Customer Invoice No" value={job.customerInvoiceNo} />
                <PanelRow label="Customer Invoice Value" value={fmtGbp(job.customerInvoiceValue)} />
                <PanelRow label="CBL Waste Note No" value={job.cblWasteAdviceNoteNo} />
                <PanelRow label="CBL Date" value={formatDate(job.cblDate)} />
                <PanelRow label="Total Invoice Value" value={fmtGbp(job.totalInvoiceValue)} />
                <PanelRow label="Gross Profit" value={fmtGbp(job.grossProfit)} />
                <PanelRow label="Itinium Invoice No" value={job.itiniumInvoiceNo} />
                <PanelRow label="Invoice Received" value={formatDate(job.invoiceReceivedDate)} />
                <PanelRow label="Due Date" value={formatDate(job.dueDate)} />
                <PanelRow label="Date Paid" value={formatDate(job.datePaid)} />
                <PanelRow label="Days to Pay" value={job.daysToPay != null ? String(job.daysToPay) : "—"} />
              </div>
              <SectionHeading>Battery Records ({batteries.length})</SectionHeading>
              {batteries.length === 0 ? (
                <p className="px-5 text-xs text-slate-400">No battery records attached.</p>
              ) : (
                <div className="px-5 pb-2">
                  {batteries.map((bat, idx) => (
                    <div key={bat.id} className="mb-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-slate-600"><Battery className="w-3 h-3 inline mr-1 text-slate-400" />Battery {idx + 1}{bat.isLooseCells && <span className="ml-2 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Loose Cells</span>}</p>
                        {bat.receiptConfirmed && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Receipt confirmed</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4">
                        {bat.batterySerial && <PanelRow label="Serial" value={bat.batterySerial} />}
                        {bat.palletNumber   && <PanelRow label="Pallet" value={bat.palletNumber} />}
                        {bat.assetNumber    && <PanelRow label="Asset" value={bat.assetNumber} />}
                        {bat.manufacture    && <PanelRow label="Make" value={bat.manufacture} />}
                        {bat.cellType       && <PanelRow label="Cell type" value={bat.cellType} />}
                        {bat.voltage        && <PanelRow label="Voltage" value={bat.voltage} />}
                        {bat.isLooseCells && bat.looseCellsQty != null && <PanelRow label="Loose cells" value={String(bat.looseCellsQty)} />}
                        {bat.estimatedWeightKg && <PanelRow label="Est. weight" value={`${parseFloat(bat.estimatedWeightKg).toFixed(2)} kg`} />}
                        {bat.pbContentKg && <PanelRow label="Pb content" value={`${parseFloat(bat.pbContentKg).toFixed(3)} kg`} />}
                        {bat.notes && <div className="col-span-2"><PanelRow label="Notes" value={bat.notes} /></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="h-4" />
            </>
          )}
        </div>
        {job && (
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
            <button onClick={() => onViewFull(job.id)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0f2744] hover:bg-[#1a3a6b] text-white text-sm font-medium transition-colors">
              <ExternalLink className="w-4 h-4" />View Full Job Record
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Draggable job block ──────────────────────────────────────────────────────

function JobBlock({
  job, onClick, onDragStart,
}: {
  job: ScheduleJob;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const colour = getColour(job.status);
  const tonnage = Number.parseFloat(job.tonnage);
  const tonnageLabel = Number.isFinite(tonnage) ? `${tonnage.toFixed(3)} t` : "—";
  const palletLabel = `${job.palletCount} pallet${job.palletCount === 1 ? "" : "s"}`;
  return (
    <button
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`w-full text-left rounded px-1.5 py-1 border text-xs leading-tight cursor-grab active:cursor-grabbing hover:brightness-95 transition-all ${colour.bg} ${colour.text} ${colour.border}`}
      title={`${job.reference}\n${job.depot}\n${tonnageLabel} · ${palletLabel}${onDragStart ? "\nDrag to reschedule" : ""}`}
    >
      <span className="font-semibold block truncate">{job.reference}</span>
      <span className="opacity-85 block truncate">{job.depot}</span>
      <span className="opacity-70 block truncate text-[10px]">{tonnageLabel} · {palletLabel}</span>
    </button>
  );
}

function StatusLegend() {
  const items = [
    { label: "Pending",           dot: "bg-amber-500"  },
    { label: "Confirmed",         dot: "bg-blue-500"   },
    { label: "In Progress",       dot: "bg-green-500"  },
    { label: "Invoiced / Closed", dot: "bg-purple-500" },
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {items.map(({ label, dot }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0`} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  anchor, jobsByDate, onJobClick, onDragStart, onDrop, onDragOver, onDragLeave, dragOverDate,
}: {
  anchor: Date;
  jobsByDate: Map<string, ScheduleJob[]>;
  onJobClick: (id: number) => void;
  onDragStart: (e: React.DragEvent, job: ScheduleJob) => void;
  onDrop: (e: React.DragEvent, date: string) => void;
  onDragOver: (e: React.DragEvent, date: string) => void;
  onDragLeave: () => void;
  dragOverDate: string | null;
}) {
  const today = isoDate(new Date());
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = startOfWeek(firstOfMonth);
  const totalCells = Math.ceil(((lastOfMonth.getDate() - 1 + ((firstOfMonth.getDay() + 6) % 7)) + 1) / 7) * 7;
  const days = Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i));

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2 uppercase tracking-wide">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
        {days.map((day) => {
          const key = isoDate(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday = key === today;
          const isDragTarget = dragOverDate === key;
          const jobs = jobsByDate.get(key) ?? [];
          return (
            <div
              key={key}
              onDrop={(e) => onDrop(e, key)}
              onDragOver={(e) => onDragOver(e, key)}
              onDragLeave={onDragLeave}
              className={`border-b border-r border-slate-200 p-1.5 flex flex-col gap-1 min-h-[100px] transition-colors ${
                isDragTarget ? "bg-sky-50 ring-2 ring-inset ring-[#0ea5e9]" :
                isCurrentMonth ? "bg-white" : "bg-slate-50"
              }`}
            >
              <span className={`text-xs font-medium self-start w-6 h-6 flex items-center justify-center rounded-full ${
                isToday ? "bg-[#0ea5e9] text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-300"
              }`}>{day.getDate()}</span>
              {jobs.map((job) => (
                <JobBlock key={job.id} job={job} onClick={() => onJobClick(job.id)} onDragStart={(e) => onDragStart(e, job)} />
              ))}
              {isDragTarget && <div className="flex-1 flex items-center justify-center"><span className="text-[10px] text-[#0ea5e9] font-medium">Drop to reschedule</span></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({
  anchor, jobsByDate, onJobClick, onDragStart, onDrop, onDragOver, onDragLeave, dragOverDate,
}: {
  anchor: Date;
  jobsByDate: Map<string, ScheduleJob[]>;
  onJobClick: (id: number) => void;
  onDragStart: (e: React.DragEvent, job: ScheduleJob) => void;
  onDrop: (e: React.DragEvent, date: string) => void;
  onDragOver: (e: React.DragEvent, date: string) => void;
  onDragLeave: () => void;
  dragOverDate: string | null;
}) {
  const today = isoDate(new Date());
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {days.map((day) => {
          const key = isoDate(day);
          const isToday = key === today;
          return (
            <div key={key} className="text-center py-3 border-r border-slate-200 last:border-r-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{day.toLocaleDateString("en-GB", { weekday: "short" })}</p>
              <span className={`mx-auto mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-[#0ea5e9] text-white" : "text-slate-700"}`}>{day.getDate()}</span>
              <p className="text-xs text-slate-400 mt-0.5">{day.toLocaleDateString("en-GB", { month: "short" })}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = isoDate(day);
          const jobs = jobsByDate.get(key) ?? [];
          const isDragTarget = dragOverDate === key;
          return (
            <div
              key={key}
              onDrop={(e) => onDrop(e, key)}
              onDragOver={(e) => onDragOver(e, key)}
              onDragLeave={onDragLeave}
              className={`border-r border-slate-200 last:border-r-0 p-2 flex flex-col gap-1.5 min-h-[400px] transition-colors ${
                isDragTarget ? "bg-sky-50 ring-2 ring-inset ring-[#0ea5e9]" : "bg-white"
              }`}
            >
              {isDragTarget && <div className="text-center py-2"><span className="text-[10px] text-[#0ea5e9] font-medium">Drop to reschedule</span></div>}
              {jobs.length === 0 && !isDragTarget ? (
                <p className="text-xs text-slate-300 text-center mt-4">—</p>
              ) : (
                jobs.map((job) => (
                  <JobBlock key={job.id} job={job} onClick={() => onJobClick(job.id)} onDragStart={(e) => onDragStart(e, job)} />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Gantt view ───────────────────────────────────────────────────────────────

function GanttView({ jobs, onJobClick }: { jobs: ScheduleJob[]; onJobClick: (id: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [siteColours, setSiteColours] = useState<Record<string, string>>(loadSiteColours);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let minDate = today, maxDate = today;
  for (const job of jobs) {
    if (!job.collectionDate) continue;
    const d = new Date(job.collectionDate + "T00:00:00");
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  }

  const timelineStart = addDays(minDate, -GANTT_PAD_DAYS);
  const timelineEnd   = addDays(maxDate, GANTT_FUTURE);
  const totalDays     = daysBetween(timelineStart, timelineEnd) + 1;

  useEffect(() => {
    if (!scrollRef.current) return;
    const offset = daysBetween(timelineStart, today) * GANTT_DAY_W;
    scrollRef.current.scrollLeft = Math.max(0, offset - scrollRef.current.clientWidth * 0.3);
  }, []);

  const allDepots = Array.from(new Set(jobs.map((j) => j.depot))).sort();
  const colours = { ...siteColours };
  let pi = Object.keys(colours).length % SITE_PALETTE.length;
  for (const d of allDepots) { if (!colours[d]) { colours[d] = SITE_PALETTE[pi % SITE_PALETTE.length]; pi++; } }

  const updateColour = useCallback((depot: string, hex: string) => {
    setSiteColours((prev) => { const next = { ...prev, [depot]: hex }; saveSiteColours(next); return next; });
  }, []);

  const depotsWithJobs = allDepots
    .map((depot) => ({ depot, packed: packJobs(jobs.filter((j) => j.depot === depot)) }))
    .sort((a, b) => b.packed.length - a.packed.length);

  const monthSegments: Array<{ label: string; days: number; startDay: number }> = [];
  let cur = new Date(timelineStart); let segStart = 0;
  while (cur <= timelineEnd) {
    const label = cur.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = next <= timelineEnd ? next : addDays(timelineEnd, 1);
    const days = daysBetween(cur, end);
    monthSegments.push({ label, days, startDay: segStart });
    segStart += days; cur = next;
  }

  const todayOffset = daysBetween(timelineStart, today);
  const totalGridW = totalDays * GANTT_DAY_W;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="shrink-0 bg-white border-r border-slate-200 z-10 flex flex-col" style={{ width: GANTT_SIDEBAR_W }}>
        <div className="border-b border-slate-200 bg-slate-50 flex items-end px-3 pb-2" style={{ height: GANTT_HEADER_H }}>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Site</span>
        </div>
        <div className="overflow-y-auto flex-1">
          {depotsWithJobs.map(({ depot, packed }) => {
            const numRows = Math.max(1, ...packed.map((j) => j.row + 1));
            const rowH = numRows * GANTT_ROW_H + 8;
            const siteHex = colours[depot] ?? "#6366f1";
            const inputId = `gc-${depot.replace(/\s+/g, "-")}`;
            return (
              <div key={depot} className="border-b border-slate-100 flex items-start px-3 gap-2" style={{ minHeight: rowH }}>
                <div className="relative mt-2 shrink-0">
                  <label htmlFor={inputId} className="block w-4 h-4 rounded cursor-pointer ring-1 ring-slate-300 hover:ring-2 hover:ring-slate-400 transition-all" style={{ backgroundColor: siteHex }} title="Click to change site colour" />
                  <input id={inputId} type="color" value={siteHex} onChange={(e) => updateColour(depot, e.target.value)} className="absolute opacity-0 w-0 h-0 pointer-events-none" />
                </div>
                <div className="flex-1 min-w-0 mt-2">
                  <p className="text-xs font-semibold text-[#0f2744] truncate leading-tight">{depot}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{packed.length} job{packed.length === 1 ? "" : "s"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto">
        <div style={{ width: totalGridW, minWidth: totalGridW }}>
          <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10" style={{ height: GANTT_HEADER_H / 2 }}>
            {monthSegments.map((seg) => (
              <div key={seg.startDay} className="border-r border-slate-200 flex items-center px-2 shrink-0" style={{ width: seg.days * GANTT_DAY_W }}>
                <span className="text-xs font-semibold text-slate-600 truncate">{seg.label}</span>
              </div>
            ))}
          </div>
          <div className="flex border-b border-slate-200 bg-slate-50 sticky z-10" style={{ top: GANTT_HEADER_H / 2, height: GANTT_HEADER_H / 2 }}>
            {Array.from({ length: totalDays }, (_, i) => {
              const d = addDays(timelineStart, i);
              const isToday = i === todayOffset;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} className={`shrink-0 border-r border-slate-100 flex flex-col items-center justify-center ${isToday ? "bg-sky-50" : isWeekend ? "bg-slate-50" : "bg-white"}`} style={{ width: GANTT_DAY_W }}>
                  <span className={`text-[10px] font-medium leading-none ${isToday ? "text-[#0ea5e9]" : isWeekend ? "text-slate-300" : "text-slate-400"}`}>{d.toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
                  <span className={`text-xs font-semibold mt-0.5 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-[#0ea5e9] text-white" : isWeekend ? "text-slate-300" : "text-slate-600"}`}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>
          <div className="relative" style={{ width: totalGridW }}>
            {todayOffset >= 0 && todayOffset < totalDays && (
              <div className="absolute top-0 bottom-0 w-px bg-sky-400 z-20 pointer-events-none" style={{ left: todayOffset * GANTT_DAY_W + GANTT_DAY_W / 2 }} />
            )}
            {Array.from({ length: totalDays }, (_, i) => {
              const d = addDays(timelineStart, i);
              return (d.getDay() === 0 || d.getDay() === 6) ? <div key={i} className="absolute top-0 bottom-0 bg-slate-50 pointer-events-none" style={{ left: i * GANTT_DAY_W, width: GANTT_DAY_W }} /> : null;
            })}
            {depotsWithJobs.map(({ depot, packed }) => {
              const numRows = Math.max(1, ...packed.map((j) => j.row + 1));
              const rowH = numRows * GANTT_ROW_H + 8;
              const siteHex = colours[depot] ?? "#6366f1";
              return (
                <div key={depot} className="relative border-b border-slate-100" style={{ minHeight: rowH }}>
                  {Array.from({ length: totalDays }, (_, i) => <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100 pointer-events-none" style={{ left: i * GANTT_DAY_W, width: GANTT_DAY_W }} />)}
                  {packed.map((job) => {
                    const jobDate = new Date(job.collectionDate + "T00:00:00");
                    const dayIndex = daysBetween(timelineStart, jobDate);
                    if (dayIndex < 0 || dayIndex >= totalDays) return null;
                    const left = dayIndex * GANTT_DAY_W + 2, top = 4 + job.row * GANTT_ROW_H;
                    const width = GANTT_DAY_W - 4, height = GANTT_ROW_H - 6;
                    const statusBorder = STATUS_BORDER_HEX[job.status] ?? "#94a3b8";
                    return (
                      <button key={job.id} onClick={() => onJobClick(job.id)} className="absolute rounded overflow-hidden text-left cursor-pointer hover:brightness-90 transition-all"
                        style={{ left, top, width, height, backgroundColor: hexToRgba(siteHex, 0.18), border: `1px solid ${hexToRgba(siteHex, 0.5)}`, borderLeft: `4px solid ${statusBorder}` }}
                        title={`${job.reference}\n${job.depot}\n${Number.parseFloat(job.tonnage).toFixed(3)} t · ${job.palletCount} pallet${job.palletCount === 1 ? "" : "s"}\n${STATUS_LABEL[job.status] ?? job.status} · ${job.collectionDate}`}>
                        <span className="block px-1 text-[10px] font-semibold leading-tight truncate" style={{ color: siteHex, filter: "brightness(0.7)" }}>{job.reference}</span>
                        <span className="block px-1 text-[10px] text-slate-500 leading-tight truncate">{job.depot}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [auditLogOpen, setAuditLogOpen] = useState(false);

  // Filters
  const [filterSite, setFilterSite]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterClient, setFilterClient] = useState("");

  // Drag-and-drop
  const [dragOverDate, setDragOverDate]       = useState<string | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/jobs/schedule", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setJobs(data.jobs ?? []); setError(null); })
      .catch(() => setError("Could not load schedule data. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  // Filter options
  const siteOptions   = Array.from(new Set(jobs.map((j) => j.depot))).sort();
  const clientOptions = Array.from(new Set(jobs.map((j) => j.clientName))).sort();
  const statusOptions = [
    { value: "request",          label: "Pending"          },
    { value: "confirmed",        label: "Confirmed"        },
    { value: "received",         label: "In Progress"      },
    { value: "awaiting_invoice", label: "Awaiting Invoice" },
    { value: "invoice",          label: "Invoiced"         },
    { value: "completed",        label: "Closed"           },
  ].filter((s) => jobs.some((j) => j.status === s.value));

  const hasFilters = filterSite !== "" || filterStatus !== "" || filterClient !== "";

  const filteredJobs = jobs.filter((j) => {
    if (filterSite   && j.depot      !== filterSite)   return false;
    if (filterStatus && j.status     !== filterStatus) return false;
    if (filterClient && j.clientName !== filterClient) return false;
    return true;
  });

  const jobsByDate = new Map<string, ScheduleJob[]>();
  for (const job of filteredJobs) {
    if (!job.collectionDate) continue;
    const key = job.collectionDate.slice(0, 10);
    if (!jobsByDate.has(key)) jobsByDate.set(key, []);
    jobsByDate.get(key)!.push(job);
  }

  // DnD handlers
  function handleDragStart(e: React.DragEvent, job: ScheduleJob) {
    e.dataTransfer.setData("text/plain", JSON.stringify({
      jobId: job.id, reference: job.reference, oldDate: job.collectionDate,
    }));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, date: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(date);
  }

  function handleDragLeave() {
    setDragOverDate(null);
  }

  function handleDrop(e: React.DragEvent, targetDate: string) {
    e.preventDefault();
    setDragOverDate(null);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const { jobId, reference, oldDate } = JSON.parse(raw);
      if (oldDate === targetDate) return;
      setPendingReschedule({ jobId, reference, oldDate, newDate: targetDate });
      setSaveError(null);
    } catch {}
  }

  async function confirmReschedule() {
    if (!pendingReschedule) return;
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch(`/api/jobs/${pendingReschedule.jobId}/reschedule`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: pendingReschedule.newDate }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message ?? "Failed"); }
      setJobs((prev) => prev.map((j) =>
        j.id === pendingReschedule.jobId ? { ...j, collectionDate: pendingReschedule.newDate } : j
      ));
      setPendingReschedule(null);
    } catch (err: any) {
      setSaveError(err.message ?? "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function nav_prev() {
    if (view === "month") setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
    else setAnchor((a) => addDays(a, -7));
  }
  function nav_next() {
    if (view === "month") setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
    else setAnchor((a) => addDays(a, 7));
  }
  function goToday() { const d = new Date(); d.setHours(0,0,0,0); setAnchor(d); }

  const calendarTitle = view === "month" ? formatMonthYear(anchor) : formatWeekRange(startOfWeek(anchor));
  const withDate = filteredJobs.length;
  const totalWithDate = jobs.length;

  const dndProps = {
    onDragStart: handleDragStart,
    onDrop: handleDrop,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    dragOverDate,
  };

  return (
    <SidebarLayout title="Schedule" subtitle="Collection planning">
      <div className="flex flex-col h-full -m-8">
        {/* Page header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[#0f2744]">Schedule</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {loading ? "Loading…"
                : hasFilters ? `${withDate} of ${totalWithDate} job${totalWithDate === 1 ? "" : "s"} shown`
                : view === "gantt" ? `${withDate} job${withDate === 1 ? "" : "s"} · click the colour swatch beside each site to customise`
                : `${withDate} job${withDate === 1 ? "" : "s"} with collection dates`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {view !== "gantt" && <StatusLegend />}

            {/* Audit log */}
            <button
              onClick={() => setAuditLogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              title="View reschedule audit log"
            >
              <ClipboardList className="w-4 h-4" />
              Audit Log
            </button>

            {/* View toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button onClick={() => setView("month")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${view === "month" ? "bg-[#0f2744] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                <Calendar className="w-4 h-4" />Month
              </button>
              <button onClick={() => setView("week")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${view === "week" ? "bg-[#0f2744] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                <CalendarDays className="w-4 h-4" />Week
              </button>
              <button onClick={() => setView("gantt")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${view === "gantt" ? "bg-[#0f2744] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                <GanttChartSquare className="w-4 h-4" />Gantt
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        {!loading && !error && (
          <div className="flex items-center gap-2 px-8 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex-wrap">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select value={filterSite} onChange={(e) => setFilterSite(e.target.value)} className={`h-8 rounded-md border text-xs px-2 pr-7 bg-white focus:outline-none focus:ring-2 focus:ring-[#0ea5e9] transition-colors ${filterSite ? "border-[#0ea5e9] text-[#0f2744] font-semibold" : "border-slate-200 text-slate-600"}`}>
              <option value="">All Sites</option>
              {siteOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`h-8 rounded-md border text-xs px-2 pr-7 bg-white focus:outline-none focus:ring-2 focus:ring-[#0ea5e9] transition-colors ${filterStatus ? "border-[#0ea5e9] text-[#0f2744] font-semibold" : "border-slate-200 text-slate-600"}`}>
              <option value="">All Statuses</option>
              {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className={`h-8 rounded-md border text-xs px-2 pr-7 bg-white focus:outline-none focus:ring-2 focus:ring-[#0ea5e9] transition-colors ${filterClient ? "border-[#0ea5e9] text-[#0f2744] font-semibold" : "border-slate-200 text-slate-600"}`}>
              <option value="">All Clients</option>
              {clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {hasFilters && (
              <button onClick={() => { setFilterSite(""); setFilterStatus(""); setFilterClient(""); }} className="flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors">
                <X className="w-3 h-3" />Clear filters
              </button>
            )}
          </div>
        )}

        {/* Calendar nav — hidden in Gantt */}
        {view !== "gantt" && (
          <div className="flex items-center gap-3 px-8 py-3 border-b border-slate-200 bg-white shrink-0">
            <button onClick={nav_prev} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">Today</button>
            <button onClick={nav_next} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"><ChevronRight className="w-4 h-4" /></button>
            <h2 className="text-base font-semibold text-[#0f2744] ml-1">{calendarTitle}</h2>
            {(view === "month" || view === "week") && (
              <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded border border-slate-300 bg-white" style={{ cursor: "grab" }} />
                Drag job blocks to reschedule
              </span>
            )}
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-5 h-5 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
              Loading schedule…
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center"><p className="text-sm text-red-500">{error}</p></div>
        ) : view === "month" ? (
          <MonthView anchor={anchor} jobsByDate={jobsByDate} onJobClick={setSelectedJobId} {...dndProps} />
        ) : view === "week" ? (
          <WeekView anchor={anchor} jobsByDate={jobsByDate} onJobClick={setSelectedJobId} {...dndProps} />
        ) : (
          <GanttView jobs={filteredJobs} onJobClick={setSelectedJobId} />
        )}
      </div>

      {/* Reschedule confirmation modal */}
      {pendingReschedule && (
        <RescheduleModal
          pending={pendingReschedule}
          saving={saving}
          error={saveError}
          onConfirm={confirmReschedule}
          onCancel={() => { setPendingReschedule(null); setSaveError(null); }}
        />
      )}

      {/* Job detail panel */}
      <JobDetailPanel
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
        onViewFull={(id) => { setSelectedJobId(null); navigate(`/jobs/${id}`); }}
      />

      {/* Audit log drawer */}
      <AuditLogDrawer open={auditLogOpen} onClose={() => setAuditLogOpen(false)} />
    </SidebarLayout>
  );
}
