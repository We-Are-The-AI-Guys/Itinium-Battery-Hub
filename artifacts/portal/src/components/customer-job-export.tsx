import { useState } from "react";
import { Download } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canSeeInvoiceTotal } from "@/lib/roles";
import { Button } from "@/components/ui/button";

export function CustomerJobExport({ jobId }: { jobId: number }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!canSeeInvoiceTotal(user)) return null;
  async function download() {
    setBusy(true); setError("");
    try {
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/jobs/${jobId}/customer-export.xlsx`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not download this job. Please try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `job-${jobId}-customer.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed"); }
    finally { setBusy(false); }
  }
  return <div onClick={e => e.stopPropagation()}>
    <Button variant="outline" size="sm" disabled={busy} onClick={download}>
      <Download className="w-4 h-4 mr-2" />{busy ? "Downloading…" : "Download Excel"}
    </Button>
    {error && <p role="alert" className="text-sm text-red-600 mt-1">{error}</p>}
  </div>;
}
