import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import AdminDashboardPage from "@/pages/admin-dashboard";
import DepotFormPage from "@/pages/depot-form";
import LmePricingPage from "@/pages/lme-pricing";
import UserManagementPage from "@/pages/user-management";
import ClientManagementPage from "@/pages/client-management";
import LocationManagementPage from "@/pages/location-management";
import SettingsPage from "@/pages/settings";
import JobListPage from "@/pages/job-list";
import JobDetailPage from "@/pages/job-detail";
import StillagesPage from "@/pages/stillages";
import PlaceholderPage from "@/pages/placeholder";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(res => {
        setIsAuth(res.ok);
      })
      .catch(() => setIsAuth(false));
  }, []);

  if (isAuth === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex items-center gap-3 text-[#64748b]">
          <div className="w-6 h-6 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuth) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

const ADMIN_ROLES = ["team_leader", "accounts", "head_office_admin"];

function RoleGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user) setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex items-center gap-3 text-[#64748b]">
          <div className="w-6 h-6 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowedRoles={ADMIN_ROLES}>{children}</RoleGuard>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(res => {
        setIsAuth(res.ok);
      })
      .catch(() => setIsAuth(false));
  }, []);

  if (isAuth === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex items-center gap-3 text-[#64748b]">
          <div className="w-6 h-6 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (isAuth) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login">
        <GuestGuard>
          <LoginPage />
        </GuestGuard>
      </Route>
      <Route path="/">
        <AuthGuard>
          <DashboardPage />
        </AuthGuard>
      </Route>
      <Route path="/dashboard">
        <AdminGuard>
          <AdminDashboardPage />
        </AdminGuard>
      </Route>
      <Route path="/jobs">
        <AdminGuard>
          <JobListPage />
        </AdminGuard>
      </Route>
      <Route path="/jobs/:id">
        <AdminGuard>
          <JobDetailPage />
        </AdminGuard>
      </Route>
      <Route path="/stillages">
        <AuthGuard>
          <StillagesPage />
        </AuthGuard>
      </Route>
      <Route path="/kpi">
        <RoleGuard allowedRoles={["accounts", "head_office_admin"]}>
          <PlaceholderPage title="KPI Reporting" />
        </RoleGuard>
      </Route>
      <Route path="/help">
        <AuthGuard>
          <PlaceholderPage title="Help & Support" />
        </AuthGuard>
      </Route>
      <Route path="/lme-pricing">
        <RoleGuard allowedRoles={["accounts", "head_office_admin"]}>
          <LmePricingPage />
        </RoleGuard>
      </Route>
      <Route path="/clients">
        <RoleGuard allowedRoles={["head_office_admin"]}>
          <ClientManagementPage />
        </RoleGuard>
      </Route>
      <Route path="/locations">
        <RoleGuard allowedRoles={["team_leader"]}>
          <LocationManagementPage />
        </RoleGuard>
      </Route>
      <Route path="/users">
        <RoleGuard allowedRoles={["head_office_admin", "team_leader"]}>
          <UserManagementPage />
        </RoleGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard>
          <SettingsPage />
        </AuthGuard>
      </Route>
      <Route path="/collection/new">
        <AuthGuard>
          <DepotFormPage />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
