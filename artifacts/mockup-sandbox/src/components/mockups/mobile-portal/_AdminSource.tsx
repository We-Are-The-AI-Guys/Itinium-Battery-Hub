// Actual portal Action Queue extracted for concept grounding. Router, API and downloads are isolated.
import "./_group.css";
import { useCallback, useEffect, useState } from "react";
import { Link, SidebarLayout } from "./_context";
import { Check, X, ExternalLink, Info, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
const useToast = () => ({toast: (_message: unknown) => {}});
import { SkeletonRows, ErrorState, EmptyState } from "./_ui";
import {
  api, DECISION_STYLES, EXCEPTION_OUTCOMES, REQUEST_KIND_LABELS, fmtDate, notificationLabel, type ActionRequest,
} from "./_adminApi";

const TABS = ["Pending", "Approved", "Rejected", "All"] as const;

const APPROVAL_EFFECT: Record<string, string> = {
  amendment: "Approving records the decision only. Apply the change yourself using the job's edit tools.",
  cancellation: "Approving will set the job status to Cancelled.",
  transport_exception: "Approving records the exception only. Job status is never changed automatically.",
};

interface Evidence { id: number; fileName: string; contentType: string; sizeBytes: number | null }

function EvidenceList({ requestId }: { requestId: number }) {
  const [items, setItems] = useState<Evidence[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ evidence: Evidence[] }>(`/api/action-requests/${requestId}/evidence`).then((d) => setItems(d.evidence || [])).catch((e) => setErr(e instanceof Error ? e.message : "Could not load evidence."));
  }, [requestId]);
  async function download(_ev: Evidence) {setErr("Evidence preview only — no download.");}
  if (err) return <p className="text-xs text-red-600 mt-2">{err}</p>;
  if (!items) return <p className="text-xs text-slate-400 mt-2">Loading evidence…</p>;
  if (items.length === 0) return <p className="text-xs text-slate-400 mt-2">No evidence attached.</p>;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {items.map((ev) => (
        <li key={ev.id}>
          <button onClick={() => download(ev)} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:border-[#0ea5e9] text-[#0f2744]" data-testid={`evidence-${ev.id}`}>
            <Download className="w-3 h-3" />{ev.fileName}{ev.sizeBytes ? ` (${Math.max(1, Math.round(ev.sizeBytes / 1024))} KB)` : ""}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ActionQueuePage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ActionRequest[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Pending");
  const [deciding, setDeciding] = useState<{ req: ActionRequest; status: "Approved" | "Rejected" } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api<{ requests: ActionRequest[] }>("/api/action-requests");
      setRequests(d.requests || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the action queue.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide() {
    if (!deciding) return;
    setSaving(true);
    try {
      await api(`/api/action-requests/${deciding.req.id}`, { method: "PATCH", json: { status: deciding.status, decisionNotes: decisionNotes.trim() } });
      toast({ title: `Request ${deciding.status.toLowerCase()}`, description: deciding.status === "Approved" && deciding.req.kind === "amendment" ? "Open the job to apply the amendment." : undefined });
      setDeciding(null);
      setDecisionNotes("");
      await load();
    } catch (e) {
      toast({ title: "Could not save decision", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const list = (requests || []).filter((r) => tab === "All" || r.status === tab);
  const pendingCount = (requests || []).filter((r) => r.status === "Pending").length;

  return (
    <SidebarLayout title="Action Queue" subtitle="Customer amendment, cancellation and transport exception requests">
      <div className="flex bg-slate-100 p-1 rounded-lg mb-6 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${tab === t ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t}{t === "Pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {error ? <ErrorState message={error} onRetry={load} /> : requests === null ? <SkeletonRows /> : list.length === 0 ? (
          <EmptyState title={tab === "Pending" ? "Queue is clear" : "Nothing here"} body={tab === "Pending" ? "No requests are waiting for a decision." : "No requests match this filter."} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((r) => (
              <li key={r.id} className="px-6 py-4" data-testid={`action-request-${r.id}`}>
                <div className="flex flex-col md:flex-row md:items-start gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#0f2744]">{REQUEST_KIND_LABELS[r.kind] || r.kind}</span>
                      {r.outcome && <Badge variant="outline" className="bg-slate-50">{EXCEPTION_OUTCOMES.find((o) => o.value === r.outcome)?.label || r.outcome}</Badge>}
                      <Badge variant="outline" className={DECISION_STYLES[r.status]}>{r.status}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      <Link href={`/jobs/${r.jobId}`} className="font-medium text-[#0ea5e9] hover:underline inline-flex items-center gap-1">{r.reference || `Job ${r.jobId}`}<ExternalLink className="w-3 h-3" /></Link>
                      {" · "}{r.requesterName || "Unknown requester"} · {fmtDate(r.createdAt, true)} · {notificationLabel(r.notificationStatus)}
                    </p>
                    {r.notes && <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{r.notes}</p>}
                    {r.kind === "transport_exception" && <EvidenceList requestId={r.id} />}
                    {r.decisionNotes && <p className="text-xs text-slate-500 mt-2">Decision notes: {r.decisionNotes}</p>}
                  </div>
                  {r.status === "Pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setDeciding({ req: r, status: "Approved" }); setDecisionNotes(""); }}><Check className="w-4 h-4 mr-1" />Approve</Button>
                      <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => { setDeciding({ req: r, status: "Rejected" }); setDecisionNotes(""); }}><X className="w-4 h-4 mr-1" />Reject</Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {deciding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[480px] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-[#0f2744]">{deciding.status === "Approved" ? "Approve" : "Reject"} {(REQUEST_KIND_LABELS[deciding.req.kind] || "request").toLowerCase()}</h3>
              <p className="text-sm text-slate-500">{deciding.req.reference || `Job ${deciding.req.jobId}`}</p>
            </div>
            <div className="p-6 space-y-4">
              {deciding.status === "Approved" && (
                <p className="flex gap-2 text-sm rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-900"><Info className="w-4 h-4 mt-0.5 shrink-0" />{APPROVAL_EFFECT[deciding.req.kind] || "Approving records the decision."}</p>
              )}
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Decision notes (required, shared with requester)</span>
                <textarea required rows={3} value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]" />
              </label>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeciding(null)}>Cancel</Button>
              <Button disabled={saving} onClick={decide} className={deciding.status === "Approved" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}>
                {saving ? "Saving…" : `Confirm ${deciding.status === "Approved" ? "approval" : "rejection"}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
