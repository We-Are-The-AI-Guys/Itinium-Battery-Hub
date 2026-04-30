import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  DollarSign,
  ArrowLeftRight,
  RefreshCw,
  Receipt,
  Search,
  FileDown,
  FileSpreadsheet,
  FileText,
  BarChart3,
  Info,
  Clock,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";

interface LmePrice {
  id: number;
  priceDate: string;
  usdPrice: string;
  exchangeRate: string;
  gbpPrice: string;
  source: string;
  createdAt: string;
}

interface Job {
  id: number;
  reference: string;
  clientName: string;
  tonnage: string;
  lmeRateUsed: string | null;
  calculatedValue: string | null;
  invoiceStatus: string | null;
}

const invoiceStatusStyles: Record<string, string> = {
  pending_invoice: "bg-amber-100 text-amber-800 border-amber-200",
  invoiced: "bg-teal-100 text-teal-800 border-teal-200",
  paid: "bg-green-100 text-green-800 border-green-200",
};

const invoiceStatusLabels: Record<string, string> = {
  pending_invoice: "Pending Invoice",
  invoiced: "Invoiced",
  paid: "Paid",
};

const FILTERS = ["All", "Pending Invoice", "Invoiced", "Paid"];
const filterToStatus: Record<string, string | undefined> = {
  All: undefined,
  "Pending Invoice": "pending_invoice",
  Invoiced: "invoiced",
  Paid: "paid",
};

const API_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function downloadFromApi(url: string, fallbackFilename: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.message) message = err.message;
    } catch {}
    throw new Error(message);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match ? match[1] : fallbackFilename;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function LmePricingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [currentPrice, setCurrentPrice] = useState<LmePrice | null>(null);
  const [usdPrice, setUsdPrice] = useState("2185.50");
  const [exchangeRate, setExchangeRate] = useState("0.7892");
  const [updating, setUpdating] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsPage, setJobsPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const JOBS_PER_PAGE = 8;

  const [history, setHistory] = useState<LmePrice[]>([]);

  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [downloadingJobId, setDownloadingJobId] = useState<number | null>(null);
  const [pdfMonth, setPdfMonth] = useState(currentMonthValue());

  const calculatedGbp = (parseFloat(usdPrice.replace(/,/g, "")) * parseFloat(exchangeRate)).toFixed(2);

  const applyCurrentPrice = useCallback((price: LmePrice | null) => {
    if (!price) return;
    setCurrentPrice(price);
    setUsdPrice(price.usdPrice);
    setExchangeRate(price.exchangeRate);
  }, []);

  const fetchCurrentPrice = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lme/current`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        applyCurrentPrice(data.price || null);
      }
    } catch {}
  }, [applyCurrentPrice]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lme/history?limit=10`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch {}
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(JOBS_PER_PAGE),
        offset: String((jobsPage - 1) * JOBS_PER_PAGE),
      });
      const invoiceStatus = filterToStatus[activeFilter];
      if (invoiceStatus) params.set("invoiceStatus", invoiceStatus);
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`${API_BASE}/api/jobs?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
        setJobsTotal(data.total);
      }
    } catch {}
  }, [jobsPage, activeFilter, searchQuery]);

  useEffect(() => {
    fetchCurrentPrice();
    fetchHistory();
  }, [fetchCurrentPrice, fetchHistory]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function handleUpdatePrice() {
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/api/lme/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ usdPrice: usdPrice.replace(/,/g, ""), exchangeRate }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        applyCurrentPrice(data.price);
        const count = Number(data.backfilledBatteries) || 0;
        toast({
          title: "LME price saved",
          description: `${count} battery row${count === 1 ? "" : "s"} recalculated.`,
        });
        fetchHistory();
        fetchJobs();
      } else {
        toast({
          title: "Failed to save LME price",
          description: data.message || "Please try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Network error", description: "Could not save LME price.", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  }

  async function handleRevertToLastSaved() {
    try {
      const res = await fetch(`${API_BASE}/api/lme/current`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.price) {
        applyCurrentPrice(data.price);
        toast({ title: "Reverted", description: "Inputs restored to the last saved price." });
      } else {
        toast({ title: "No saved price", description: "There is no saved price yet.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not load last saved price.", variant: "destructive" });
    }
  }

  async function handleDownloadXlsx() {
    setDownloadingXlsx(true);
    try {
      const params = new URLSearchParams();
      const invoiceStatus = filterToStatus[activeFilter];
      if (invoiceStatus) params.set("invoiceStatus", invoiceStatus);
      if (searchQuery) params.set("search", searchQuery);
      const qs = params.toString();
      await downloadFromApi(`${API_BASE}/api/jobs/export.xlsx${qs ? `?${qs}` : ""}`, "jobs.xlsx");
    } catch (e) {
      toast({ title: "Excel export failed", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setDownloadingXlsx(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const month = pdfMonth || currentMonthValue();
      await downloadFromApi(`${API_BASE}/api/jobs/invoice-summary.pdf?month=${encodeURIComponent(month)}`, `invoice-summary-${month}.pdf`);
    } catch (e) {
      toast({ title: "PDF export failed", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadCsv() {
    setDownloadingCsv(true);
    try {
      await downloadFromApi(`${API_BASE}/api/lme/history.csv`, "lme-price-history.csv");
    } catch (e) {
      toast({ title: "CSV export failed", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setDownloadingCsv(false);
    }
  }

  async function handleDownloadJobInvoice(job: Job) {
    setDownloadingJobId(job.id);
    try {
      await downloadFromApi(
        `${API_BASE}/api/jobs/${job.id}/invoice.pdf`,
        `invoice-${job.reference.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`
      );
    } catch (e) {
      toast({
        title: "Invoice download failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingJobId(null);
    }
  }

  const totalPages = Math.ceil(jobsTotal / JOBS_PER_PAGE);

  function formatCurrency(value: string | null) {
    if (!value) return "—";
    return `£${parseFloat(value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
  }

  function formatTonnage(value: string) {
    return `${parseFloat(value).toFixed(1)}t`;
  }

  function formatHistoryDate(d: string) {
    return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <SidebarLayout
      title="LME Pricing & Accounts"
      subtitle="Manage pricing data and invoice calculations"
    >
      <div className="space-y-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 border-l-4 border-l-[#0ea5e9]">
            <TrendingUp className="w-5 h-5 text-[#0ea5e9]" />
            <h3 className="text-lg font-bold text-[#0f2744]">LME Lead Price — Manual Fallback</h3>
          </div>
          <div className="p-6">
            <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 mb-6 flex items-start gap-3">
              <Info className="w-5 h-5 text-sky-500 mt-0.5 shrink-0" />
              <p className="text-sm text-sky-800">
                Enter the latest LME lead price and FX rate manually. The values you save here are used for invoice calculations until they are updated.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Monthly Average LME Lead Price (USD)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={usdPrice}
                    onChange={(e) => setUsdPrice(e.target.value)}
                    className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">GBP/USD Exchange Rate</label>
                <div className="relative">
                  <ArrowLeftRight className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-slate-500">Calculated GBP Price per Tonne:</span>
                  <span className="text-lg font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-md border border-teal-100">
                    £{parseFloat(calculatedGbp).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last Updated: {currentPrice ? new Date(currentPrice.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "No data yet"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-transparent"
                onClick={handleUpdatePrice}
                disabled={updating}
              >
                {updating ? "Updating..." : "Update Prices"}
              </Button>
              <Button variant="outline" className="text-slate-600 border-slate-200 hover:bg-slate-50" onClick={handleRevertToLastSaved}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Revert to Last Saved
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 border-l-4 border-l-[#0ea5e9]">
            <div className="flex items-center gap-3">
              <Receipt className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="text-lg font-bold text-[#0f2744]">Job Value Calculations</h3>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setActiveFilter(filter); setJobsPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                    activeFilter === filter
                      ? "bg-[#0f2744] text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setJobsPage(1); }}
                className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Job No</th>
                  <th className="px-6 py-4 font-semibold">Client Name</th>
                  <th className="px-6 py-4 font-semibold">Tonnage</th>
                  <th className="px-6 py-4 font-semibold">LME Rate Used</th>
                  <th className="px-6 py-4 font-semibold">Calculated Value (£)</th>
                  <th className="px-6 py-4 font-semibold">Invoice Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job, index) => (
                  <tr
                    key={job.id}
                    className={`hover:bg-slate-50/80 transition-colors group ${index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                  >
                    <td className="px-6 py-4 font-medium text-[#0f2744]">{job.reference}</td>
                    <td className="px-6 py-4 text-slate-700">{job.clientName}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">{formatTonnage(job.tonnage)}</td>
                    <td className="px-6 py-4 text-slate-600">{formatCurrency(job.lmeRateUsed)}</td>
                    <td className="px-6 py-4 font-medium text-teal-700">{formatCurrency(job.calculatedValue)}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className={`font-medium ${invoiceStatusStyles[job.invoiceStatus || ""] || ""}`}
                      >
                        {invoiceStatusLabels[job.invoiceStatus || ""] || job.invoiceStatus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {job.invoiceStatus === "pending_invoice" ? (
                        <Button
                          size="sm"
                          className="h-8 bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                          onClick={() => handleDownloadJobInvoice(job)}
                          disabled={downloadingJobId === job.id}
                        >
                          <FileDown className="w-3.5 h-3.5 mr-1.5" />
                          {downloadingJobId === job.id ? "Preparing…" : "Generate Invoice"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[#0ea5e9] border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-white transition-colors"
                          onClick={() => handleDownloadJobInvoice(job)}
                          disabled={downloadingJobId === job.id}
                        >
                          <FileDown className="w-3.5 h-3.5 mr-1.5" />
                          {downloadingJobId === job.id ? "Preparing…" : "Download Invoice"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No jobs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-900">{jobs.length > 0 ? (jobsPage - 1) * JOBS_PER_PAGE + 1 : 0}-{Math.min(jobsPage * JOBS_PER_PAGE, jobsTotal)}</span> of <span className="font-medium text-slate-900">{jobsTotal}</span> results
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 disabled:opacity-50"
                disabled={jobsPage <= 1}
                onClick={() => setJobsPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  className={`h-8 w-8 ${
                    p === jobsPage
                      ? "bg-[#0f2744] text-white border-transparent hover:bg-[#1e3a5f] hover:text-white"
                      : "text-slate-600"
                  }`}
                  onClick={() => setJobsPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 disabled:opacity-50"
                disabled={jobsPage >= totalPages}
                onClick={() => setJobsPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 border-l-4 border-l-[#0ea5e9]">
            <History className="w-5 h-5 text-[#0ea5e9]" />
            <h3 className="text-lg font-bold text-[#0f2744]">LME Price History</h3>
            <span className="text-sm text-slate-500">Most recent saved prices</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">USD</th>
                  <th className="px-6 py-3 font-semibold">FX</th>
                  <th className="px-6 py-3 font-semibold">GBP</th>
                  <th className="px-6 py-3 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h, i) => (
                  <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}>
                    <td className="px-6 py-3 font-medium text-[#0f2744]">{formatHistoryDate(h.priceDate)}</td>
                    <td className="px-6 py-3 text-slate-700">${parseFloat(h.usdPrice).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-3 text-slate-600">{parseFloat(h.exchangeRate).toFixed(4)}</td>
                    <td className="px-6 py-3 font-medium text-teal-700">£{parseFloat(h.gbpPrice).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-3">
                      <Badge variant="outline" className="font-medium bg-slate-50 text-slate-600 border-slate-200 capitalize">
                        {h.source}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      No saved LME prices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 border-l-4 border-l-[#0ea5e9]">
            <FileDown className="w-5 h-5 text-[#0ea5e9]" />
            <h3 className="text-lg font-bold text-[#0f2744]">Export & Reports</h3>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-slate-200 rounded-xl p-6 flex flex-col text-center hover:shadow-md transition-shadow bg-white">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="font-bold text-[#0f2744] mb-2">Accounts Excel File</h4>
              <p className="text-sm text-slate-500 mb-6 flex-1">
                Full job listing with calculated values for client invoicing. Uses the filters selected above.
              </p>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white border-transparent shadow-sm"
                onClick={handleDownloadXlsx}
                disabled={downloadingXlsx}
              >
                {downloadingXlsx ? "Preparing..." : "Download .xlsx"}
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl p-6 flex flex-col text-center hover:shadow-md transition-shadow bg-white">
              <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-teal-600" />
              </div>
              <h4 className="font-bold text-[#0f2744] mb-2">Invoice Summary PDF</h4>
              <p className="text-sm text-slate-500 mb-4 flex-1">
                Monthly invoice summary report grouped by client.
              </p>
              <div className="mb-3">
                <Input
                  type="month"
                  value={pdfMonth}
                  onChange={(e) => setPdfMonth(e.target.value)}
                  className="text-sm bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                />
              </div>
              <Button
                className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-transparent shadow-sm"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf ? "Preparing..." : "Download .pdf"}
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl p-6 flex flex-col text-center hover:shadow-md transition-shadow bg-white">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-6 h-6 text-slate-600" />
              </div>
              <h4 className="font-bold text-[#0f2744] mb-2">LME Price History</h4>
              <p className="text-sm text-slate-500 mb-6 flex-1">
                Historical LME pricing data and exchange rates.
              </p>
              <Button
                className="w-full bg-[#0f2744] hover:bg-[#1e3a5f] text-white border-transparent shadow-sm"
                onClick={handleDownloadCsv}
                disabled={downloadingCsv}
              >
                {downloadingCsv ? "Preparing..." : "Download .csv"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
