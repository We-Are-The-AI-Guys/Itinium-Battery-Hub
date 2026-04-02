import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft,
  Battery,
  FileText,
  CheckCircle2,
  Save,
  AlertTriangle,
  Truck,
  Receipt,
  Calculator,
  PoundSterling,
  ClipboardCheck,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SidebarLayout } from "@/components/sidebar-layout";
import { useToast } from "@/hooks/use-toast";

interface LmePrice {
  id: number;
  priceDate: string;
  usdPrice: string;
  exchangeRate: string;
  gbpPrice: string;
  source: string;
}

function calcValueGbp(
  pbContentKg: number | null,
  lmeGbpRate: number | null,
): number | null {
  if (pbContentKg === null || lmeGbpRate === null) return null;
  if (!isFinite(pbContentKg) || !isFinite(lmeGbpRate)) return null;
  const result = (pbContentKg * lmeGbpRate) / 1000;
  return isFinite(result) ? result : null;
}

interface JobData {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionPoint: string | null;
  collectionDate: string | null;
  submittedAt: string;
  tonnage: string;
  status: string;
  notes: string | null;
  invoiceStatus: string | null;
  lmeRateUsed: string | null;
  calculatedValue: string | null;
  cblLmeValue: string | null;
  cblLmePercent: string | null;
  cblLmePrice: string | null;
  transportCost: string | null;
  customerInvoiceValue: string | null;
  customerInvoiceNo: string | null;
  cblWasteAdviceNoteNo: string | null;
  cblDate: string | null;
  totalInvoiceValue: string | null;
  grossProfit: string | null;
  itiniumInvoiceNo: string | null;
  invoiceReceivedDate: string | null;
  dueDate: string | null;
  datePaid: string | null;
  daysToPay: number | null;
}

interface BatteryData {
  id: number;
  jobId: number;
  palletNumber: string | null;
  assetNumber: string | null;
  batterySerial: string | null;
  manufacture: string | null;
  cellType: string | null;
  voltage: string | null;
  looseCellsQty: number | null;
  notes: string | null;
  receiptConfirmed: boolean | null;
  pbContentKg: string | null;
  valueGbp: string | null;
  adminNotes: string | null;
  estimatedWeightKg: string | null;
  isLooseCells: boolean | null;
  serialFlagReason: string | null;
  rowPhoto: string | null;
}

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-teal-100 text-teal-800 border-teal-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  flagged: "bg-red-100 text-red-800 border-red-200",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [job, setJob] = useState<JobData | null>(null);
  const [batteries, setBatteries] = useState<BatteryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lmePrice, setLmePrice] = useState<LmePrice | null>(null);
  const cblLmeInitialRef = useRef<string | null>(null);

  const lmeGbpRate = lmePrice ? (isFinite(parseFloat(lmePrice.gbpPrice)) ? parseFloat(lmePrice.gbpPrice) : null) : null;

  const [financials, setFinancials] = useState({
    tonnage: "",
    cblLmeValue: "",
    cblLmePercent: "",
    cblLmePrice: "",
    transportCost: "",
    customerInvoiceValue: "",
    customerInvoiceNo: "",
    cblWasteAdviceNoteNo: "",
    cblDate: "",
    totalInvoiceValue: "",
    grossProfit: "",
    itiniumInvoiceNo: "",
    lmeRateUsed: "",
    invoiceStatus: "",
    invoiceReceivedDate: "",
    dueDate: "",
    datePaid: "",
  });

  const loadJob = useCallback(() => {
    fetch(`/api/jobs/${params.id}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setJob(data.job);
          setBatteries(data.batteries);
          cblLmeInitialRef.current = data.job.cblLmeValue || "";
          setFinancials({
            tonnage: data.job.tonnage || "",
            cblLmeValue: data.job.cblLmeValue || "",
            cblLmePercent: data.job.cblLmePercent || "",
            cblLmePrice: data.job.cblLmePrice || "",
            transportCost: data.job.transportCost || "",
            customerInvoiceValue: data.job.customerInvoiceValue || "",
            customerInvoiceNo: data.job.customerInvoiceNo || "",
            cblWasteAdviceNoteNo: data.job.cblWasteAdviceNoteNo || "",
            cblDate: data.job.cblDate || "",
            totalInvoiceValue: data.job.totalInvoiceValue || "",
            grossProfit: data.job.grossProfit || "",
            itiniumInvoiceNo: data.job.itiniumInvoiceNo || "",
            lmeRateUsed: data.job.lmeRateUsed || "",
            invoiceStatus: data.job.invoiceStatus || "pending_invoice",
            invoiceReceivedDate: data.job.invoiceReceivedDate || "",
            dueDate: data.job.dueDate || "",
            datePaid: data.job.datePaid || "",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    loadJob();
    fetch("/api/lme/current", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.price) setLmePrice(data.price); })
      .catch(() => {});
  }, [loadJob]);

  function getEffectiveLmeRate(): number | null {
    const cblRate = parseFloat(financials.cblLmeValue);
    if (isFinite(cblRate) && cblRate > 0) return cblRate;
    return lmeGbpRate;
  }

  function recalculateBattery(battery: BatteryData, rate?: number | null): { pb: string; value: string } {
    const pbNum = battery.pbContentKg ? parseFloat(battery.pbContentKg) : null;
    const effectiveRate = rate !== undefined ? rate : getEffectiveLmeRate();
    const valNum = calcValueGbp(pbNum, effectiveRate);
    return {
      pb: pbNum !== null && isFinite(pbNum) ? pbNum.toFixed(3) : "",
      value: valNum !== null ? valNum.toFixed(2) : "",
    };
  }

  function recalculateAll() {
    const rate = getEffectiveLmeRate();
    const updated = batteries.map((b) => {
      const { pb, value } = recalculateBattery(b, rate);
      return { ...b, pbContentKg: pb || b.pbContentKg, valueGbp: value || b.valueGbp };
    });
    setBatteries(updated);
    toast({ title: "Recalculated", description: "£ Value recalculated for all batteries using " + (parseFloat(financials.cblLmeValue) > 0 ? "CBL LME Value" : "latest LME price") + "." });
  }

  useEffect(() => {
    const tonnage = parseFloat(financials.tonnage) || 0;
    const lmeRate = parseFloat(financials.cblLmeValue) || 0;
    const lmePercent = parseFloat(financials.cblLmePercent) || 0;
    const computed = tonnage * lmeRate * (lmePercent / 100);
    setFinancials((prev) => ({ ...prev, cblLmePrice: computed.toFixed(2) }));
  }, [financials.tonnage, financials.cblLmeValue, financials.cblLmePercent]);

  useEffect(() => {
    const totalInvoice = parseFloat(financials.totalInvoiceValue) || 0;
    const transport = parseFloat(financials.transportCost) || 0;
    const cblLme = parseFloat(financials.cblLmePrice) || 0;
    const gp = totalInvoice - transport - cblLme;
    setFinancials((prev) => ({ ...prev, grossProfit: gp.toFixed(2) }));
  }, [financials.totalInvoiceValue, financials.transportCost, financials.cblLmePrice]);

  useEffect(() => {
    if (cblLmeInitialRef.current === null) return;
    if (financials.cblLmeValue === cblLmeInitialRef.current) return;
    cblLmeInitialRef.current = financials.cblLmeValue;
    const rate = parseFloat(financials.cblLmeValue);
    if (!isFinite(rate) || rate <= 0) return;
    setBatteries((prev) =>
      prev.map((b) => {
        const pbNum = b.pbContentKg ? parseFloat(b.pbContentKg) : null;
        const valNum = calcValueGbp(pbNum, rate);
        return valNum !== null ? { ...b, valueGbp: valNum.toFixed(2) } : b;
      })
    );
  }, [financials.cblLmeValue]);

  async function saveFinancials() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(financials),
      });
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        setFinancials((prev) => ({
          ...prev,
          invoiceStatus: data.job.invoiceStatus || prev.invoiceStatus,
          datePaid: data.job.datePaid || "",
          invoiceReceivedDate: data.job.invoiceReceivedDate || "",
          dueDate: data.job.dueDate || "",
        }));
        toast({ title: "Saved", description: "Financial details updated successfully." });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(newStatus: string) {
    try {
      const res = await fetch(`/api/jobs/${params.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        toast({ title: "Status updated", description: `Job marked as ${newStatus}.` });
      } else {
        toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error.", variant: "destructive" });
    }
  }

  async function updateBatteryAdmin(batteryId: number, updates: Record<string, string | boolean | null>) {
    try {
      const res = await fetch(`/api/jobs/${params.id}/batteries/${batteryId}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setBatteries((prev) =>
          prev.map((b) => (b.id === batteryId ? data.battery : b))
        );
        toast({ title: "Saved", description: "Battery details updated." });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update battery.", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <SidebarLayout title="Job Detail" subtitle="Loading...">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
        </div>
      </SidebarLayout>
    );
  }

  if (!job) {
    return (
      <SidebarLayout title="Job Not Found" subtitle="The requested job does not exist">
        <div className="text-center py-20">
          <p className="text-slate-500 mb-4">Job not found or you don't have access.</p>
          <Button onClick={() => setLocation("/jobs")}>Back to Jobs</Button>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout title={`Job ${job.reference}`} subtitle={`${job.clientName} — ${job.depot}`}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setLocation("/jobs")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#0f2744] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Jobs
          </button>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`font-medium capitalize text-sm px-3 py-1 ${statusStyles[job.status] || ""}`}>
              {job.status}
            </Badge>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-l-4 border-[#0ea5e9] px-6 py-4 bg-slate-50/50 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="font-bold text-[#0f2744] text-lg">Collection Details</h3>
              <span className="text-sm text-slate-500">(Depot Submitted — Read Only)</span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Reference</p>
                <p className="text-sm font-semibold text-[#0f2744]">{job.reference}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Customer</p>
                <p className="text-sm font-semibold text-[#0f2744]">{job.clientName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Depot</p>
                <p className="text-sm text-slate-700">{job.depot}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Collection Point</p>
                <p className="text-sm text-slate-700">{job.collectionPoint || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Collection Date</p>
                <p className="text-sm text-slate-700">{formatDate(job.collectionDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Submitted</p>
                <p className="text-sm text-slate-700">{formatDate(job.submittedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Tonnage (Depot)</p>
                <p className="text-sm text-slate-700">{parseFloat(job.tonnage).toFixed(3)}t</p>
              </div>
              {job.notes && (
                <div className="col-span-2 md:col-span-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-1">Notes</p>
                  <p className="text-sm text-slate-700">{job.notes}</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Battery className="w-4 h-4 text-[#0ea5e9]" />
                <h4 className="font-semibold text-[#0f2744]">Battery Items ({batteries.length})</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-100">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Pallet</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Asset</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Serial</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Manufacture</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Cell Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Voltage</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Loose Qty</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Flags</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {batteries.map((b, i) => (
                      <tr key={b.id} className={`${b.serialFlagReason ? "bg-amber-50/60 border-l-4 border-l-amber-400" : (i % 2 === 0 ? "bg-white" : "bg-slate-50/30")}`}>
                        <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2.5 text-slate-700">{b.palletNumber || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-700">{b.assetNumber || "—"}</td>
                        <td className="px-3 py-2.5 font-medium text-[#0f2744]">{b.batterySerial || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-700">{b.manufacture || "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs">{b.cellType || "—"}</Badge>
                            {b.isLooseCells && (
                              <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">Loose</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{b.voltage || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-700">{b.looseCellsQty ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {b.serialFlagReason ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 w-fit">
                                <AlertTriangle className="w-3 h-3" />
                                Needs Review
                              </span>
                              <span className="text-[10px] text-amber-700">{b.serialFlagReason}</span>
                              {b.rowPhoto && (
                                <a href={b.rowPhoto} target="_blank" rel="noreferrer" className="text-[10px] text-[#0ea5e9] hover:underline">View Photo</a>
                              )}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate">{b.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-l-4 border-green-500 px-6 py-4 bg-slate-50/50 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-green-600" />
              <h3 className="font-bold text-[#0f2744] text-lg">Itinium to Complete</h3>
              <span className="text-sm text-slate-500">(Admin Section)</span>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-[#0f2744] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Battery Receipt Confirmation & Pb Content
                </h4>
                <div className="flex items-center gap-3">
                  {lmePrice && (
                    <div className="flex items-center gap-1.5 text-xs bg-sky-50 border border-sky-200 rounded-md px-2.5 py-1.5">
                      <PoundSterling className="w-3 h-3 text-sky-600" />
                      <span className="text-slate-500">LME GBP:</span>
                      <span className="font-semibold text-sky-700">£{parseFloat(lmePrice.gbpPrice).toFixed(2)}/t</span>
                      <span className="text-slate-400">({lmePrice.priceDate})</span>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={recalculateAll}
                    disabled={getEffectiveLmeRate() === null}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Recalculate All
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-100">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Serial / Pallet</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Voltage</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Receipt Confirmed</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Pb Content (Kg)</th>
                      <th className="px-3 py-2.5 text-left font-semibold">£ Value</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Admin Notes</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {batteries.map((b, i) => (
                      <BatteryAdminRow
                        key={b.id}
                        battery={b}
                        index={i}
                        onSave={updateBatteryAdmin}
                        lmeGbpRate={getEffectiveLmeRate()}
                      />
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-right font-bold text-[#0f2744] text-xs uppercase">
                        Totals
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[#0f2744]">
                        {batteries.reduce((sum, b) => sum + (parseFloat(b.pbContentKg || "0") || 0), 0).toFixed(3)} kg
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[#0f2744]">
                        £{batteries.reduce((sum, b) => sum + (parseFloat(b.valueGbp || "0") || 0), 0).toFixed(2)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h4 className="font-semibold text-[#0f2744] mb-4 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#0ea5e9]" />
                Financial Details (Master Job Log)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FinancialField
                  label="Actual Tonnage"
                  value={financials.tonnage}
                  onChange={(v) => setFinancials((p) => ({ ...p, tonnage: v }))}
                  icon={<Truck className="w-3.5 h-3.5" />}
                  suffix="t"
                />
                <FinancialField
                  label="CBL LME Value £"
                  value={financials.cblLmeValue}
                  onChange={(v) => setFinancials((p) => ({ ...p, cblLmeValue: v }))}
                  icon={<PoundSterling className="w-3.5 h-3.5" />}
                  prefix="£"
                />
                <FinancialField
                  label="CBL LME %"
                  value={financials.cblLmePercent}
                  onChange={(v) => setFinancials((p) => ({ ...p, cblLmePercent: v }))}
                  suffix="%"
                />
                <FinancialField
                  label="CBL £ LME (Calculated)"
                  value={financials.cblLmePrice}
                  onChange={(v) => setFinancials((p) => ({ ...p, cblLmePrice: v }))}
                  prefix="£"
                  computed
                />
                <FinancialField
                  label="Transport Cost"
                  value={financials.transportCost}
                  onChange={(v) => setFinancials((p) => ({ ...p, transportCost: v }))}
                  prefix="£"
                />
                <FinancialField
                  label="Customer Invoice Value £"
                  value={financials.customerInvoiceValue}
                  onChange={(v) => setFinancials((p) => ({ ...p, customerInvoiceValue: v }))}
                  prefix="£"
                />
                <FinancialField
                  label="Customer Invoice No."
                  value={financials.customerInvoiceNo}
                  onChange={(v) => setFinancials((p) => ({ ...p, customerInvoiceNo: v }))}
                  icon={<Receipt className="w-3.5 h-3.5" />}
                  type="text"
                />
                <FinancialField
                  label="CBL Waste Advice Note No."
                  value={financials.cblWasteAdviceNoteNo}
                  onChange={(v) => setFinancials((p) => ({ ...p, cblWasteAdviceNoteNo: v }))}
                  type="text"
                />
                <FinancialField
                  label="CBL Date"
                  value={financials.cblDate}
                  onChange={(v) => setFinancials((p) => ({ ...p, cblDate: v }))}
                  type="date"
                />
                <FinancialField
                  label="Total Invoice Value £"
                  value={financials.totalInvoiceValue}
                  onChange={(v) => setFinancials((p) => ({ ...p, totalInvoiceValue: v }))}
                  prefix="£"
                />
                <FinancialField
                  label="Gross Profit £ (Calculated)"
                  value={financials.grossProfit}
                  onChange={(v) => setFinancials((p) => ({ ...p, grossProfit: v }))}
                  prefix="£"
                  computed
                />
                <FinancialField
                  label="Itinium Invoice No."
                  value={financials.itiniumInvoiceNo}
                  onChange={(v) => setFinancials((p) => ({ ...p, itiniumInvoiceNo: v }))}
                  type="text"
                />
              </div>

              <div className="border-t border-slate-100 pt-4 mt-4">
                <h5 className="text-sm font-semibold text-[#0f2744] mb-3 flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5 text-[#0ea5e9]" />
                  Invoice Payment Tracking
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FinancialField
                    label="Invoice Received Date"
                    value={financials.invoiceReceivedDate}
                    onChange={(v) => setFinancials((p) => ({ ...p, invoiceReceivedDate: v }))}
                    type="date"
                  />
                  <FinancialField
                    label="Due Date"
                    value={financials.dueDate}
                    onChange={(v) => setFinancials((p) => ({ ...p, dueDate: v }))}
                    type="date"
                  />
                  <FinancialField
                    label="Date Paid"
                    value={financials.datePaid}
                    onChange={(v) => setFinancials((p) => ({ ...p, datePaid: v }))}
                    type="date"
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <span className="text-[#0ea5e9] text-[10px]">(auto)</span>
                      Days to Pay
                    </label>
                    <div className="h-9 flex items-center px-3 text-sm font-medium rounded-md border border-slate-200 bg-sky-50/50">
                      {job.daysToPay !== null && job.daysToPay !== undefined ? (
                        <span className={job.daysToPay > 30 ? "text-red-600" : job.daysToPay > 14 ? "text-amber-600" : "text-green-600"}>
                          {job.daysToPay} days
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Invoice Status</label>
                <div className="flex gap-2">
                  {[
                    { value: "pending_invoice", label: "Pending" },
                    { value: "invoiced", label: "Invoiced" },
                    { value: "paid", label: "Paid" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFinancials((p) => ({ ...p, invoiceStatus: opt.value }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                        financials.invoiceStatus === opt.value
                          ? "bg-[#0ea5e9] text-white border-[#0ea5e9]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <Button
                  onClick={saveFinancials}
                  disabled={saving}
                  className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Financial Details"}
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h4 className="font-semibold text-[#0f2744] mb-3">Update Job Status</h4>
              <div className="flex flex-wrap gap-2">
                {job.status !== "approved" && (
                  <Button
                    variant="outline"
                    className="border-teal-300 text-teal-700 hover:bg-teal-50"
                    onClick={() => updateStatus("approved")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Approve
                  </Button>
                )}
                {job.status !== "completed" && (
                  <Button
                    variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => updateStatus("completed")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Complete
                  </Button>
                )}
                {job.status !== "flagged" && (
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => updateStatus("flagged")}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1.5" />
                    Flag Exception
                  </Button>
                )}
                {job.status !== "pending" && (
                  <Button
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => updateStatus("pending")}
                  >
                    Reset to Pending
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}

function BatteryAdminRow({
  battery,
  index,
  onSave,
  lmeGbpRate,
}: {
  battery: BatteryData;
  index: number;
  onSave: (id: number, updates: Record<string, string | boolean | null>) => void;
  lmeGbpRate: number | null;
}) {
  const [receipt, setReceipt] = useState(battery.receiptConfirmed ?? false);
  const [pb, setPb] = useState(battery.pbContentKg || "");
  const [value, setValue] = useState(battery.valueGbp || "");
  const [notes, setNotes] = useState(battery.adminNotes || "");
  const [isAutoCalced, setIsAutoCalced] = useState(false);

  useEffect(() => {
    setPb(battery.pbContentKg || "");
    setValue(battery.valueGbp || "");
  }, [battery.pbContentKg, battery.valueGbp]);

  useEffect(() => {
    if (lmeGbpRate === null) return;
    const pbNum = battery.pbContentKg ? parseFloat(battery.pbContentKg) : null;
    if (pbNum !== null && isFinite(pbNum) && !battery.valueGbp) {
      const valNum = calcValueGbp(pbNum, lmeGbpRate);
      if (valNum !== null) {
        setValue(valNum.toFixed(2));
        setIsAutoCalced(true);
      }
    }
  }, [battery.pbContentKg, battery.valueGbp, lmeGbpRate]);

  function handleRecalculate() {
    const pbNum = pb ? parseFloat(pb) : null;
    const valNum = calcValueGbp(pbNum, lmeGbpRate);
    if (valNum !== null) setValue(valNum.toFixed(2));
    setIsAutoCalced(true);
  }

  const canRecalculate = pb && lmeGbpRate !== null;

  return (
    <tr className={index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}>
      <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
      <td className="px-3 py-2.5 text-slate-700 font-medium">
        {battery.batterySerial || battery.palletNumber || "—"}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant="outline" className="text-xs">{battery.cellType || "—"}</Badge>
      </td>
      <td className="px-3 py-2.5 text-slate-700">{battery.voltage || "—"}</td>
      <td className="px-3 py-2.5 text-center">
        <Switch
          checked={receipt}
          onCheckedChange={(checked) => {
            setReceipt(checked);
          }}
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          step="0.001"
          placeholder="0.000"
          className={`h-8 w-24 text-sm ${isAutoCalced && pb ? "bg-sky-50 border-sky-200" : "bg-slate-50"}`}
          value={pb}
          onChange={(e) => { setPb(e.target.value); setIsAutoCalced(false); }}
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          step="0.01"
          placeholder="0.00"
          className={`h-8 w-24 text-sm ${isAutoCalced && value ? "bg-sky-50 border-sky-200" : "bg-slate-50"}`}
          value={value}
          onChange={(e) => { setValue(e.target.value); setIsAutoCalced(false); }}
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          placeholder="Notes..."
          className="h-8 w-36 text-sm bg-slate-50"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {canRecalculate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleRecalculate}
              title="Recalculate Pb & Value"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              onSave(battery.id, {
                receiptConfirmed: receipt,
                pbContentKg: pb || null,
                valueGbp: value || null,
                adminNotes: notes || null,
              })
            }
          >
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}

function FinancialField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  icon,
  type = "number",
  computed = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  icon?: React.ReactNode;
  type?: string;
  computed?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
        {icon && <span className="text-slate-400">{icon}</span>}
        {label}
        {computed && <span className="text-[#0ea5e9] text-[10px]">(auto)</span>}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{prefix}</span>
        )}
        <Input
          type={type}
          step={type === "number" ? "0.01" : undefined}
          className={`h-9 text-sm border-slate-200 focus-visible:ring-[#0ea5e9] ${
            prefix ? "pl-7" : ""
          } ${suffix ? "pr-7" : ""} ${computed ? "bg-sky-50/50 font-medium" : "bg-slate-50"}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={computed}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
        )}
      </div>
    </div>
  );
}
