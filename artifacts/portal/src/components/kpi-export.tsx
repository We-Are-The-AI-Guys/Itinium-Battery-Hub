import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KpiExport({ from, to, clientId, disabled }: { from: string; to: string; clientId: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (clientId) params.set("clientId", clientId);
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/kpi/export.xlsx?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not download the spreadsheet. Please try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `kpi-jobs-${from}-to-${to}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed"); }
    finally { setBusy(false); }
  }
  return <div>
    <Button variant="outline" size="sm" disabled={busy || disabled} onClick={download}>
      <Download className="w-4 h-4 mr-2" />{busy ? "Downloading…" : "Download Excel"}
    </Button>
    {error && <p role="alert" className="text-sm text-red-600 mt-1">{error}</p>}
  </div>;
}
