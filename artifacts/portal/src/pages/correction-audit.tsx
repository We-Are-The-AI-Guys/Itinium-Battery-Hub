import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Download,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Zap,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AuditRow {
  id: number;
  jobReference: string;
  fieldName: string;
  originalValue: string | null;
  suggestedValue: string | null;
  wasAccepted: boolean;
  confidenceLevel: string | null;
  submittedByName: string | null;
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  manufacturer: "Manufacturer",
  cellModel: "Cell Model",
  voltage: "Voltage",
};

const CONFIDENCE_LABELS: Record<string, { label: string; className: string }> = {
  high: { label: "Auto-applied", className: "bg-sky-100 text-sky-700 border-sky-200" },
  low: { label: "User reviewed", className: "bg-amber-100 text-amber-700 border-amber-200" },
};

const PAGE_SIZE = 50;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-1 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${accent || "text-[#0f2744]"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function CorrectionAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fieldName, setFieldName] = useState("all");
  const [wasAccepted, setWasAccepted] = useState("all");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const acceptedCount = rows.filter((r) => r.wasAccepted).length;
  const rejectedCount = rows.filter((r) => !r.wasAccepted).length;
  const acceptanceRate = rows.length > 0 ? Math.round((acceptedCount / rows.length) * 100) : null;

  const fieldCounts: Record<string, number> = {};
  for (const r of rows) {
    fieldCounts[r.fieldName] = (fieldCounts[r.fieldName] || 0) + 1;
  }
  const topField = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (fieldName !== "all") params.set("fieldName", fieldName);
      if (wasAccepted !== "all") params.set("wasAccepted", wasAccepted);

      const res = await fetch(`/api/admin/correction-audit?${params}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, fieldName, wasAccepted]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setFieldName("all");
    setWasAccepted("all");
    setPage(0);
  }

  function exportCsv() {
    const headers = ["Date/Time", "Job Reference", "Field", "Original Value", "Suggested Value", "Confidence", "Outcome", "Submitted By"];
    const csvRows = rows.map((r) => [
      formatDate(r.createdAt),
      r.jobReference,
      FIELD_LABELS[r.fieldName] || r.fieldName,
      r.originalValue || "",
      r.suggestedValue || "",
      r.confidenceLevel === "high" ? "Auto-applied (High)" : r.confidenceLevel === "low" ? "User reviewed (Low)" : "",
      r.wasAccepted ? "Accepted" : "Rejected",
      r.submittedByName || "",
    ]);
    const csv = [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `correction-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasActiveFilters = dateFrom || dateTo || fieldName !== "all" || wasAccepted !== "all";

  return (
    <SidebarLayout
      title="AI Correction Audit"
      subtitle="Review how AI suggestions are being used across all collection submissions"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="border-slate-200 text-slate-600 hover:border-[#0ea5e9] hover:text-[#0ea5e9]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="border-slate-200 text-slate-600 hover:border-[#0ea5e9] hover:text-[#0ea5e9]"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Events"
            value={total.toLocaleString()}
            sub="correction suggestions logged"
          />
          <StatCard
            label="Acceptance Rate"
            value={acceptanceRate !== null ? `${acceptanceRate}%` : "—"}
            sub={`${acceptedCount} accepted on this page`}
            accent="text-emerald-600"
          />
          <StatCard
            label="Rejected / Overridden"
            value={rejectedCount}
            sub="user kept their original value"
            accent="text-amber-600"
          />
          <StatCard
            label="Most Flagged Field"
            value={topField ? (FIELD_LABELS[topField] || topField) : "—"}
            sub="highest correction volume"
            accent="text-[#0ea5e9]"
          />
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-[#0f2744]">Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="ml-auto text-xs text-[#0ea5e9] hover:text-[#0284c7] hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Date from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/40 focus:border-[#0ea5e9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Date to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/40 focus:border-[#0ea5e9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Field type</label>
              <select
                value={fieldName}
                onChange={(e) => { setFieldName(e.target.value); setPage(0); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/40 focus:border-[#0ea5e9]"
              >
                <option value="all">All fields</option>
                <option value="manufacturer">Manufacturer</option>
                <option value="cellModel">Cell Model</option>
                <option value="voltage">Voltage</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Outcome</label>
              <select
                value={wasAccepted}
                onChange={(e) => { setWasAccepted(e.target.value); setPage(0); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/40 focus:border-[#0ea5e9]"
              >
                <option value="all">All outcomes</option>
                <option value="true">Accepted</option>
                <option value="false">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-[#0f2744]">
                Correction Events
              </h3>
              {!loading && (
                <span className="text-xs text-slate-400 ml-1">
                  ({total.toLocaleString()} total)
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Page {page + 1} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-500">No correction events found</p>
              <p className="text-xs text-slate-400 mt-1">
                {hasActiveFilters ? "Try adjusting your filters" : "Events will appear here once jobs with AI-assisted corrections are submitted"}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="mt-3 text-xs text-[#0ea5e9] hover:text-[#0284c7] hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3 whitespace-nowrap">Date / Time</th>
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">Job Ref</th>
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Field</th>
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Original → Suggested</th>
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Confidence</th>
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Outcome</th>
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Submitted By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row) => {
                    const conf = row.confidenceLevel ? CONFIDENCE_LABELS[row.confidenceLevel] : null;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap font-mono">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-semibold text-[#0f2744] font-mono">
                            {row.jobReference}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-medium ${
                              row.fieldName === "manufacturer"
                                ? "border-violet-200 text-violet-700 bg-violet-50"
                                : row.fieldName === "cellModel"
                                ? "border-indigo-200 text-indigo-700 bg-indigo-50"
                                : "border-cyan-200 text-cyan-700 bg-cyan-50"
                            }`}
                          >
                            {FIELD_LABELS[row.fieldName] || row.fieldName}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-slate-500 truncate max-w-[100px]" title={row.originalValue || "—"}>
                              {row.originalValue || <em className="text-slate-300">—</em>}
                            </span>
                            <span className="text-slate-300 flex-shrink-0">→</span>
                            <span className="text-xs font-medium text-[#0f2744] truncate max-w-[110px]" title={row.suggestedValue || "—"}>
                              {row.suggestedValue || <em className="text-slate-300">—</em>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {conf ? (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${conf.className}`}>
                              {row.confidenceLevel === "high"
                                ? <Zap className="w-2.5 h-2.5" />
                                : <AlertTriangle className="w-2.5 h-2.5" />}
                              {conf.label}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {row.wasAccepted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                              <CheckCircle2 className="w-3 h-3" />
                              Accepted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                              <XCircle className="w-3 h-3" />
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {row.submittedByName || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} events
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
