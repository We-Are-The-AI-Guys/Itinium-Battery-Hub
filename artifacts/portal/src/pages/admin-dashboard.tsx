import { useState, useEffect } from "react";
import {
  Clock,
  Scale,
  Receipt,
  AlertTriangle,
  Eye,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarLayout } from "@/components/sidebar-layout";

interface DashboardStats {
  pendingJobs: number;
  flaggedExceptions: number;
  monthlyTonnage: number;
  totalInvoiceValue: number;
  pendingThisWeek: number;
}

interface Job {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  submittedAt: string;
  tonnage: string;
  status: string;
}

interface Pagination {
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
}

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-teal-100 text-teal-800 border-teal-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  flagged: "bg-red-100 text-red-800 border-red-200",
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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetch("/api/dashboard/stats", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, []);

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

  return (
    <SidebarLayout
      title="Dashboard"
      subtitle="Overview of all operations"
      showSearch
    >
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
            <ArrowUpRight className="w-4 h-4 text-green-600 mr-1" />
            <span className="text-green-600 font-medium">
              +8.2% vs last month
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-red-500 p-5 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">
                Flagged Exceptions
              </p>
              <h3 className="text-3xl font-bold text-[#0f2744]">
                {stats?.flaggedExceptions ?? "..."}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <div className="flex items-center text-sm">
            <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
            <span className="text-red-600 font-medium">
              {stats?.flaggedExceptions
                ? `${Math.max(1, Math.floor(stats.flaggedExceptions / 2))} critical`
                : "..."}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-[#0f2744]">Recent Jobs</h3>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {["All", "Pending", "Approved", "Completed"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => handleFilterChange(filter)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activeFilter === filter
                      ? "bg-white text-[#0f2744] shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
                >
                  {filter}
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
                <th className="px-6 py-4 font-semibold">Tonnage</th>
                <th className="px-6 py-4 font-semibold">Status</th>
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
                    {parseFloat(job.tonnage).toFixed(1)}t
                  </td>
                  <td className="px-6 py-4">
                    <Badge
                      variant="outline"
                      className={`font-medium capitalize ${
                        statusStyles[job.status] || ""
                      }`}
                    >
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[#0ea5e9] border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-white transition-colors"
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
                    colSpan={7}
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
    </SidebarLayout>
  );
}
