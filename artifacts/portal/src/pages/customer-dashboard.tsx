import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Clock, Scale, Package, PoundSterling, TrendingUp, ChevronRight, Plus, FileText, Trash2 } from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { useAuth } from "@/contexts/auth-context";
import { canSeeInvoiceTotal, hasRole } from "@/lib/roles";
import { JobDocumentDownloads } from "@/components/job-document-downloads";
import { StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/v16-ui";
import { api, fmtDate, fmtGBP, type SafeJob } from "@/lib/v16-api";
import { formatGrossWeightKg } from "@/lib/gross-weight";

interface CustomerStats {
  pendingJobs?: number;
  pendingThisWeek?: number;
  monthlyTonnage?: number;
  totalInvoiceValue?: number;
}
interface JobDraft { id: number; depot: string; collectionPoint: string | null; batteryCount: number; updatedAt: string; savedByName: string | null }

export default function CustomerDashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [stillages, setStillages] = useState<number | null>(null);
  const [jobs, setJobs] = useState<SafeJob[] | null>(null);
  const [jobsError, setJobsError] = useState("");
  const [drafts, setDrafts] = useState<JobDraft[]>([]);
  const showInvoice = canSeeInvoiceTotal(user);
  const [tab, setTab] = useState<"operational" | "financial">("operational");
  const scoped = !hasRole(user, "lead_client", "accounts");
  const noLocations = scoped && !(user?.permittedLocationIds?.length);

  const loadJobs = useCallback(async () => {
    setJobsError("");
    setJobs(null);
    try {
      const d = await api<{ jobs: SafeJob[] }>("/api/jobs?limit=8&offset=0");
      setJobs(d.jobs || []);
    } catch (e) {
      setJobsError(e instanceof Error ? e.message : "Could not load jobs.");
    }
  }, []);

  useEffect(() => {
    api<CustomerStats>("/api/dashboard/stats").then(setStats).catch(() => setStats({}));
    api<{ scopedTotalInCirculation: number }>("/api/stillages/summary").then((d) => setStillages(d.scopedTotalInCirculation)).catch(() => {});
    api<{ drafts: JobDraft[] }>("/api/job-drafts").then((d) => setDrafts(d.drafts || [])).catch(() => {});
    loadJobs();
  }, [loadJobs]);

  async function deleteDraft(id: number) {
    try {
      await api(`/api/job-drafts/${id}`, { method: "DELETE" });
      setDrafts((p) => p.filter((d) => d.id !== id));
    } catch { /* keep draft visible */ }
  }

  const tonnageTarget = 100;
  const tonnage = stats?.monthlyTonnage;
  const tonnagePercent = tonnage != null ? Math.round((tonnage / tonnageTarget) * 100) : 0;

  return (
    <SidebarLayout title="Dashboard" subtitle={user?.clientName ? `Overview for ${user.clientName}` : "Overview of your collections"}>
      {noLocations && <p role="alert" className="mb-6 rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">Your account has no permitted locations. Ask your administrator to assign the sites you need. No depot jobs are available until then.</p>}

      {showInvoice && <div role="tablist" aria-label="Dashboard view" className="flex gap-3 mb-5">
        {(["operational", "financial"] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
          className={`px-4 py-2 rounded-md border ${tab === value ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}>{value === "operational" ? "Operational" : "Financial"}</button>)}
      </div>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        {tab === "operational" && <>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500 p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Pending Jobs</p>
              <h3 className="text-3xl font-bold text-[#0f2744]">{stats ? stats.pendingJobs ?? "—" : "..."}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-500" /></div>
          </div>
          <div className="flex items-center text-sm">
            <TrendingUp className="w-4 h-4 text-amber-600 mr-1" />
            <span className="text-amber-600 font-medium">+{stats?.pendingThisWeek ?? 0} this week</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-teal-500 p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Net Weight (Monthly)</p>
              <h3 className="text-3xl font-bold text-[#0f2744]">{stats ? (tonnage != null ? `${tonnage.toFixed(3)}t` : "—") : "..."}</h3>
              <p className="text-xs text-slate-500">Estimated until receipt review is complete, then confirmed. Unavailable weights excluded.</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center"><Scale className="w-5 h-5 text-teal-500" /></div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">of {tonnageTarget}t target</span>
              <span className="text-teal-600 font-bold">{tonnagePercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, tonnagePercent)}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-sky-500 p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Stillages in Circulation</p>
              <h3 className="text-3xl font-bold text-[#0f2744]">{stillages ?? "..."}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center"><Package className="w-5 h-5 text-sky-500" /></div>
          </div>
          <Link href="/stillages" className="text-sm text-sky-600 font-medium hover:underline">View stillages</Link>
        </div>

        </>}
        {showInvoice && tab === "financial" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-green-500 p-5 hover:shadow-md transition-shadow" data-testid="card-total-invoice-value">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Total Invoice Value</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">{stats ? fmtGBP(stats.totalInvoiceValue ?? null) : "..."}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><PoundSterling className="w-5 h-5 text-green-500" /></div>
            </div>
            <p className="text-xs text-slate-500">Financial summary</p>
          </div>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-8">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#0ea5e9]" />
            <h3 className="font-bold text-[#0f2744]">Saved drafts</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => (
              <li key={d.id} className="px-6 py-3 flex items-center justify-between gap-3 text-sm">
                <button className="text-left flex-1" onClick={() => setLocation(`/collection/new?draft=${d.id}`)}>
                  <span className="font-medium text-[#0f2744]">{d.depot}{d.collectionPoint ? ` · ${d.collectionPoint}` : ""}</span>
                  <span className="block text-xs text-slate-500">{d.batteryCount} batteries · updated {fmtDate(d.updatedAt, true)}{d.savedByName ? ` by ${d.savedByName}` : ""}</span>
                </button>
                <button aria-label="Delete draft" onClick={() => deleteDraft(d.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-[#0f2744]">Recent jobs</h3>
          <Link href="/jobs" className="text-sm font-medium text-[#0ea5e9] hover:underline inline-flex items-center">View all <ChevronRight className="w-4 h-4" /></Link>
        </div>
        {jobsError ? <ErrorState message={jobsError} onRetry={loadJobs} /> : jobs === null ? <SkeletonRows /> : jobs.length === 0 ? (
          <EmptyState title="No jobs yet" body="Book your first collection and it will appear here." action={<Link href="/collection/new" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#0ea5e9] hover:underline"><Plus className="w-4 h-4" />New collection</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Job ID</th>
                  <th className="px-6 py-3 font-semibold">Depot</th>
                  <th className="px-6 py-3 font-semibold">Date Submitted</th>
                  <th className="px-6 py-3 font-semibold">Pb(Kg)</th>
                  <th className="px-6 py-3 font-semibold">Pallets</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setLocation(`/jobs/${j.id}`)}>
                    <td className="px-6 py-3 font-semibold text-[#0f2744]">{j.reference}</td>
                    <td className="px-6 py-3 text-slate-600">{j.depot || "—"}</td>
                    <td className="px-6 py-3 text-slate-600">{fmtDate(j.submittedAt)}</td>
                    <td className="px-6 py-3 text-slate-600 tabular-nums">
                      {formatGrossWeightKg(j.tonnage)}
                    </td>
                    <td className="px-6 py-3 text-slate-600 tabular-nums">{j.palletCount ?? "—"}</td>
                    <td className="px-6 py-3"><StatusPill status={j.status} /></td>
                    <td className="px-6 py-3"><JobDocumentDownloads jobId={j.id} reference={j.reference} available={j.signedDocumentTypes ?? []} releasePending={!["invoice", "invoiced", "completed"].includes(j.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
