import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/v16-api";

/** Admin-only: provisional customer weights must be verified before the job can be confirmed. */
export function WeightVerificationBanner({ jobId, onVerified }: { jobId: number; onVerified: () => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    setSaving(true);
    setError("");
    try {
      const r = await api<{ verified?: boolean }>(`/api/jobs/${jobId}/verify-weight`, { method: "POST", json: { notes: notes.trim() } });
      if (r?.verified === false) throw new Error("Weights are not yet verified.");
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify weights.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5" data-testid="banner-weight-verification">
      <p className="font-semibold text-amber-900 flex items-center gap-2"><ShieldAlert className="w-5 h-5" />Provisional weight needs Admin verification</p>
      <p className="text-sm text-amber-800 mt-1">The customer submitted with one or more unknown weights. Resolve battery weights below, then verify. Confirmation is blocked until this is cleared.</p>
      <div className="mt-3 flex flex-col md:flex-row gap-2">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Verification notes (optional)" className="flex-1 text-sm border border-amber-200 rounded-md px-3 py-2 bg-white" data-testid="input-verify-weight-notes" />
        <Button disabled={saving} onClick={verify} className="bg-[#0f2744] hover:bg-[#1e3a5f] text-white" data-testid="button-verify-weight">{saving ? "Verifying…" : "Mark weights verified"}</Button>
      </div>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
