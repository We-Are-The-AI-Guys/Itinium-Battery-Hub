import { useCallback, useEffect, useState } from "react";
import { JobDocumentDownloads } from "@/components/job-document-downloads";
import { Link, useLocation } from "wouter";
import { Plus, Search, FileCheck2, ChevronLeft, ChevronRight } from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/v16-ui";
import { api, fmtDate, fmtTonnes, type SafeJob } from "@/lib/v16-api";

const FILTERS = [
  { key: "", label: "All" },
  { key: "request", label: "Requested" },
  { key: "confirmed", label: "Confirmed" },
  { key: "received", label: "Received" },
  { key: "completed", label: "Completed" },
];
const PAGE = 15;

export default function CustomerJobsPage() {
  const [, setLocation] = useLocation();
  const [jobs, setJobs] = useState<SafeJob[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setJobs(null);
    setError("");
    const params = new URLSearchParams({ limit: String(PAGE), offset: String((page - 1) * PAGE) });
    if (filter) params.set("status", filter);
    if (search.trim()) params.set("search", search.trim());
    try {
      const data = await api<{ jobs: SafeJob[]; pagination?: { total: number }; total?: number }>(`/api/jobs?${params}`);
      setJobs(data.jobs || []);
      setTotal(data.pagination?.total ?? data.total ?? (data.jobs || []).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs.");
    }
  }, [filter, page, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <SidebarLayout
      title="Jobs"
      subtitle="Collections for your authorised locations"
      headerActions={
        <Link href="/collection/new" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0ea5e9] hover:bg-[#0284c7] text-white text-sm font-medium rounded-md transition-colors">
          <Plus className="w-4 h-4" /> New Collection
        </Link>
      }
    >
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="flex bg-slate-100 p-1 rounded-lg w-fit overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setPage(1); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${filter === f.key ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search reference or site" className="pl-9 w-full md:w-[260px] bg-slate-50" />
          </div>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : jobs === null ? (
          <SkeletonRows />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No jobs to show"
            body={filter || search ? "Nothing matches these filters." : "When you submit a collection it will appear here."}
            action={<Link href="/collection/new" className="mt-2 text-sm font-medium text-[#0ea5e9] hover:underline">Book a collection</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Reference</th>
                  <th className="px-6 py-3 font-semibold">Location</th>
                  <th className="px-6 py-3 font-semibold">Submitted</th>
                  <th className="px-6 py-3 font-semibold">Collection</th>
                  <th className="px-6 py-3 font-semibold">Tonnage</th>
                  <th className="px-6 py-3 font-semibold">Pallets</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setLocation(`/jobs/${j.id}`)} data-testid={`row-job-${j.id}`}>
                    <td className="px-6 py-3 font-semibold text-[#0f2744]">{j.reference}</td>
                    <td className="px-6 py-3 text-slate-600">{j.depot || "—"}</td>
                    <td className="px-6 py-3 text-slate-600">{fmtDate(j.submittedAt)}</td>
                    <td className="px-6 py-3 text-slate-600">{fmtDate(j.collectionDate)}</td>
                    <td className="px-6 py-3 text-slate-600 tabular-nums">{fmtTonnes(j.tonnage)}</td>
                    <td className="px-6 py-3 text-slate-600 tabular-nums">{j.palletCount ?? "—"}</td>
                    <td className="px-6 py-3"><StatusPill status={j.status} /></td>
                    <td className="px-6 py-3 text-slate-500">
                      {["invoice", "completed"].includes(j.status) ? (
                        <JobDocumentDownloads jobId={j.id} reference={j.reference} available={j.signedDocumentTypes ?? []} releasePending={!["invoice", "invoiced", "completed"].includes(j.status)} />
                      ) : <span className="text-xs">Available on confirmation of receipt</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {jobs && jobs.length > 0 && pages > 1 && (
          <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Page {page} of {pages} · {total} jobs</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
