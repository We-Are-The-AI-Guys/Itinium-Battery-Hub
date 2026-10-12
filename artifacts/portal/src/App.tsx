import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, type AuthUser } from "@/contexts/auth-context";
import { hasRole, isAdmin, isCollector, isCustomer, isUnassigned, isWarehouseOnly, canSeeSchedule } from "@/lib/roles";
import CustomerDashboardPage from "@/pages/customer-dashboard";
import CustomerJobsPage from "@/pages/customer-jobs";
import CustomerJobDetailPage from "@/pages/customer-job-detail";
import CustomerSchedulePage from "@/pages/customer-schedule";
import OperationalOverviewPage from "@/pages/operational-overview";
import ActionQueuePage from "@/pages/action-queue";
import SupportPage from "@/pages/support";
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
import SchedulePage from "@/pages/schedule";
import KpiPage from "@/pages/kpi";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import CorrectionAuditPage from "@/pages/correction-audit";
import HelpPage from "@/pages/help";
import CollectionsPage from "@/pages/collections";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AppSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
      <div className="flex items-center gap-3 text-[#64748b]">
        <div className="w-6 h-6 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppSpinner />;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

type Pred = (u: AuthUser) => boolean;

function Gate({ allow, children }: { allow: Pred; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppSpinner />;
  if (!user) return <Redirect to="/login" />;
  if (!allow(user)) return <Redirect to="/" />;
  return <>{children}</>;
}

const assignedCustomer: Pred = (u) => isCustomer(u) && !isUnassigned(u);
const adminOrCustomer: Pred = (u) => isAdmin(u) || assignedCustomer(u);

/** Admin keeps the original full component; customers get the safe read-only variant. */
function ByRole({ admin, customer }: { admin: React.ReactNode; customer: React.ReactNode }) {
  const { user } = useAuth();
  return <>{isAdmin(user) ? admin : customer}</>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppSpinner />;
  if (user) return <Redirect to="/" />;
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
      <Route path="/forgot-password">
        <ForgotPasswordPage />
      </Route>
      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>
      <Route path="/">
        <AuthGuard>
          <DashboardPage />
        </AuthGuard>
      </Route>
      <Route path="/dashboard">
        <Gate allow={(u) => isAdmin(u) || (assignedCustomer(u) && !isWarehouseOnly(u))}>
          <ByRole admin={<AdminDashboardPage />} customer={<CustomerDashboardPage />} />
        </Gate>
      </Route>
      <Route path="/jobs">
        <Gate allow={adminOrCustomer}>
          <ByRole admin={<JobListPage />} customer={<CustomerJobsPage />} />
        </Gate>
      </Route>
      <Route path="/jobs/:id">
        <Gate allow={adminOrCustomer}>
          <ByRole admin={<JobDetailPage />} customer={<CustomerJobDetailPage />} />
        </Gate>
      </Route>
      <Route path="/collections">
        <Gate allow={isCollector}>
          <CollectionsPage />
        </Gate>
      </Route>
      <Route path="/stillages">
        <Gate allow={adminOrCustomer}>
          <StillagesPage />
        </Gate>
      </Route>
      <Route path="/kpi">
        <Gate allow={u => isAdmin(u) || (assignedCustomer(u) && hasRole(u, "accounts", "lead_client"))}>
          <KpiPage />
        </Gate>
      </Route>
      <Route path="/help">
        <AuthGuard>
          <HelpPage />
        </AuthGuard>
      </Route>
      <Route path="/lme-pricing">
        <Gate allow={isAdmin}>
          <LmePricingPage />
        </Gate>
      </Route>
      <Route path="/clients">
        <Gate allow={isAdmin}>
          <ClientManagementPage />
        </Gate>
      </Route>
      <Route path="/locations">
        <Gate allow={isAdmin}>
          <LocationManagementPage />
        </Gate>
      </Route>
      <Route path="/users">
        <Gate allow={isAdmin}>
          <UserManagementPage />
        </Gate>
      </Route>
      <Route path="/settings">
        <AuthGuard>
          <SettingsPage />
        </AuthGuard>
      </Route>
      <Route path="/collection/new">
        <Gate allow={adminOrCustomer}>
          <DepotFormPage />
        </Gate>
      </Route>
      <Route path="/schedule">
        <Gate allow={(u) => isAdmin(u) || (assignedCustomer(u) && canSeeSchedule(u))}>
          <ByRole admin={<SchedulePage />} customer={<CustomerSchedulePage />} />
        </Gate>
      </Route>
      <Route path="/correction-audit">
        <Gate allow={isAdmin}>
          <CorrectionAuditPage />
        </Gate>
      </Route>
      <Route path="/operational-overview">
        <Gate allow={(u) => assignedCustomer(u) && isWarehouseOnly(u)}>
          <OperationalOverviewPage />
        </Gate>
      </Route>
      <Route path="/action-queue">
        <Gate allow={isAdmin}>
          <ActionQueuePage />
        </Gate>
      </Route>
      <Route path="/support">
        <AuthGuard>
          <SupportPage />
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
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
