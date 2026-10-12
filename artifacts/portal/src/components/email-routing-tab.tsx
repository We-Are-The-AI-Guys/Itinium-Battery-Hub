import { useEffect, useState } from "react";
import { Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/v16-api";

interface RoutingSettings { operationsEmail: string; supportEmail: string; senderEmail: string }

const FIELDS: { key: keyof RoutingSettings; label: string; help: string }[] = [
  { key: "operationsEmail", label: "Operations inbox", help: "Receives new collections, amendment, cancellation and transport exception requests." },
  { key: "supportEmail", label: "Support inbox", help: "Receives Help & Support enquiries." },
  { key: "senderEmail", label: "Sender address", help: "The From address on portal notification emails." },
];

export function EmailRoutingTab() {
  const { toast } = useToast();
  const [values, setValues] = useState<RoutingSettings | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setError("");
    api<Partial<RoutingSettings>>("/api/v16/settings")
      .then((d) => setValues({ operationsEmail: d.operationsEmail || "", supportEmail: d.supportEmail || "", senderEmail: d.senderEmail || "" }))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load settings."));
  }
  useEffect(load, []);

  async function save() {
    if (!values) return;
    const bad = FIELDS.find((f) => values[f.key].trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.key].trim()));
    if (bad) { toast({ title: `${bad.label} is not a valid email address`, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.key, values[f.key].trim()]));
      await api("/api/v16/settings", { method: "PATCH", json: body });
      toast({ title: "Email routing saved" });
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2"><Mail className="w-5 h-5 text-[#0ea5e9]" />Email Routing</h3>
        <p className="text-sm text-slate-500 mt-1">Leave a field blank if it is not configured yet. Notifications that need it will be recorded as not configured rather than sent.</p>
      </div>
      <div className="p-6 space-y-5">
        {error ? (
          <p role="alert" className="text-sm text-red-600">{error} <button className="underline" onClick={load}>Retry</button></p>
        ) : !values ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-md bg-slate-100 animate-pulse" />)}</div>
        ) : (
          <>
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">{f.label}</span>
                <Input type="email" value={values[f.key]} placeholder="Not configured" onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} data-testid={`input-${f.key}`} />
                <span className="block text-xs text-slate-500 mt-1">{values[f.key].trim() ? f.help : `Not configured. ${f.help}`}</span>
              </label>
            ))}
            <div className="flex justify-end">
              <Button disabled={saving} onClick={save} className="bg-[#0f2744] hover:bg-[#1e3a5f] text-white"><Save className="w-4 h-4 mr-1.5" />{saving ? "Saving…" : "Save"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
