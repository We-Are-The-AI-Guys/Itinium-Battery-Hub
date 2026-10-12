import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  Scale,
  Receipt,
  PoundSterling,
  Percent,
  CalendarClock,
  AlertTriangle,
  Package,
  Printer,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarLayout } from "@/components/sidebar-layout";

interface MonthData {
  month: string;
  jobCount: number;
  tonnage: number;
  invoiceValue: number;
  grossProfit: number;
  grossMarginPct: number;
  avgCblLmePct: number;
  avgDaysToPay: number;
  overdueCount: number;
  overdueValue: number;
}

interface KpiTotals {
  jobCount: number;
  tonnage: number;
  invoiceValue: number;
  grossProfit: number;
  grossMarginPct: number;
  avgCblLmePct: number;
  avgDaysToPay: number;
  overdueCount: number;
  overdueValue: number;
}

interface KpiData {
  months: MonthData[];
  totals: KpiTotals;
  statusBreakdown: Record<string, number>;
}

interface Client {
  id: number;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  request: "Requested",
  confirmed: "Confirmed",
  received: "Received",
  invoice: "Invoice",
  awaiting_invoice: "Awaiting Invoice",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  request: "#f59e0b",
  confirmed: "#14b8a6",
  received: "#3b82f6",
  invoice: "#8b5cf6",
  awaiting_invoice: "#f97316",
  completed: "#10b981",
};

const RANGES = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "YTD", months: 0 },
];

function formatMonthLabel(m: string) {
  const [yr, mo] = m.split("-").map(Number);
  return new Date(yr, mo - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatCurrencyDecimal(v: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function computeDateRange(rangeLabel: string): { from: string; to: string } {
  const now = new Date();
  const toMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (rangeLabel === "YTD") {
    const from = `${now.getFullYear()}-01`;
    return { from, to: toMonth };
  }

  const months = RANGES.find((r) => r.label === rangeLabel)?.months ?? 6;
  const fromDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
  return { from, to: toMonth };
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  alert?: boolean;
}

function StatCard({ label, value, sub, color, icon, alert }: StatCardProps) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 p-5 hover:shadow-md transition-shadow print:shadow-none print:border print:rounded-lg`}
      style={{ borderLeftColor: color }}
    >
      <div className="flex justify-between items-start mb-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "18" }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className={`text-2xl font-bold ${alert ? "text-red-600" : "text-[#0f2744]"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

const CustomTooltipCurrency = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-[#0f2744] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name?.toLowerCase().includes("tonnage")
            ? `${Number(p.value).toFixed(1)}t`
            : formatCurrencyDecimal(p.value)}
        </p>
      ))}
    </div>
  );
};

const CustomTooltipOps = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-[#0f2744] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name === "Tonnage (t)" ? `${Number(p.value).toFixed(1)}t` : p.value}
        </p>
      ))}
    </div>
  );
};

export default function KpiPage() {
  const [range, setRange] = useState("6M");
  const [clientId, setClientId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u?.user?.role === "head_office_admin") {
          setIsAdmin(true);
          fetch("/api/clients", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.clients) setClients(d.clients); })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    const { from, to } = computeDateRange(range);
    const params = new URLSearchParams({ from, to });
    if (clientId) params.set("clientId", clientId);

    fetch(`/api/kpi/summary?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
        else setError(true);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [range, clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const chartData = (data?.months ?? []).map((m) => ({
    month: formatMonthLabel(m.month),
    Jobs: m.jobCount,
    "Tonnage (t)": m.tonnage,
    "Invoice Value": m.invoiceValue,
    "Gross Profit": m.grossProfit,
  }));

  const totalStatusJobs = Object.values(data?.statusBreakdown ?? {}).reduce((a, b) => a + b, 0);

  return (
    <>
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          aside { display: none !important; }
          header { display: none !important; }
          body { background: white !important; }
          main {
            margin-left: 0 !important;
            width: 100% !important;
          }
          .recharts-wrapper { page-break-inside: avoid; }
          .kpi-table { page-break-inside: avoid; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <SidebarLayout title="KPI Reporting" subtitle="Financial & operational performance">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 print-hide">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setRange(r.label)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    range === r.label
                      ? "bg-white text-[#0f2744] shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {isAdmin && clients.length > 0 && (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-[#0f2744] focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30"
              >
                <option value="">All Clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="print-hide"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="print-hide"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print / Save PDF
            </Button>
          </div>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && !data && (
          <div className="text-center py-20">
            <p className="text-slate-500 mb-4">Couldn't load KPI data — please try again.</p>
            <Button onClick={loadData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Jobs"
                value={String(data.totals.jobCount)}
                color="#0ea5e9"
                icon={<Package className="w-4 h-4" />}
              />
              <StatCard
                label="Total Tonnage"
                value={`${data.totals.tonnage.toFixed(1)}t`}
                color="#14b8a6"
                icon={<Scale className="w-4 h-4" />}
              />
              <StatCard
                label="Invoice Value"
                value={formatCurrency(data.totals.invoiceValue)}
                color="#10b981"
                icon={<Receipt className="w-4 h-4" />}
              />
              <StatCard
                label="Gross Profit"
                value={formatCurrency(data.totals.grossProfit)}
                sub={data.totals.grossMarginPct > 0 ? `${data.totals.grossMarginPct.toFixed(1)}% margin` : undefined}
                color="#8b5cf6"
                icon={<PoundSterling className="w-4 h-4" />}
              />
              <StatCard
                label="Avg CBL LME %"
                value={data.totals.avgCblLmePct > 0 ? `${data.totals.avgCblLmePct.toFixed(1)}%` : "—"}
                color="#f59e0b"
                icon={<Percent className="w-4 h-4" />}
              />
              <StatCard
                label="Avg Days to Pay"
                value={data.totals.avgDaysToPay > 0 ? `${data.totals.avgDaysToPay.toFixed(0)}` : "—"}
                color="#6366f1"
                icon={<CalendarClock className="w-4 h-4" />}
              />
              <StatCard
                label="Overdue Invoices"
                value={String(data.totals.overdueCount)}
                sub={data.totals.overdueCount > 0 ? formatCurrency(data.totals.overdueValue) + " overdue" : undefined}
                color={data.totals.overdueCount > 0 ? "#ef4444" : "#10b981"}
                icon={<AlertTriangle className="w-4 h-4" />}
                alert={data.totals.overdueCount > 0}
              />
              <StatCard
                label="Gross Margin"
                value={data.totals.grossMarginPct > 0 ? `${data.totals.grossMarginPct.toFixed(1)}%` : "—"}
                color="#0f2744"
                icon={<TrendingUp className="w-4 h-4" />}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:shadow-none">
                <h3 className="font-bold text-[#0f2744] mb-4">Monthly Jobs & Tonnage</h3>
                {chartData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                    No data for selected period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#64748b" }} unit="t" />
                      <Tooltip content={<CustomTooltipOps />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="Jobs" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={40} />
                      <Line yAxisId="right" type="monotone" dataKey="Tonnage (t)" stroke="#14b8a6" strokeWidth={2} dot={{ fill: "#14b8a6", r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:shadow-none">
                <h3 className="font-bold text-[#0f2744] mb-4">Monthly Financial Performance</h3>
                {chartData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                    No data for selected period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltipCurrency />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Invoice Value" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="Gross Profit" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:shadow-none">
                <h3 className="font-bold text-[#0f2744] mb-4">Job Status Breakdown</h3>
                {totalStatusJobs === 0 ? (
                  <p className="text-slate-400 text-sm">No jobs in selected period</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(STATUS_LABELS).map(([key, label]) => {
                      const count = data.statusBreakdown[key] ?? 0;
                      const pct = totalStatusJobs > 0 ? (count / totalStatusJobs) * 100 : 0;
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-sm mb-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                                style={{ backgroundColor: STATUS_COLORS[key] }}
                              />
                              <span className="text-slate-700">{label}</span>
                            </div>
                            <span className="font-semibold text-[#0f2744]">{count}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[key] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-[#0f2744]">Month-by-Month Breakdown</h3>
                </div>
                <div className="overflow-x-auto kpi-table">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Month</th>
                        <th className="px-4 py-3 font-semibold text-right">Jobs</th>
                        <th className="px-4 py-3 font-semibold text-right">Tonnage</th>
                        <th className="px-4 py-3 font-semibold text-right">Invoice Value</th>
                        <th className="px-4 py-3 font-semibold text-right">Gross Profit</th>
                        <th className="px-4 py-3 font-semibold text-right">Margin</th>
                        <th className="px-4 py-3 font-semibold text-right">Avg LME %</th>
                        <th className="px-4 py-3 font-semibold text-right">Avg Days Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.months.map((m, i) => (
                        <tr
                          key={m.month}
                          className={`${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} hover:bg-slate-50`}
                        >
                          <td className="px-4 py-3 font-medium text-[#0f2744]">
                            {formatMonthLabel(m.month)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">{m.jobCount}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{m.tonnage.toFixed(1)}t</td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {m.invoiceValue > 0 ? formatCurrencyDecimal(m.invoiceValue) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {m.grossProfit !== 0 ? (
                              <span className={m.grossProfit >= 0 ? "text-emerald-700" : "text-red-600"}>
                                {formatCurrencyDecimal(m.grossProfit)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {m.grossMarginPct > 0 ? `${m.grossMarginPct.toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {m.avgCblLmePct > 0 ? `${m.avgCblLmePct.toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {m.avgDaysToPay > 0 ? m.avgDaysToPay.toFixed(0) : "—"}
                          </td>
                        </tr>
                      ))}
                      {data.months.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                            No jobs in selected period
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {data.months.length > 0 && (
                      <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                        <tr>
                          <td className="px-4 py-3 text-[#0f2744]">Total / Average</td>
                          <td className="px-4 py-3 text-right text-[#0f2744]">{data.totals.jobCount}</td>
                          <td className="px-4 py-3 text-right text-[#0f2744]">{data.totals.tonnage.toFixed(1)}t</td>
                          <td className="px-4 py-3 text-right text-[#0f2744]">
                            {data.totals.invoiceValue > 0 ? formatCurrencyDecimal(data.totals.invoiceValue) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-[#0f2744]">
                            {data.totals.grossProfit !== 0 ? formatCurrencyDecimal(data.totals.grossProfit) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-[#0f2744]">
                            {data.totals.grossMarginPct > 0 ? `${data.totals.grossMarginPct.toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-[#0f2744]">
                            {data.totals.avgCblLmePct > 0 ? `${data.totals.avgCblLmePct.toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-[#0f2744]">
                            {data.totals.avgDaysToPay > 0 ? data.totals.avgDaysToPay.toFixed(0) : "—"}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </SidebarLayout>
    </>
  );
}
