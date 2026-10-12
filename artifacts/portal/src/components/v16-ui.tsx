import { Badge } from "@/components/ui/badge";
import { AlertCircle, RefreshCw, Inbox } from "lucide-react";
import { STATUS_STYLES, customerStatusLabel } from "@/lib/v16-api";

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`font-medium shadow-none ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>
      {customerStatusLabel(status)}
    </Badge>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-sm text-slate-600">{message}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0ea5e9] hover:underline">
        <RefreshCw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mb-1">
        <Inbox className="w-5 h-5 text-slate-400" />
      </div>
      <p className="font-semibold text-[#0f2744]">{title}</p>
      <p className="text-sm text-slate-500 max-w-sm">{body}</p>
      {action}
    </div>
  );
}

export function Panel({ title, icon, children, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-[#0f2744] flex items-center gap-2">{icon}{title}</h3>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
