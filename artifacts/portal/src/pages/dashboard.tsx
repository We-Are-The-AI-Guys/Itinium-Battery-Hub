import { useEffect, useState } from "react";
import { Link, Redirect } from "wouter";
import { LogOut, Plus, Battery, TrendingUp } from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
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

  const isAdminRole = user && ["team_leader", "accounts", "head_office_admin"].includes(user.role);

  if (isAdminRole) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={itiniumLogo}
              alt="Itinium Partnership"
              className="h-8"
            />
            
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
        <p className="text-[#64748b] mb-8">You are signed in as <span className="font-medium capitalize">{user?.role.replace(/_/g, " ") || "..."}</span>.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Battery className="w-4 h-4 text-[#0ea5e9]" />
              <h3 className="text-sm font-medium text-[#64748b]">Your Role</h3>
            </div>
            <p className="text-2xl font-bold text-[#0f2744] capitalize">{user?.role.replace(/_/g, " ") || "..."}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-[#0ea5e9]" />
              <h3 className="text-sm font-medium text-[#64748b]">Portal Status</h3>
            </div>
            <p className="text-lg font-medium text-[#10b981]">Active</p>
          </div>
          <Link href="/collection/new" className="block" data-testid="link-new-collection-card">
            <div className="bg-gradient-to-br from-[#0f2744] to-[#1a3a5c] rounded-xl border border-slate-200 p-6 shadow-sm text-white hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
              <div className="flex items-center gap-2 mb-1">
                <Plus className="w-4 h-4 text-[#0ea5e9]" />
                <h3 className="text-sm font-medium text-slate-300">Quick Action</h3>
              </div>
              <p className="text-xl font-bold">New Collection</p>
              <p className="text-sm text-slate-300 mt-1">Submit a battery collection</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
