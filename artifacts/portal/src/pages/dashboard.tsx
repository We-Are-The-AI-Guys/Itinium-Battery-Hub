import { useEffect, useState } from "react";
import { Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.user) setUser(data.user); })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = import.meta.env.BASE_URL;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#0ea5e9] to-[#0284c7] rounded-md flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-[0.15em] text-[#0f2744]">ITINIUM</span>
            <span className="hidden sm:inline text-sm text-[#64748b] ml-2">Battery Collection Portal</span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0f2744] text-white flex items-center justify-center text-sm font-semibold" data-testid="text-user-initials">
                  {user.fullName.split(" ").map(n => n[0]).join("").toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-[#1e293b]" data-testid="text-user-name">{user.fullName}</p>
                  <p className="text-xs text-[#64748b] capitalize" data-testid="text-user-role">{user.role.replace(/_/g, " ")}</p>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-[#1e293b] mb-2" data-testid="text-dashboard-heading">Welcome, {user?.fullName || "User"}</h1>
        <p className="text-[#64748b] mb-8">You are signed in as <span className="font-medium capitalize">{user?.role.replace(/_/g, " ") || "..."}</span>. The full portal is under development.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-medium text-[#64748b] mb-1">Your Role</h3>
            <p className="text-2xl font-bold text-[#0f2744] capitalize">{user?.role.replace(/_/g, " ") || "..."}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-medium text-[#64748b] mb-1">Email</h3>
            <p className="text-lg font-medium text-[#1e293b]">{user?.email || "..."}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-medium text-[#64748b] mb-1">Portal Status</h3>
            <p className="text-lg font-medium text-[#10b981]">Active</p>
          </div>
        </div>
      </main>
    </div>
  );
}