import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Briefcase,
  BarChart3,
  LineChart,
  Users,
  Settings,
  HelpCircle,
  LogOut,
  Search,
  Bell,
  Calendar,
  Plus,
} from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Input } from "@/components/ui/input";

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Briefcase, label: "Job Management", path: "/jobs" },
  { icon: BarChart3, label: "KPI Reporting", path: "/kpi" },
  { icon: LineChart, label: "LME Pricing", path: "/lme-pricing" },
  { icon: Users, label: "User Access", path: "/users" },
];

const secondaryNavItems = [
  { icon: Plus, label: "New Collection", path: "/collection/new" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: HelpCircle, label: "Help & Support", path: "/help" },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

function getRoleLabel(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCurrentMonth() {
  return new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

interface SidebarLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  headerActions?: React.ReactNode;
  showSearch?: boolean;
}

export function SidebarLayout({
  children,
  title,
  subtitle,
  headerActions,
  showSearch = false,
}: SidebarLayoutProps) {
  const [user, setUser] = useState<User | null>(null);
  const [location] = useLocation();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = import.meta.env.BASE_URL;
  }

  function isActive(path: string) {
    if (path === "/dashboard") return location === "/dashboard" || location === "/" || location === "";
    return location.startsWith(path);
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans">
      <aside className="fixed inset-y-0 left-0 w-[260px] bg-gradient-to-b from-[#0a1628] to-[#132744] text-slate-300 flex flex-col z-20">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <img
              src={itiniumLogo}
              alt="Itinium Partnership"
              className="h-8"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <p className="text-xs text-slate-400 font-medium">Admin Portal</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                isActive(item.path)
                  ? "bg-white/10 text-white border-l-4 border-[#0ea5e9]"
                  : "hover:bg-white/5 hover:text-white border-l-4 border-transparent"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}

          <div className="my-6 border-t border-white/10 mx-4"></div>

          {secondaryNavItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                isActive(item.path)
                  ? "bg-white/10 text-white border-l-4 border-[#0ea5e9]"
                  : "hover:bg-white/5 hover:text-white border-l-4 border-transparent"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0ea5e9] to-[#38bdf8] flex items-center justify-center text-white font-bold text-sm shadow-md">
              {user ? getInitials(user.fullName) : ".."}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.fullName || "Loading..."}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {user ? getRoleLabel(user.role) : "..."}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
              data-testid="button-sidebar-logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 ml-[260px] flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#0f2744]">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>
          <div className="flex items-center gap-6">
            {showSearch && (
              <div className="relative group">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#0ea5e9]" />
                <Input
                  placeholder="Search jobs, clients..."
                  className="pl-9 w-[280px] bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                />
              </div>
            )}
            {headerActions}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400" />
              {getCurrentMonth()}
            </div>
            <button className="relative p-2 text-slate-400 hover:text-[#0f2744] hover:bg-slate-100 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">{children}</div>
      </main>
    </div>
  );
}
