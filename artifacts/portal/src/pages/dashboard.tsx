import { useState, useEffect } from "react";
import { CustomerDocuments } from "@/components/customer-documents";
import { Link, Redirect, useLocation } from "wouter";
import { LogOut, Plus, Battery, TrendingUp, FileText, Trash2, Clock, ChevronRight, BookOpen, Settings, HelpCircle } from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { SupportModal } from "@/components/sidebar-layout";

interface JobDraft {
  id: number;
  depot: string;
  collectionPoint: string | null;
  batteryCount: number;
  updatedAt: string;
  savedByName: string | null;
}

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [drafts, setDrafts] = useState<JobDraft[]>([]);
  const [deletingDraftId, setDeletingDraftId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    fetch("/api/job-drafts", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.drafts) setDrafts(data.drafts);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = import.meta.env.BASE_URL;
  }

  async function deleteDraft(id: number) {
    setDeletingDraftId(id);
    try {
      const res = await fetch(`/api/job-drafts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== id));
      }
    } finally {
      setDeletingDraftId(null);
      setConfirmDeleteId(null);
    }
  }

  if (!user) return null;

  const isAdminRole = ["team_leader", "accounts", "head_office_admin"].includes(user.role);

  if (isAdminRole) {
    return <Redirect to="/dashboard" />;
  }

  if (user.role === "collection_company") {
    return <Redirect to="/collections" />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={itiniumLogo}
              alt="Itinium Partnership"
              className="h-10"
            />
            
            <span className="hidden sm:inline text-sm text-[#64748b] ml-2">Battery Collection Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              <Link
                href="/help"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#475569] hover:text-[#0f2744] hover:bg-slate-100 rounded-md transition-colors"
                data-testid="link-user-guide"
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden md:inline">User Guide</span>
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#475569] hover:text-[#0f2744] hover:bg-slate-100 rounded-md transition-colors"
                data-testid="link-settings"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden md:inline">Settings</span>
              </Link>
              <button
                onClick={() => setSupportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#475569] hover:text-[#0f2744] hover:bg-slate-100 rounded-md transition-colors"
                data-testid="button-help-support"
              >
                <HelpCircle className="w-4 h-4" />
                <span className="hidden md:inline">Help &amp; Support</span>
              </button>
            </nav>
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
        <p className="text-[#64748b] mb-8">
          You are signed in as <span className="font-medium capitalize">{user?.role.replace(/_/g, " ") || "..."}</span>
          {user?.locationName && <> at <span className="font-medium">{user.locationName}</span></>}
          {user?.clientName && <> ({user.clientName})</>}
          .
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Battery className="w-4 h-4 text-[#0ea5e9]" />
              <h3 className="text-sm font-medium text-[#64748b]">Your Location</h3>
            </div>
            <p className="text-2xl font-bold text-[#0f2744]">{user?.locationName || "Head Office"}</p>
            {user?.clientName && <p className="text-sm text-[#64748b] mt-1">{user.clientName}</p>}
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

        <CustomerDocuments />
        {drafts.length > 0 && (
          <div className="mb-8" data-testid="section-drafts">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-[#1e293b]">Saved Drafts</h2>
              <span className="text-sm text-[#64748b] ml-1">({drafts.length})</span>
            </div>
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  data-testid={`draft-row-${draft.id}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#0f2744]">
                          {draft.collectionPoint || "Collection point not yet entered"}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          Draft
                        </span>
                      </div>
                      <p className="text-sm text-[#64748b] mt-0.5">
                        {draft.batteryCount} battery row{draft.batteryCount !== 1 ? "s" : ""}
                        {" · "}
                        Last saved {formatRelativeDate(draft.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {confirmDeleteId === draft.id ? (
                      <>
                        <span className="text-sm text-slate-500">Delete this draft?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteDraft(draft.id)}
                          disabled={deletingDraftId === draft.id}
                          data-testid={`button-confirm-delete-draft-${draft.id}`}
                        >
                          {deletingDraftId === draft.id ? "Deleting..." : "Yes, delete"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmDeleteId(null)}
                          data-testid={`button-cancel-delete-draft-${draft.id}`}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setConfirmDeleteId(draft.id)}
                          data-testid={`button-delete-draft-${draft.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#0f2744] hover:bg-[#132744] text-white"
                          onClick={() => setLocation(`/collection/new?draft=${draft.id}`)}
                          data-testid={`button-resume-draft-${draft.id}`}
                        >
                          <ChevronRight className="w-3.5 h-3.5 mr-1" />
                          Resume
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        user={user}
      />
    </div>
  );
}
