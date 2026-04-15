import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  AlertCircle,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarLayout } from "@/components/sidebar-layout";

interface Job {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionPoint: string | null;
  collectionDate: string | null;
  submittedAt: string;
  tonnage: string;
  status: string;
  invoiceStatus: string;
  totalInvoiceValue: string | null;
  dueDate: string | null;
  datePaid: string | null;
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

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(job: Job): boolean {
  if (!job.dueDate || job.datePaid) return false;
  return new Date(job.dueDate) < new Date(new Date().toISOString().split("T")[0]);
}

function formatCurrency(value: string | null) {
  if (!value) return "—";
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(num);
}

interface CollectionPointOption {
  id: number;
  name: string;
  address: string;
}

export default function JobListPage() {
  const [, setLocation] = useLocation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [collectionPointFilter, setCollectionPointFilter] = useState("");
  const [collectionPointOptions, setCollectionPointOptions] = useState<CollectionPointOption[]>([]);
  const PAGE_SIZE = 10;

  useEffect(() => {
    fetch("/api/collection-points", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.collectionPoints) setCollectionPointOptions(data.collectionPoints);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter !== "All") params.set("status", activeFilter.toLowerCase());
    if (paymentFilter !== "all") params.set("paymentStatus", paymentFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (collectionPointFilter) params.set("collectionPoint", collectionPointFilter);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((currentPage - 1) * PAGE_SIZE));

    fetch(`/api/jobs?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setJobs(data.jobs);
          setPagination(data.pagination);
        }
      })
      .catch(() => {});
  }, [activeFilter, paymentFilter, currentPage, searchQuery, collectionPointFilter]);

  function handleFilterChange(filter: string) {
    setActiveFilter(filter);
    setCurrentPage(1);
  }

  return (
    <SidebarLayout title="Job Management" subtitle="Review and manage all collection jobs">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#0ea5e9]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0f2744]">All Jobs</h3>
                <p className="text-sm text-slate-500">
                  {pagination ? `${pagination.total} total jobs` : "Loading..."}
                </p>
              </div>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by reference or customer..."
                className="pl-9 h-10 bg-slate-50 border-slate-200 text-sm focus-visible:ring-[#0ea5e9]"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                data-testid="input-search-jobs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {["All", "Pending", "Approved", "Completed", "Flagged"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleFilterChange(filter)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      activeFilter === filter
                        ? "bg-white text-[#0f2744] shadow-sm"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    }`}
                    data-testid={`filter-${filter.toLowerCase()}`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Payment:</span>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {[
                  { value: "all", label: "All" },
                  { value: "overdue", label: "Overdue" },
                  { value: "upcoming", label: "Upcoming" },
                  { value: "paid", label: "Paid" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setPaymentFilter(opt.value); setCurrentPage(1); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      paymentFilter === opt.value
                        ? opt.value === "overdue" ? "bg-red-500 text-white shadow-sm" : "bg-white text-[#0f2744] shadow-sm"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    }`}
                    data-testid={`payment-filter-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {collectionPointOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <Select
                  value={collectionPointFilter}
                  onValueChange={(value) => {
                    setCollectionPointFilter(value === "all" ? "" : value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[220px] text-xs border-slate-200 bg-white" data-testid="filter-collection-point">
                    <SelectValue placeholder="All Collection Points" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Collection Points</SelectItem>
                    {collectionPointOptions.map((cp) => (
                      <SelectItem key={cp.id} value={cp.name}>
                        {cp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Job No.</th>
                <th className="px-6 py-3.5 font-semibold">Collection Date</th>
                <th className="px-6 py-3.5 font-semibold">Customer</th>
                <th className="px-6 py-3.5 font-semibold">Collection Point</th>
                <th className="px-6 py-3.5 font-semibold">Tonnage</th>
                <th className="px-6 py-3.5 font-semibold">Status</th>
                <th className="px-6 py-3.5 font-semibold">Total Value</th>
                <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job, index) => (
                <tr
                  key={job.id}
                  className={`hover:bg-sky-50/40 transition-colors cursor-pointer ${
                    isOverdue(job) ? "bg-red-50/40 border-l-2 border-l-red-400" : index % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                  }`}
                  onClick={() => setLocation(`/jobs/${job.id}`)}
                  data-testid={`job-row-${job.id}`}
                >
                  <td className="px-6 py-4 font-medium text-[#0ea5e9]">
                    <span className="flex items-center gap-1.5">
                      {job.reference}
                      {isOverdue(job) && (
                        <span title="Overdue">
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {formatDate(job.collectionDate || job.submittedAt)}
                  </td>
                  <td className="px-6 py-4 text-slate-700 font-medium">{job.clientName}</td>
                  <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate">
                    {job.collectionPoint || "—"}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700">
                    {parseFloat(job.tonnage).toFixed(3)}t
                  </td>
                  <td className="px-6 py-4">
                    <Badge
                      variant="outline"
                      className={`font-medium capitalize ${statusStyles[job.status] || ""}`}
                    >
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700">
                    {formatCurrency(job.totalInvoiceValue)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[#0ea5e9] border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-white transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/jobs/${job.id}`);
                      }}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
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
                {pagination.offset + 1}–
                {Math.min(pagination.offset + pagination.limit, pagination.total)}
              </span>{" "}
              of{" "}
              <span className="font-medium text-slate-900">{pagination.total}</span>{" "}
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
                disabled={currentPage >= (pagination?.totalPages || 1)}
                onClick={() => setCurrentPage((p) => Math.min(pagination?.totalPages || 1, p + 1))}
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
