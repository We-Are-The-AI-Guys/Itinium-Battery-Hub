import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardEdit, XCircle, AlertTriangle, RefreshCw, Send } from "lucide-react";
import {
  api,
  DECISION_STYLES,
  EXCEPTION_OUTCOMES,
  REQUEST_KIND_LABELS,
  fmtDate,
  type JobRequest,
} from "@/lib/v16-api";

export function evidenceProblem(f: File): string {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) return "Only PDF, JPG or PNG files can be attached.";
  if (f.size > 20 * 1024 * 1024) return "Files must be 20 MB or smaller.";
  return "";
}

async function uploadEvidence(jobId: number, requestId: number, file: File) {
  const meta = { name: file.name, size: file.size, contentType: file.type };
  const base = `/api/jobs/${jobId}/requests/${requestId}/evidence`;
  const { uploadURL, objectPath, uploadToken } = await api<{ uploadURL: string; objectPath: string; uploadToken: string }>(`${base}/upload-url`, { method: "POST", json: meta });
  const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("file transfer failed");
  await api(base, { method: "POST", json: { ...meta, objectPath, uploadToken } });
}

type Variant = "customer" | "collector";

/**
 * Customer: amendment / cancellation requests before completion. Nothing is
 * changed directly; Itinium Admin reviews every request.
 * Collector: transport exception reporting. Approval never changes job status.
 */
export function JobRequestsPanel({
  jobId,
  variant,
  jobStatus,
}: {
  jobId: number;
  variant: Variant;
  jobStatus: string;
}) {
  const [requests, setRequests] = useState<JobRequest[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("completed");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState(false);
  const [evidence, setEvidence] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ requests: JobRequest[] }>(`/api/jobs/${jobId}/requests`);
      setRequests(data.requests || []);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load requests.");
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const closed = jobStatus === "completed" || jobStatus === "cancelled";
  const customerCanRequest = variant === "customer" && !closed;
  const visible = (requests || []).filter((r) =>
    variant === "collector" ? r.kind === "transport_exception" : r.kind !== "transport_exception",
  );
  const pendingCancellation = visible.some((r) => r.kind === "cancellation" && r.status === "Pending");

  async function submit() {
    if (!kind) return;
    if (!notes.trim()) {
      setFormError(kind === "transport_exception" ? "Describe what happened on the collection." : "Explain what needs to change.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const body: Record<string, string> = { kind, notes: notes.trim() };
      if (kind === "transport_exception") body.outcome = outcome;
      const created = await api<{ id?: number; request?: { id: number } }>(`/api/jobs/${jobId}/requests`, { method: "POST", json: body });
      const requestId = created?.request?.id ?? created?.id;
      if (kind === "transport_exception" && evidence) {
        if (!requestId) throw new Error("Report saved, but evidence could not be attached. Contact Itinium.");
        try {
          await uploadEvidence(jobId, requestId, evidence);
        } catch (e) {
          await load();
          setKind(null);
          setNotes("");
          setEvidence(null);
          setFormError("");
          setSent(true);
          throw new Error(`Report saved, but the evidence upload failed: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
      setEvidence(null);
      setKind(null);
      setNotes("");
      setOutcome("completed");
      setSent(true);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not send the request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4" data-testid={`requests-panel-${jobId}`}>
      {variant === "customer" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!customerCanRequest || kind !== null}
            onClick={() => { setKind("amendment"); setSent(false); }}
            data-testid="button-request-amendment"
          >
            <ClipboardEdit className="w-4 h-4 mr-1.5" /> Request amendment
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-700 border-red-200 hover:bg-red-50"
            disabled={!customerCanRequest || kind !== null || pendingCancellation}
            onClick={() => { setKind("cancellation"); setSent(false); }}
            data-testid="button-request-cancellation"
          >
            <XCircle className="w-4 h-4 mr-1.5" /> Request cancellation
          </Button>
        </div>
      )}
      {variant === "customer" && closed && (
        <p className="text-xs text-slate-500">This job is {jobStatus}. Amendments and cancellations can no longer be requested; contact Itinium through Help & Support if something is wrong.</p>
      )}
      {variant === "collector" && kind === null && (
        <Button variant="outline" size="sm" onClick={() => { setKind("transport_exception"); setSent(false); }} data-testid={`button-report-exception-${jobId}`}>
          <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600" /> Report transport exception
        </Button>
      )}

      {kind && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-[#0f2744]">{REQUEST_KIND_LABELS[kind]}</p>
          {kind === "transport_exception" && (
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Outcome</span>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white"
                data-testid="select-exception-outcome"
              >
                {EXCEPTION_OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">
              {kind === "transport_exception" ? "What happened" : kind === "cancellation" ? "Reason for cancellation" : "What should change"}
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
              data-testid="input-request-notes"
            />
          </label>
          {kind === "transport_exception" && (
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Signed evidence (PDF, JPG or PNG, max 20 MB, optional)</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  const problem = f ? evidenceProblem(f) : "";
                  if (problem) { setFormError(problem); e.target.value = ""; setEvidence(null); return; }
                  setFormError("");
                  setEvidence(f);
                }}
                className="block w-full text-sm text-slate-600"
                data-testid="input-exception-evidence"
              />
            </label>
          )}
          <p className="text-xs text-slate-500">
            {kind === "transport_exception"
              ? "Itinium will review this report. It does not change the job status by itself."
              : "Nothing changes until Itinium Admin reviews and approves this request."}
          </p>
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setKind(null); setFormError(""); }}>Cancel</Button>
            <Button size="sm" className="bg-[#0f2744] hover:bg-[#1e3a5f] text-white" disabled={submitting} onClick={submit} data-testid="button-submit-request">
              <Send className="w-3.5 h-3.5 mr-1.5" /> {submitting ? "Sending…" : "Send to Itinium"}
            </Button>
          </div>
        </div>
      )}
      {sent && <p className="text-sm text-green-700" role="status">Request sent. Itinium will review it.</p>}

      {loadError ? (
        <p role="alert" className="text-sm text-red-600">
          {loadError} <button className="underline" onClick={load}><RefreshCw className="inline w-3 h-3" /> Retry</button>
        </p>
      ) : requests === null ? (
        <div className="h-12 rounded-md bg-slate-100 animate-pulse" />
      ) : visible.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {visible.map((r) => (
            <li key={r.id} className="px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[#0f2744]">
                  {REQUEST_KIND_LABELS[r.kind] || r.kind}
                  {r.outcome ? ` · ${EXCEPTION_OUTCOMES.find((o) => o.value === r.outcome)?.label || r.outcome}` : ""}
                </span>
                <Badge variant="outline" className={DECISION_STYLES[r.status]}>{r.status}</Badge>
              </div>
              {r.notes && <p className="text-slate-600 mt-1 whitespace-pre-wrap">{r.notes}</p>}
              {r.decisionNotes && <p className="text-xs text-slate-500 mt-1">Itinium: {r.decisionNotes}</p>}
              <p className="text-xs text-slate-400 mt-1">{fmtDate(r.createdAt, true)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">No requests on this job yet.</p>
      )}
    </div>
  );
}
