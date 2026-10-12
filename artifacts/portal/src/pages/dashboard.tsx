import { Redirect } from "wouter";
import { useState } from "react";
import { LogOut, ShieldAlert, HelpCircle } from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { SupportModal } from "@/components/sidebar-layout";
import { homePath, roleSummary } from "@/lib/roles";

/** Root route: sends each role to its landing page, or explains a restricted (unassigned) account. */
export default function DashboardPage() {
  const { user } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);
  if (!user) return null;
  const target = homePath(user);
  if (target !== "/") return <Redirect to={target} />;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = import.meta.env.BASE_URL;
  }

  return (
    <div className="min-h-[100dvh] bg-[#f8fafc] flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={itiniumLogo} alt="Itinium Partnership" className="h-10" />
          <Button variant="ghost" onClick={handleLogout} data-testid="button-logout"><LogOut className="w-4 h-4 mr-2" />Sign out</Button>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500 p-8" data-testid="panel-restricted-account">
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center mb-4"><ShieldAlert className="w-6 h-6 text-amber-600" /></div>
          <h1 className="text-xl font-bold text-[#0f2744]">Your account is awaiting access</h1>
          <p className="text-sm text-slate-600 mt-2">
            You are signed in as <span className="font-medium">{user.fullName}</span> ({roleSummary(user)}), but no client or role has been assigned yet, so no data is available.
            An Itinium administrator needs to assign your client, roles and locations.
          </p>
          <Button className="mt-6 bg-[#0ea5e9] hover:bg-[#0284c7] text-white" onClick={() => setSupportOpen(true)}><HelpCircle className="w-4 h-4 mr-2" />Contact Itinium support</Button>
        </div>
      </main>
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} user={user} />
    </div>
  );
}
