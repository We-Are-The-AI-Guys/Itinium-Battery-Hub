import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Clock,
  Scale,
  Receipt,
  AlertTriangle,
  Eye,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  PoundSterling,
  Package,
  CalendarClock,
  FileText,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarLayout } from "@/components/sidebar-layout";
import { formatCustomerPbWeight } from "@/lib/customer-pb-weight";

interface DashboardStats {
  pendingJobs: number;
  flaggedExceptions: number;
  monthlyTonnage: number;
  totalInvoiceValue: number;
  pendingThisWeek: number;
  monthOnMonthChange: number;
  avgCblLmePercent: number;
  totalGrossProfit: number;
  completedInvoiceValue: number;
  avgDaysToPay: number;
  overdueInvoices: number;
}

interface Job {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  submittedAt: string;
  tonnage: string;
  customerTractionTonnage: string | null;
  customerBlocsTonnage: string | null;
  status: string;
  calculatedValue: string | null;
  invoiceStatus: string | null;
  grossProfit: string | null;
  palletCount: number;
}

interface Pagination {
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
}

const statusStyles: Record<string, string> = {
  request: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-teal-100 text-teal-800 border-teal-200",
  received: "bg-blue-100 text-blue-800 border-blue-200",
  invoice: "bg-violet-100 text-violet-800 border-violet-200",
  awaiting_invoice: "bg-orange-100 text-orange-800 border-orange-200",
  completed: "bg-green-100 text-green-800 border-green-200",
};

const statusLabels: Record<string, string> = {
  request: "Request",
  confirmed: "Confirmed",
  received: "Received",
  invoice: "Invoice",
  awaiting_invoice: "Awaiting Invoice",
  completed: "Completed",
};

const invoiceStatusStyles: Record<string, string> = {
  pending_invoice: "bg-slate-100 text-slate-700 border-slate-200",
  invoiced: "bg-blue-100 text-blue-800 border-blue-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const invoiceStatusLabels: Record<string, string> = {
  pending_invoice: "Pending",
  invoiced: "Invoiced",
  paid: "Paid",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

interface JobDraft {
  id: number;
  depot: string;
  collectionPoint: string | null;
  batteryCount: number;
  updatedAt: string;
  savedByName: string | null;
}

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminDashboardPage() {
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalStillages, setTotalStillages] = useState<number | null>(null);
  const [dashboardTab, setDashboardTab] = useState<"operational" | "financial">("operational");
  const [drafts, setDrafts] = useState<JobDraft[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => {});

    fetch("/api/stillages/summary", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setTotalStillages(data.totalInCirculation);
      })
      .catch(() => {});

    fetch("/api/job-drafts", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.drafts) setDrafts(data.drafts);
      })
      .catch(() => {});
  }, []);

  async function deleteDraft(id: number) {
    setDeletingDraftId(id);
    try {
      const res = await fetch(`/api/job-drafts/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingDraftId(null);
      setConfirmDeleteId(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter !== "All") params.set("status", activeFilter);
    params.set("limit", "8");
    params.set("offset", String((currentPage - 1) * 8));

    fetch(`/api/jobs?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setJobs(data.jobs);
          setPagination(data.pagination);
        }
      })
      .catch(() => {});
  }, [activeFilter, currentPage]);

  function handleFilterChange(filter: string) {
    setActiveFilter(filter);
    setCurrentPage(1);
  }

  const tonnageTarget = 100;
  const tonnagePercent = stats
    ? Math.round((stats.monthlyTonnage / tonnageTarget) * 100)
    : 0;

  const momChange = stats?.monthOnMonthChange ?? 0;
  const momPositive = momChange >= 0;

  return (
    <SidebarLayout
      title="Dashboard"
      subtitle="Overview of all operations"
      showSearch
    >
      <div className="flex bg-slate-100 p-1 rounded-lg mb-6 w-fit">
        {([
          { key: "operational", label: "Operational" },
          { key: "financial", label: "Financial" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setDashboardTab(tab.key)}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${
              dashboardTab === tab.key
                ? "bg-white text-[#0f2744] shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {dashboardTab === "operational" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Total Pending Jobs</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {stats?.pendingJobs ?? "..."}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-amber-600 mr-1" />
              <span className="text-amber-600 font-medium">
                +{stats?.pendingThisWeek ?? 0} this week
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-teal-500 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  Current Tonnage (Monthly)
                </p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {stats ? `${stats.monthlyTonnage.toFixed(1)}t` : "..."}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <Scale className="w-5 h-5 text-teal-500" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">
                  of {tonnageTarget}t target
                </span>
                <span className="text-teal-600 font-bold">{tonnagePercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, tonnagePercent)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-sky-500 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  Stillages In Circulation
                </p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {totalStillages !== null ? totalStillages : "..."}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-sky-500" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              <span className="text-sky-600 font-medium">
                Across all depots
              </span>
            </div>
          </div>
        </div>
      )}

      {dashboardTab === "financial" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-green-500 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  Total Invoice Value
                </p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {stats ? formatCurrency(stats.totalInvoiceValue) : "..."}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-green-500" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              {momPositive ? (
                <ArrowUpRight className="w-4 h-4 text-green-600 mr-1" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`font-medium ${momPositive ? "text-green-600" : "text-red-500"}`}>
                {momPositive ? "+" : ""}{momChange}% vs last month
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-violet-500 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  Avg CBL LME %
                </p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {stats ? `${stats.avgCblLmePercent.toFixed(1)}%` : "..."}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                <Percent className="w-5 h-5 text-violet-500" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              <span className="text-violet-600 font-medium">
                Across all priced jobs
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  Total Gross Profit
                </p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {stats ? formatCurrency(stats.totalGrossProfit) : "..."}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <PoundSterling className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              {stats && stats.completedInvoiceValue > 0 ? (
                <>
                  {(stats.totalGrossProfit / stats.completedInvoiceValue) * 100 >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  )}
                  <span className="text-emerald-600 font-medium">
                    {((stats.totalGrossProfit / stats.completedInvoiceValue) * 100).toFixed(1)}% margin
                  </span>
                </>
              ) : (
                <span className="text-slate-400 font-medium">No data yet</span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-sky-500 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  Avg Days to Pay
                </p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {stats ? (stats.avgDaysToPay > 0 ? `${stats.avgDaysToPay}` : "—") : "..."}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                <CalendarClock className="w-5 h-5 text-sky-500" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              {stats && stats.overdueInvoices > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-500 mr-1" />
                  <span className="text-red-600 font-medium">
                    {stats.overdueInvoices} overdue
                  </span>
                </>
              ) : (
                <span className="text-sky-600 font-medium">
                  All invoices on track
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-[#0f2744]">Recent Jobs</h3>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg flex-wrap">
              {[
                { value: "All", label: "All" },
                { value: "request", label: "Request" },
                { value: "confirmed", label: "Confirmed" },
                { value: "received", label: "Received" },
                { value: "invoice", label: "Invoice" },
                { value: "awaiting_invoice", label: "Awaiting Invoice" },
                { value: "completed", label: "Completed" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => handleFilterChange(filter.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activeFilter === filter.value
                      ? "bg-white text-[#0f2744] shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Job ID</th>
                <th className="px-6 py-4 font-semibold">Client Name</th>
                <th className="px-6 py-4 font-semibold">Depot</th>
                <th className="px-6 py-4 font-semibold">Date Submitted</th>
                <th className="px-6 py-4 font-semibold">
                  {dashboardTab === "financial" ? "Customer Pb weight (t)" : "Tonnage"}
                </th>
                {dashboardTab === "operational" ? (
                  <th className="px-6 py-4 font-semibold">Pallets</th>
                ) : (
                  <>
                    <th className="px-6 py-4 font-semibold">Value</th>
                    <th className="px-6 py-4 font-semibold">Gross Profit</th>
                  </>
                )}
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Invoice</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job, index) => (
                <tr
                  key={job.id}
                  className={`hover:bg-slate-50/80 transition-colors group ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                  }`}
                >
                  <td className="px-6 py-4 font-medium text-[#0f2744]">
                    {job.reference}
                  </td>
                  <td className="px-6 py-4 text-slate-700">{job.clientName}</td>
                  <td className="px-6 py-4 text-slate-600">{job.depot}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {formatDate(job.submittedAt)}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700">
                    {dashboardTab === "financial"
                      ? formatCustomerPbWeight(job.customerTractionTonnage, job.customerBlocsTonnage)
                      : `${parseFloat(job.tonnage).toFixed(1)}t`}
                  </td>
                  {dashboardTab === "operational" ? (
                    <td className="px-6 py-4 text-slate-700">{job.palletCount ?? "—"}</td>
                  ) : (
                    <>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {job.calculatedValue != null && job.calculatedValue !== "" ? formatCurrency(Number(job.calculatedValue)) : "—"}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {job.grossProfit != null && job.grossProfit !== "" ? formatCurrency(Number(job.grossProfit)) : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4">
                    <Badge
                      variant="outline"
                      className={`font-medium ${
                        statusStyles[job.status] || ""
                      }`}
                    >
                      {statusLabels[job.status] || job.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {job.invoiceStatus ? (
                      <Badge
                        variant="outline"
                        className={`font-medium text-xs ${
                          invoiceStatusStyles[job.invoiceStatus] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {invoiceStatusLabels[job.invoiceStatus] || job.invoiceStatus}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[#0ea5e9] border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-white transition-colors"
                      onClick={() => setLocation(`/jobs/${job.id}`)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td
                    colSpan={dashboardTab === "financial" ? 10 : 9}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    No jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm text-slate-500">
              Showing{" "}
              <span className="font-medium text-slate-900">
                {pagination.offset + 1}-
                {Math.min(pagination.offset + pagination.limit, pagination.total)}
              </span>{" "}
              of{" "}
              <span className="font-medium text-slate-900">
                {pagination.total}
              </span>{" "}
              results
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 disabled:opacity-50"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from(
                { length: Math.min(pagination.totalPages, 5) },
                (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant="outline"
                      size="sm"
                      className={`h-8 w-8 ${
                        currentPage === pageNum
                          ? "bg-[#0ea5e9] text-white border-transparent hover:bg-[#0284c7] hover:text-white"
                          : "text-slate-600"
                      }`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                }
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= pagination.totalPages}
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(pagination.totalPages, p + 1)
                  )
                }
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="mt-8" data-testid="section-drafts">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-[#1e293b]">Saved Drafts</h2>
            <span className="text-sm text-[#64748b] ml-1">({drafts.length})</span>
          </div>
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                data-testid={`draft-row-${draft.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#0f2744]">
                        {draft.collectionPoint || "Collection point not yet entered"}
                      </span>
                      {draft.depot && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {draft.depot}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#64748b] mt-0.5">
                      {draft.batteryCount} battery row{draft.batteryCount !== 1 ? "s" : ""}
                      {draft.savedByName && <> · By {draft.savedByName}</>}
                      {" · "}
                      Last saved {formatRelativeDate(draft.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {confirmDeleteId === draft.id ? (
                    <>
                      <span className="text-sm text-slate-500">Delete this draft?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteDraft(draft.id)}
                        disabled={deletingDraftId === draft.id}
                        data-testid={`button-confirm-delete-draft-${draft.id}`}
                      >
                        {deletingDraftId === draft.id ? "Deleting..." : "Yes, delete"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setConfirmDeleteId(draft.id)}
                        data-testid={`button-delete-draft-${draft.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#0f2744] hover:bg-[#132744] text-white"
                        onClick={() => setLocation(`/collection/new?draft=${draft.id}`)}
                        data-testid={`button-resume-draft-${draft.id}`}
                      >
                        <ChevronRight className="w-3.5 h-3.5 mr-1" />
                        Resume
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
