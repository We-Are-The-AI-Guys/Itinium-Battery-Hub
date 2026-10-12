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
  Calendar,
  CalendarDays,
  Plus,
  Package,
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ImagePlus,
  X as XIcon,
  ClipboardList,
  BookOpen,
  Inbox,
  Truck,
} from "lucide-react";
import { hasRole, isAdmin, isCollector, isCustomer, isUnassigned, isWarehouseOnly, canSeeSchedule, roleSummary } from "@/lib/roles";
import { NotificationBell } from "@/components/notification-panel";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
  roles?: string[];
  depot: string | null;
  clientId: number | null;
  locationId: number | null;
  clientName: string | null;
  locationName: string | null;
}

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  roles?: string[];
}

function getNavItems(user: User | null): NavItem[] {
  if (!user) return [];
  const items: NavItem[] = [];
  if (isAdmin(user)) {
    items.push({ icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" });
    items.push({ icon: Briefcase, label: "Job Management", path: "/jobs" });
    items.push({ icon: Inbox, label: "Action Queue", path: "/action-queue" });
    items.push({ icon: Package, label: "Stillages", path: "/stillages" });
    items.push({ icon: BarChart3, label: "KPI Reporting", path: "/kpi" });
    items.push({ icon: LineChart, label: "LME Pricing", path: "/lme-pricing" });
    items.push({ icon: Building2, label: "Clients", path: "/clients" });
    items.push({ icon: CalendarDays, label: "Schedule", path: "/schedule" });
    items.push({ icon: ClipboardList, label: "AI Correction Audit", path: "/correction-audit" });
    items.push({ icon: Users, label: "User Access", path: "/users" });
    return items;
  }
  if (isCollector(user)) {
    items.push({ icon: Truck, label: "Collections", path: "/collections" });
    return items;
  }
  if (!isCustomer(user) || isUnassigned(user)) return items;
  if (hasRole(user, "accounts")) items.push({ icon: BarChart3, label: "KPI Reporting", path: "/kpi" });
  if (isWarehouseOnly(user)) {
    items.push({ icon: LayoutDashboard, label: "Operational Overview", path: "/operational-overview" });
  } else {
    items.push({ icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" });
  }
  items.push({ icon: Briefcase, label: "Jobs", path: "/jobs" });
  if (canSeeSchedule(user)) items.push({ icon: CalendarDays, label: "Schedule", path: "/schedule" });
  items.push({ icon: Package, label: "Stillages", path: "/stillages" });
  return items;
}

function getLinkNavItems(user: User | null): NavItem[] {
  const out: NavItem[] = [];
  if (user && (isAdmin(user) || (isCustomer(user) && !isUnassigned(user)))) {
    out.push({ icon: Plus, label: "New Collection", path: "/collection/new" });
  }
  out.push({ icon: BookOpen, label: "User Guide", path: "/help" });
  out.push({ icon: HelpCircle, label: "Help & Support", path: "/support" });
  out.push({ icon: Settings, label: "Settings", path: "/settings" });
  return out;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    depot_user: "Depot User",
    team_leader: "Team Leader",
    accounts: "Accounts",
    head_office_admin: "Head Office Admin",
    collection_company: "Collection Company",
  };
  return labels[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCurrentMonth() {
  return new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

const ISSUE_TYPES = ["Bug Report", "Feature Request", "Question", "Other"];
const PRIORITIES = [
  { value: "P1", label: "P1 — Critical" },
  { value: "P2", label: "P2 — High" },
  { value: "P3", label: "P3 — Normal" },
  { value: "P4", label: "P4 — Low" },
];

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
}

export function SupportModal({ open, onClose, user }: SupportModalProps) {
  const [issueType, setIssueType] = useState("Bug Report");
  const [priority, setPriority] = useState("P3");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function resetForm() {
    setIssueType("Bug Report");
    setPriority("P3");
    setTitle("");
    setDetails("");
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setScreenshotUrl(null);
    setUploading(false);
    setUploadError(null);
  }

  function handleClose() {
    onClose();
    setTimeout(resetForm, 300);
  }

  async function compressImage(file: File, maxBytes = 900 * 1024): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const MAX_DIM = 1920;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
          else { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        let quality = 0.85;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= maxBytes || quality <= 0.3) {
              resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
            } else {
              quality -= 0.1;
              tryCompress();
            }
          }, "image/jpeg", quality);
        };
        tryCompress();
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }

  async function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Image must be under 10 MB.");
      return;
    }
    setUploadError(null);
    setScreenshotUrl(null);
    setUploading(true);

    let compressed: File;
    try {
      compressed = await compressImage(file);
    } catch {
      compressed = file;
    }

    setScreenshotFile(compressed);
    setScreenshotPreview(URL.createObjectURL(compressed));

    try {
      const form = new FormData();
      form.append("screenshot", compressed);
      const res = await fetch("/api/support/screenshot", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.message || "Screenshot upload failed.");
        setScreenshotFile(null);
        setScreenshotPreview(null);
      } else {
        setScreenshotUrl(data.screenshotUrl);
      }
    } catch {
      setUploadError("Could not upload screenshot. You can still submit without it.");
    } finally {
      setUploading(false);
    }
  }

  function removeScreenshot() {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setScreenshotUrl(null);
    setUploadError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        title: `[${issueType}] ${title.trim()}`,
        details,
        priority,
      };
      if (screenshotUrl) body.screenshotUrl = screenshotUrl;

      const res = await fetch("/api/support/ticket", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0f2744] flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#0ea5e9]" />
            Help & Support
          </DialogTitle>
          <DialogDescription>
            Submit a support ticket and we'll get back to you as soon as possible.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <div>
              <p className="font-semibold text-[#0f2744] text-base">Ticket submitted!</p>
              <p className="text-sm text-slate-500 mt-1">
                We've received your request and will be in touch shortly.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 px-6 py-2 bg-[#0f2744] text-white text-sm font-medium rounded-md hover:bg-[#1e3a5f] transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-md border border-slate-200">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Name</p>
                <p className="text-sm font-medium text-slate-700">{user?.fullName || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Email</p>
                <p className="text-sm font-medium text-slate-700 truncate">{user?.email || "—"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Issue Type</label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of the issue"
                required
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Details</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe the issue or request in more detail..."
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9] resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Screenshot <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              {screenshotPreview ? (
                <div className="relative inline-block">
                  <img
                    src={screenshotPreview}
                    alt="Screenshot preview"
                    className="h-24 rounded-md border border-slate-200 object-cover"
                  />
                  {uploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-md">
                      <span className="w-4 h-4 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!uploading && (
                    <button
                      type="button"
                      onClick={removeScreenshot}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-600 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                  {screenshotUrl && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" /> Uploaded
                    </span>
                  )}
                </div>
              ) : (
                <label className="flex items-center gap-2 w-fit cursor-pointer px-3 py-2 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-colors">
                  <ImagePlus className="w-4 h-4" />
                  Attach image
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleScreenshotChange}
                  />
                </label>
              )}
              {uploadError && (
                <p className="mt-1 text-xs text-red-600">{uploadError}</p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter className="pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || uploading || !title.trim()}
                className="px-5 py-2 text-sm font-medium text-white bg-[#0ea5e9] hover:bg-[#0284c7] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting && (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {submitting ? "Submitting…" : "Submit Ticket"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
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
  const [supportOpen, setSupportOpen] = useState(false);

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
    if (path === "/") return location === "/" || location === "";
    return location.startsWith(path);
  }

  const navItems = getNavItems(user);
  const navItemStyle = (active: boolean) =>
    `w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
      active
        ? "bg-white/10 text-white border-l-4 border-[#0ea5e9]"
        : "hover:bg-white/5 hover:text-white border-l-4 border-transparent"
    }`;

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans">
      <aside className="fixed inset-y-0 left-0 w-[260px] bg-gradient-to-b from-[#0a1628] to-[#132744] text-slate-300 flex flex-col z-20">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <img
              src={itiniumLogo}
              alt="Itinium Partnership"
              className="h-12"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <p className="text-xs text-slate-400 font-medium">
            {user?.clientName || (isAdmin(user) ? "Admin Portal" : "Battery Portal")}
          </p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={navItemStyle(isActive(item.path))}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}

          <div className="my-6 border-t border-white/10 mx-4"></div>

          {getLinkNavItems(user).map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={navItemStyle(isActive(item.path))}
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
                {user ? roleSummary(user) : "..."}
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
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">{children}</div>
      </main>

      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        user={user}
      />
    </div>
  );
}
