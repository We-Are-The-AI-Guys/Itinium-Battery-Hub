import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, MapPin, CalendarDays, Package, Scale, FileText, MessageSquareWarning, Battery } from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { JobDocumentsPanel } from "@/components/job-documents";
import { JobRequestsPanel } from "@/components/job-requests-panel";
import { CustomerJobExport } from "@/components/customer-job-export";
import { StatusPill, SkeletonRows, ErrorState, Panel } from "@/components/v16-ui";
import { api, fmtDate, fmtTonnes, type SafeJob } from "@/lib/v16-api";

interface SafeBattery {
  id: number;
  palletNumber?: string | null;
  assetNumber?: string | null;
  batterySerial?: string | null;
  manufacture?: string | null;
  cellType?: string | null;
  voltage?: string | number | null;
  looseCellsQty?: number | null;
  isLooseCells?: boolean | null;
  notes?: string | null;
}

interface DetailResponse {
  job: SafeJob & { notes?: string | null; collectionNotes?: string | null; submittedByName?: string | null };
  batteries?: SafeBattery[];
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-[#0f2744]">{value}</p>
      </div>
    </div>
  );
}

export default function CustomerJobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api<DetailResponse>(`/api/jobs/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this job.");
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) load();
  }, [id, load]);

  const job = data?.job;
  const batteries = data?.batteries || [];
  const completed = job?.status === "completed";

  return (
    <SidebarLayout title={job ? job.reference : "Job"} subtitle="Read-only collection record">
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#0f2744] mb-5">
        <ArrowLeft className="w-4 h-4" /> All jobs
      </Link>
      {error ? (
        <div className="bg-white rounded-xl border border-slate-200"><ErrorState message={error} onRetry={load} /></div>
      ) : !job ? (
        <div className="bg-white rounded-xl border border-slate-200"><SkeletonRows rows={6} /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-[#0ea5e9] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Job reference</p>
                  <h3 className="text-2xl font-bold text-[#0f2744]">{job.reference}</h3>
                </div>
                <StatusPill status={job.status} />
                <CustomerJobExport jobId={job.id} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Fact icon={<MapPin className="w-4 h-4 text-[#0ea5e9]" />} label="Location" value={job.depot || "—"} />
                <Fact icon={<CalendarDays className="w-4 h-4 text-[#0ea5e9]" />} label="Collection date" value={fmtDate(job.collectionDate)} />
                <Fact icon={<Scale className="w-4 h-4 text-[#0ea5e9]" />} label="Total load" value={fmtTonnes(job.tonnage)} />
                <Fact icon={<Package className="w-4 h-4 text-[#0ea5e9]" />} label="Pallets" value={job.palletCount ?? "—"} />
              </div>
              <p className="text-xs text-slate-400 mt-5">Submitted {fmtDate(job.submittedAt, true)}{job.submittedByName ? ` by ${job.submittedByName}` : ""}. Official changes are made by Itinium only.</p>
            </section>

            <Panel title={`Batteries (${batteries.length})`} icon={<Battery className="w-4 h-4 text-[#0ea5e9]" />}>
              {batteries.length === 0 ? (
                <p className="text-sm text-slate-500">No battery lines recorded.</p>
              ) : (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-200">
                      <tr>
                        <th className="px-6 py-2.5 font-semibold">Manufacturer</th>
                        <th className="px-6 py-2.5 font-semibold">Cell type</th>
                        <th className="px-6 py-2.5 font-semibold">Asset / serial</th>
                        <th className="px-6 py-2.5 font-semibold">Voltage</th>
                        <th className="px-6 py-2.5 font-semibold">Loose cells</th>
                        <th className="px-6 py-2.5 font-semibold">Pallet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batteries.map((b) => (
                        <tr key={b.id}>
                          <td className="px-6 py-2.5 text-[#0f2744] font-medium">{b.manufacture || "—"}</td>
                          <td className="px-6 py-2.5 text-slate-600">{b.cellType || "—"}</td>
                          <td className="px-6 py-2.5 text-slate-600">{[b.assetNumber, b.batterySerial].filter(Boolean).join(" / ") || "—"}</td>
                          <td className="px-6 py-2.5 text-slate-600">{b.voltage != null && b.voltage !== "" ? `${b.voltage}V` : "—"}</td>
                          <td className="px-6 py-2.5 text-slate-600 tabular-nums">{b.isLooseCells ? b.looseCellsQty ?? "Yes" : "—"}</td>
                          <td className="px-6 py-2.5 text-slate-600">{b.palletNumber || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Requests to Itinium" icon={<MessageSquareWarning className="w-4 h-4 text-[#0ea5e9]" />}>
              <JobRequestsPanel jobId={job.id} variant="customer" jobStatus={job.status} />
            </Panel>
            <Panel title="Signed documents" icon={<FileText className="w-4 h-4 text-[#0ea5e9]" />}>
              {completed ? (
                <JobDocumentsPanel jobId={job.id} mode="customer" />
              ) : (
                <p className="text-sm text-slate-500">The signed collection sheet and consignment note become available here once the job is completed.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
