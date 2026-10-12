import type { ReactNode } from "react";
export const useParams = <T,>() => ({ id: "49" }) as T;
export function Link({ children, className }: { children: ReactNode; href: string; className?: string }) {
  return <a className={className}>{children}</a>;
}
export function SidebarLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50">
    <header className="bg-[#0f2744] text-white px-8 py-5 font-bold">ITINIUM <span className="font-normal text-slate-300 text-sm ml-2">Battery Portal · current source reference</span></header>
    <main className="p-8"><h1 className="text-2xl font-bold text-[#0f2744]">{title}</h1><p className="text-sm text-slate-500 mb-6">{subtitle}</p>{children}</main>
  </div>;
}
export function JobDocumentsPanel({ jobId, mode }: { jobId: number; mode: string }) {
  return <p className="text-sm text-slate-500">Signed consignment note and collection sheet. Preview only.</p>;
}
export function JobRequestsPanel({ jobId, variant, jobStatus }: { jobId: number; variant: string; jobStatus: string }) {
  return <div className="space-y-3"><div className="flex gap-2">
    <button className="border rounded-md px-3 py-2 text-sm">Request amendment</button>
    <button className="border rounded-md px-3 py-2 text-sm text-red-700">Request cancellation</button>
  </div><p className="text-xs text-slate-400">No requests on this job yet. Context stub · preview only.</p></div>;
}
