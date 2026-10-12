import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Scale, Layers } from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { useAuth } from "@/contexts/auth-context";
import { StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/v16-ui";
import { api, customerStatusLabel, fmtDate, fmtTonnes, STATUS_STYLES, type SafeJob } from "@/lib/v16-api";

interface Overview {
  jobs: SafeJob[];
  total: number;
  counts: Record<string, number>;
  totalTonnage: number | string | null;
}

const ORDER = ["request", "confirmed", "received", "invoice", "awaiting_invoice", "completed", "cancelled"];
const BAR: Record<string, string> = {
  request: "bg-amber-400", confirmed: "bg-teal-500", received: "bg-blue-500", invoice: "bg-violet-400",
  awaiting_invoice: "bg-orange-400", completed: "bg-green-500", cancelled: "bg-slate-300",
};

export default function OperationalOverviewPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setData(null);
    try {
      setData(await api<Overview>("/api/operational-overview"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the overview.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Merge "invoice"/"awaiting_invoice" into one customer-facing "Processing" stage.
  const stages: { key: string; label: string; count: number }[] = [];
  if (data) {
    for (const k of ORDER) {
      const c = data.counts?.[k] ?? 0;
      const label = customerStatusLabel(k);
      const existing = stages.find((s) => s.label === label);
      if (existing) existing.count += c;
      else stages.push({ key: k, label, count: c });
    }
    for (const [k, c] of Object.entries(data.counts || {})) {
      if (!ORDER.includes(k)) stages.push({ key: k, label: customerStatusLabel(k), count: c });
    }
  }
  const total = data?.total ?? 0;
  const done = data?.counts?.completed ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const noLocations = !(user?.permittedLocationIds?.length);

  return (
    <SidebarLayout
      title="Operational Overview"
      subtitle={user?.locationName ? `Collections at your sites · default ${user.locationName}` : "Collections at your sites"}
      headerActions={<Link href="/collection/new" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0ea5e9] hover:bg-[#0284c7] text-white text-sm font-medium rounded-md"><Plus className="w-4 h-4" /> New Collection</Link>}
    >
      {noLocations && <p role="alert" className="mb-6 rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">Your account has no permitted locations yet. Ask your administrator to assign your sites.</p>}
      {error ? (
        <div className="bg-white rounded-xl border border-slate-200"><ErrorState message={error} onRetry={load} /></div>
      ) : !data ? (
        <div className="bg-white rounded-xl border border-slate-200"><SkeletonRows rows={6} /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-[#0f2744] p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Jobs</p>
                  <h3 className="text-3xl font-bold text-[#0f2744]" data-testid="text-overview-total">{total}</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center"><Layers className="w-5 h-5 text-slate-600" /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-teal-500 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Tonnage</p>
                  <h3 className="text-3xl font-bold text-[#0f2744]" data-testid="text-overview-tonnage">{fmtTonnes(data.totalTonnage)}</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center"><Scale className="w-5 h-5 text-teal-500" /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-green-500 p-5">
              <p className="text-sm font-medium text-slate-500 mb-1">Progress</p>
              <h3 className="text-3xl font-bold text-[#0f2744]">{progress}%</h3>
              <div className="mt-3 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-2">{done} of {total} completed</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-[#0f2744] mb-4">Status</h3>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mb-5">
              {total > 0 && stages.filter((s) => s.count > 0).map((s) => (
                <div key={s.key} className={BAR[s.key] || "bg-slate-400"} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {stages.map((s) => (
                <div key={s.key} className={`rounded-lg border px-3 py-2.5 ${STATUS_STYLES[s.key] || "bg-slate-50 border-slate-200"}`}>
                  <p className="text-xs font-medium">{s.label}</p>
                  <p className="text-xl font-bold tabular-nums">{s.count}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-[#0f2744]">Jobs</h3></div>
            {data.jobs.length === 0 ? (
              <EmptyState title="No collections yet" body="Jobs at your sites will appear here once submitted." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Reference</th>
                      <th className="px-6 py-3 font-semibold">Location</th>
                      <th className="px-6 py-3 font-semibold">Submitted</th>
                      <th className="px-6 py-3 font-semibold">Tonnage</th>
                      <th className="px-6 py-3 font-semibold">Pallets</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.jobs.map((j) => (
                      <tr key={j.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setLocation(`/jobs/${j.id}`)}>
                        <td className="px-6 py-3 font-semibold text-[#0f2744]">{j.reference}</td>
                        <td className="px-6 py-3 text-slate-600">{j.depot || "—"}</td>
                        <td className="px-6 py-3 text-slate-600">{fmtDate(j.submittedAt)}</td>
                        <td className="px-6 py-3 text-slate-600 tabular-nums">{fmtTonnes(j.tonnage)}</td>
                        <td className="px-6 py-3 text-slate-600 tabular-nums">{j.palletCount ?? "—"}</td>
                        <td className="px-6 py-3"><StatusPill status={j.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
