import { useState } from "react";
import { Download } from "lucide-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const types = [
  ["consignment_note", "Signed consignment note"],
  ["collection_sheet", "Signed collection sheet"],
] as const;

export function JobDocumentDownloads({ jobId, reference, available, releasePending = false }: {
  jobId: number; reference: string; available: string[]; releasePending?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function download(type: string) {
    setBusy(type); setError("");
    try {
      const response = await fetch(`${base}/api/jobs/${jobId}/documents/${type}/download`, { credentials: "include" });
      if (!response.ok) throw new Error(response.status === 404
        ? "Document unavailable. Refresh the table and try again." : "Unable to download this document.");
      const blob = await response.blob();
      const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || `${reference}-${type}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally { setBusy(null); }
  }
  return <div className="min-w-[13rem] space-y-2 text-xs" onClick={e => e.stopPropagation()}>
    {types.map(([type, label]) => available.includes(type) ? <div key={type}>
      <a href={`${base}/api/jobs/${jobId}/documents/${type}/view`} target="_blank" rel="noopener noreferrer"
        aria-label={`View ${label.toLowerCase()} for ${reference}`} className="text-sky-700 underline">View</a>
      <button key={type} type="button" disabled={busy !== null}
        aria-label={`Download ${label.toLowerCase()} for ${reference}`}
        onClick={() => download(type)}
        className="flex items-center gap-2 text-sky-700 underline min-h-9 text-left disabled:opacity-50">
        <Download className="h-4 w-4 shrink-0" />{busy === type ? "Downloading…" : label}
      </button></div> :
      <div key={type} className="text-slate-500 py-1">{label}<span className="block text-slate-500">{releasePending ? "Available on confirmation of receipt" : "Not uploaded"}</span></div>)}
    {error && <p role="alert" className="text-red-700 max-w-56">{error}</p>}
  </div>;
}
