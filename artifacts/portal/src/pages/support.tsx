import { useCallback, useEffect, useState } from "react";
import { Plus, LifeBuoy } from "lucide-react";
import { SidebarLayout, SupportModal } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/roles";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/v16-ui";
import { api, DECISION_STYLES, fmtDate, notificationLabel, type SupportTicket } from "@/lib/v16-api";

const STATUSES: SupportTicket["status"][] = ["New", "In Progress", "Resolved"];

export default function SupportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const admin = isAdmin(user);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"All" | SupportTicket["status"]>("All");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api<{ tickets: SupportTicket[] }>("/api/support/tickets");
      setTickets(d.tickets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load enquiries.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(t: SupportTicket, status: SupportTicket["status"]) {
    try {
      await api(`/api/support/tickets/${t.id}`, { method: "PATCH", json: { status } });
      setTickets((prev) => (prev || []).map((x) => (x.id === t.id ? { ...x, status } : x)));
    } catch (e) {
      toast({ title: "Could not update status", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }

  const list = (tickets || []).filter((t) => filter === "All" || t.status === filter);

  return (
    <SidebarLayout
      title="Help & Support"
      subtitle={admin ? "All support enquiries" : "Your support enquiries"}
      headerActions={<Button onClick={() => setOpen(true)} className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white" data-testid="button-new-enquiry"><Plus className="w-4 h-4 mr-1.5" />New enquiry</Button>}
    >
      <div className="flex bg-slate-100 p-1 rounded-lg mb-6 w-fit">
        {(["All", ...STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-4 py-2 text-sm font-medium rounded-md ${filter === s ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{s}</button>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {error ? <ErrorState message={error} onRetry={load} /> : tickets === null ? <SkeletonRows /> : list.length === 0 ? (
          <EmptyState title="No enquiries" body={filter === "All" ? "Questions, problems or feature ideas go here. Itinium will update the status as they work on it." : "Nothing with this status."} action={<button onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#0ea5e9] hover:underline"><LifeBuoy className="w-4 h-4" />Raise an enquiry</button>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((t) => (
              <li key={t.id} className="px-6 py-4" data-testid={`ticket-${t.id}`}>
                <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <button className="text-left min-w-0" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                    <p className="font-semibold text-[#0f2744] truncate">{t.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      #{t.id} · {fmtDate(t.createdAt, true)}{admin && t.requesterName ? ` · ${t.requesterName}` : ""}{admin ? ` · ${notificationLabel(t.notificationStatus)}` : ""}
                    </p>
                  </button>
                  {admin ? (
                    <select value={t.status} onChange={(e) => setStatus(t, e.target.value as SupportTicket["status"])} className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white" aria-label="Ticket status">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <Badge variant="outline" className={DECISION_STYLES[t.status]}>{t.status}</Badge>
                  )}
                </div>
                {expanded === t.id && t.details && <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap rounded-md bg-slate-50 border border-slate-100 p-3">{t.details}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <SupportModal open={open} onClose={() => { setOpen(false); load(); }} user={user} />
    </SidebarLayout>
  );
}
