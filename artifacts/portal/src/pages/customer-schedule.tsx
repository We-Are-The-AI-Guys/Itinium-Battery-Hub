import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { SkeletonRows, ErrorState, StatusPill } from "@/components/v16-ui";
import { api, fmtTonnes, STATUS_STYLES, type SafeJob } from "@/lib/v16-api";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CustomerSchedulePage() {
  const [, setLocation] = useLocation();
  const [jobs, setJobs] = useState<SafeJob[] | null>(null);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const load = useCallback(async () => {
    setError("");
    setJobs(null);
    try {
      const d = await api<{ jobs: SafeJob[] }>("/api/jobs/schedule");
      setJobs(d.jobs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load schedule.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m: Record<string, SafeJob[]> = {};
    for (const j of jobs || []) {
      if (!j.collectionDate) continue;
      const k = j.collectionDate.slice(0, 10);
      (m[k] ||= []).push(j);
    }
    return m;
  }, [jobs]);

  const first = cursor;
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const today = ymd(new Date());
  const monthJobs = (jobs || []).filter((j) => j.collectionDate && j.collectionDate.slice(0, 7) === ymd(first).slice(0, 7))
    .sort((a, b) => (a.collectionDate || "").localeCompare(b.collectionDate || ""));

  return (
    <SidebarLayout title="Schedule" subtitle="Planned collections for your locations">
      <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
        <Eye className="w-3.5 h-3.5" /> Read-only. Itinium manages collection dates.
      </div>
      {error ? (
        <div className="bg-white rounded-xl border border-slate-200"><ErrorState message={error} onRetry={load} /></div>
      ) : jobs === null ? (
        <div className="bg-white rounded-xl border border-slate-200"><SkeletonRows rows={7} /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-[#0f2744]">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" aria-label="Previous month" onClick={() => setCursor(new Date(first.getFullYear(), first.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" aria-label="Next month" onClick={() => setCursor(new Date(first.getFullYear(), first.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-xs font-semibold text-slate-400 uppercase border-b border-slate-100">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const key = d ? ymd(d) : `x${i}`;
                const list = d ? byDay[ymd(d)] || [] : [];
                return (
                  <div key={key} className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 ${d ? "" : "bg-slate-50/60"}`}>
                    {d && <p className={`text-xs mb-1 ${ymd(d) === today ? "font-bold text-[#0ea5e9]" : "text-slate-500"}`}>{d.getDate()}</p>}
                    <div className="space-y-1">
                      {list.slice(0, 3).map((j) => (
                        <button key={j.id} onClick={() => setLocation(`/jobs/${j.id}`)} className={`w-full truncate text-left text-[11px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[j.status] || "bg-slate-50"}`}>
                          {j.reference}
                        </button>
                      ))}
                      {list.length > 3 && <p className="text-[11px] text-slate-400">+{list.length - 3} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
            <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-[#0f2744]">This month ({monthJobs.length})</h3></div>
            {monthJobs.length === 0 ? <p className="p-5 text-sm text-slate-500">No collections scheduled this month.</p> : (
              <ul className="divide-y divide-slate-100">
                {monthJobs.map((j) => (
                  <li key={j.id}>
                    <button onClick={() => setLocation(`/jobs/${j.id}`)} className="w-full text-left px-5 py-3 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#0f2744]">{j.reference}</span>
                        <StatusPill status={j.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{j.collectionDate ? new Date(`${j.collectionDate.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""} · {j.depot || "—"} · {fmtTonnes(j.tonnage)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
