import { useState, useEffect } from "react";
import {
  Package,
  Plus,
  ArrowDown,
  ArrowUp,
  Calendar,
  Building2,
  History,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SidebarLayout } from "@/components/sidebar-layout";
import { useToast } from "@/hooks/use-toast";

interface StillageMovement {
  id: number;
  depot: string;
  movementDate: string;
  collected: number;
  droppedOff: number;
  notes: string | null;
  createdAt: string;
}

interface DepotSummary {
  depot: string;
  totalCollected: number;
  totalDroppedOff: number;
  currentCount: number;
}

interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
}

const ADMIN_ROLES = ["team_leader", "accounts", "head_office_admin"];

const DEPOTS = [
  "Birmingham Central",
  "Manchester North",
  "Leeds Hub",
  "Bristol South",
  "Reading Central",
  "London Depot",
  "Sheffield East",
  "Coventry West",
];

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function StillagesPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DepotSummary[]>([]);
  const [totalInCirculation, setTotalInCirculation] = useState(0);
  const [movements, setMovements] = useState<StillageMovement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDepotFilter, setSelectedDepotFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    depot: "",
    movementDate: new Date().toISOString().split("T")[0],
    collected: "",
    droppedOff: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          if (data.user.depot && !ADMIN_ROLES.includes(data.user.role)) {
            setSelectedDepotFilter(data.user.depot);
            setFormData((f) => ({ ...f, depot: data.user.depot }));
          }
        }
      })
      .catch(() => {});
  }, []);

  function loadData() {
    fetch("/api/stillages/summary", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setSummary(data.summary);
          setTotalInCirculation(data.totalInCirculation);
        }
      })
      .catch(() => {});

    const params = new URLSearchParams();
    if (selectedDepotFilter !== "all") {
      params.set("depot", selectedDepotFilter);
    }
    fetch(`/api/stillages?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMovements(data.movements);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadData();
  }, [selectedDepotFilter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch("/api/stillages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast({
          title: "Movement logged",
          description: "Stillage movement has been recorded successfully.",
        });
        setFormData({
          depot: user?.depot || "",
          movementDate: new Date().toISOString().split("T")[0],
          collected: "",
          droppedOff: "",
          notes: "",
        });
        setShowForm(false);
        loadData();
      } else {
        const err = await res.json();
        toast({
          title: "Error",
          description: err.message || "Failed to log movement",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to log movement",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SidebarLayout
      title="Stillage Tracking"
      subtitle="Track stillage container movements across depots"
      headerActions={
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Log Movement
        </Button>
      }
    >
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-bold text-[#0f2744] mb-4">
            Log Stillage Movement
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Depot
              </label>
              {isAdmin ? (
                <select
                  value={formData.depot}
                  onChange={(e) =>
                    setFormData({ ...formData, depot: e.target.value })
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
                  required
                >
                  <option value="">Select depot...</option>
                  {DEPOTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={formData.depot}
                  disabled
                  className="bg-slate-50"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
              </label>
              <Input
                type="date"
                value={formData.movementDate}
                onChange={(e) =>
                  setFormData({ ...formData, movementDate: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Collected
              </label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={formData.collected}
                onChange={(e) =>
                  setFormData({ ...formData, collected: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Dropped Off
              </label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={formData.droppedOff}
                onChange={(e) =>
                  setFormData({ ...formData, droppedOff: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Notes
              </label>
              <Input
                placeholder="Optional notes..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
              >
                {submitting ? "Saving..." : "Save Movement"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-[#0ea5e9] p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">
                Total In Circulation
              </p>
              <h3 className="text-3xl font-bold text-[#0f2744]">
                {totalInCirculation}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-[#0ea5e9]" />
            </div>
          </div>
          <div className="flex items-center text-sm">
            <TrendingUp className="w-4 h-4 text-[#0ea5e9] mr-1" />
            <span className="text-[#0ea5e9] font-medium">
              Across {summary.length} depots
            </span>
          </div>
        </div>

        {summary.slice(0, 3).map((s) => (
          <div
            key={s.depot}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1 truncate">
                  {s.depot}
                </p>
                <h3 className="text-2xl font-bold text-[#0f2744]">
                  {s.currentCount}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-400" />
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <ArrowUp className="w-3 h-3 text-green-500" />
                {s.totalCollected} in
              </span>
              <span className="flex items-center gap-1">
                <ArrowDown className="w-3 h-3 text-orange-500" />
                {s.totalDroppedOff} out
              </span>
            </div>
          </div>
        ))}
      </div>

      {isAdmin && summary.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-slate-200">
            <h3 className="text-lg font-bold text-[#0f2744]">
              Depot Summary
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Depot</th>
                  <th className="px-6 py-4 font-semibold text-center">
                    Collected
                  </th>
                  <th className="px-6 py-4 font-semibold text-center">
                    Dropped Off
                  </th>
                  <th className="px-6 py-4 font-semibold text-center">
                    Current Count
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.map((s, i) => (
                  <tr
                    key={s.depot}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      i % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    }`}
                  >
                    <td className="px-6 py-4 font-medium text-[#0f2744]">
                      {s.depot}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        <ArrowUp className="w-3 h-3 mr-1" />
                        {s.totalCollected}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge
                        variant="outline"
                        className="bg-orange-50 text-orange-700 border-orange-200"
                      >
                        <ArrowDown className="w-3 h-3 mr-1" />
                        {s.totalDroppedOff}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-lg font-bold ${
                          s.currentCount > 0
                            ? "text-[#0f2744]"
                            : s.currentCount === 0
                            ? "text-slate-400"
                            : "text-red-600"
                        }`}
                      >
                        {s.currentCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-400" />
            <h3 className="text-lg font-bold text-[#0f2744]">
              Movement History
            </h3>
          </div>
          {isAdmin && (
            <select
              value={selectedDepotFilter}
              onChange={(e) => setSelectedDepotFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
            >
              <option value="all">All Depots</option>
              {DEPOTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Depot</th>
                <th className="px-6 py-4 font-semibold text-center">
                  Collected
                </th>
                <th className="px-6 py-4 font-semibold text-center">
                  Dropped Off
                </th>
                <th className="px-6 py-4 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m, i) => (
                <tr
                  key={m.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    i % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                  }`}
                >
                  <td className="px-6 py-4 text-slate-700">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {formatDate(m.movementDate)}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-[#0f2744]">
                    {m.depot}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {m.collected > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        +{m.collected}
                      </Badge>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {m.droppedOff > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-orange-50 text-orange-700 border-orange-200"
                      >
                        -{m.droppedOff}
                      </Badge>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 max-w-[200px] truncate">
                    {m.notes || "-"}
                  </td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    No stillage movements recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SidebarLayout>
  );
}
