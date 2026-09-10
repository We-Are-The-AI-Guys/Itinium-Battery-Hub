import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  rankCellTypeSuggestions,
  manufacturerMatches,
  type CellModelLite,
} from "@/lib/cell-type-suggestions";
import { rankManufacturerSuggestions } from "@/lib/manufacturer-suggestions";
import {
  calculateCblLmeValue,
  calculateCustomerLmeValue,
  calculateGrossProfit,
} from "@/lib/financial-calculations";
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
  Download,
  Pencil,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SidebarLayout } from "@/components/sidebar-layout";
import { JobDocumentsPanel } from "@/components/job-documents";
import { useToast } from "@/hooks/use-toast";

interface LmePrice {
  id: number;
  priceDate: string;
  usdPrice: string;
  exchangeRate: string;
  gbpPrice: string;
  source: string;
}

interface PreviousMonthAverage {
  month: string;
  averageGbpPrice: string | null;
  sampleCount: number;
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
  customerLmePercent: string | null;
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
  siteContacts: string | null;
  siteHours: string | null;
  specialInstructions: string | null;
  driverName: string | null;
  vehicleReg: string | null;
  proposedCollectionDate: string | null;
  scheduleStatus: string;
  receiptSentAt: string | null;
  receiptClientDeliveryStatus: string | null;
  receiptAccountsDeliveryStatus: string | null;
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
  receiptReviewed: boolean;
  pbContentKg: string | null;
  valueGbp: string | null;
  adminNotes: string | null;
  estimatedWeightKg: string | null;
  isLooseCells: boolean | null;
  serialFlagReason: string | null;
  manufacturerFlagReason: string | null;
  cellModelFlagReason: string | null;
  voltageFlagReason: string | null;
  rowPhoto: string | null;
  resolvedById: number | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

interface ReceiptDeliveryInfo {
  ready: boolean;
  reviewedCount: number;
  totalCount: number;
  totalValue: string;
  clientRecipients: Array<{ email: string; fullName: string }>;
  accountsRecipients: Array<{ email: string; fullName: string }>;
  sentAt: string | null;
  clientStatus: string | null;
  accountsStatus: string | null;
}

const statusStyles: Record<string, string> = {
  request: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-teal-100 text-teal-800 border-teal-200",
  received: "bg-blue-100 text-blue-800 border-blue-200",
  invoice: "bg-violet-100 text-violet-800 border-violet-200",
  awaiting_invoice: "bg-orange-100 text-orange-800 border-orange-200",
  completed: "bg-green-100 text-green-800 border-green-200",
};

const statusLabels: Record<string, string> = {
  request: "Request",
  confirmed: "Confirmed",
  received: "Received",
  invoice: "Invoice",
  awaiting_invoice: "Awaiting Invoice",
  completed: "Completed",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const API_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

async function downloadFromApi(url: string, fallbackFilename: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.message) message = err.message;
    } catch {}
    throw new Error(message);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match ? match[1] : fallbackFilename;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [job, setJob] = useState<JobData | null>(null);
  const [batteries, setBatteries] = useState<BatteryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoConfirming, setAutoConfirming] = useState(false);
  const [lmePrice, setLmePrice] = useState<LmePrice | null>(null);
  const [previousMonthAverage, setPreviousMonthAverage] = useState<PreviousMonthAverage | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);
  const cblLmeInitialRef = useRef<string | null>(null);
  const lmePriceRef = useRef<LmePrice | null>(null);
  const lmePrefillDoneRef = useRef(false);
  const [prefilled, setPrefilled] = useState<Record<string, boolean>>({});

  const lmeGbpRate = lmePrice ? (isFinite(parseFloat(lmePrice.gbpPrice)) ? parseFloat(lmePrice.gbpPrice) : null) : null;

  const [financials, setFinancials] = useState({
    tonnage: "",
    cblLmeValue: "",
    cblLmePercent: "",
    cblLmePrice: "",
    transportCost: "",
    customerLmePercent: "",
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

  const [siteDetails, setSiteDetails] = useState({
    siteContacts: "",
    siteHours: "",
    specialInstructions: "",
    collectionDate: "",
  });
  const [savingSiteDetails, setSavingSiteDetails] = useState(false);
  const [downloadingCollectionSheet, setDownloadingCollectionSheet] = useState(false);
  const [receiptDelivery, setReceiptDelivery] = useState<ReceiptDeliveryInfo | null>(null);
  const [loadingReceiptDelivery, setLoadingReceiptDelivery] = useState(false);
  const [sendingReceiptDelivery, setSendingReceiptDelivery] = useState(false);
  const [cellModels, setCellModels] = useState<CellModelLite[]>([]);
  const [manufacturerList, setManufacturerList] = useState<{
    manufacturers: string[];
    aliases: Record<string, string>;
  } | null>(null);

  // Reviewers can edit cell type / manufacturer on any row (including
  // resolved and never-flagged ones) to fix later-discovered mistakes.
  const canEditResolved = userRole === "accounts" || userRole === "head_office_admin";

  const hasFlaggedCellTypes = batteries.some((b) => b.cellModelFlagReason);
  const hasFlaggedManufacturers = batteries.some((b) => b.manufacturerFlagReason);

  useEffect(() => {
    if ((!hasFlaggedManufacturers && !canEditResolved) || manufacturerList) return;
    let cancelled = false;
    fetch("/api/manufacturers", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.manufacturers)) {
          setManufacturerList({
            manufacturers: data.manufacturers,
            aliases: data.aliases || {},
          });
        }
      })
      .catch(() => {
        // Suggestions are a convenience — the plain edit box still works.
      });
    return () => {
      cancelled = true;
    };
  }, [hasFlaggedManufacturers, canEditResolved, manufacturerList]);

  useEffect(() => {
    if ((!hasFlaggedCellTypes && !canEditResolved) || cellModels.length > 0) return;
    let cancelled = false;
    fetch("/api/cell-models", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.models) setCellModels(data.models);
      })
      .catch(() => {
        // Suggestions are a convenience — the plain edit box still works.
      });
    return () => {
      cancelled = true;
    };
  }, [hasFlaggedCellTypes, canEditResolved, cellModels.length]);

  const loadJob = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    fetch(`/api/jobs/${params.id}`, { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          return { ok: true as const, data: await res.json() };
        }
        return { ok: false as const, status: res.status };
      })
      .then((result) => {
        if (result.ok) {
          const data = result.data;
          setJob(data.job);
          setBatteries(data.batteries);

          const prefilledFlags: Record<string, boolean> = {};

          let cblLmeValue = data.job.cblLmeValue || "";
          if (!cblLmeValue && lmePriceRef.current) {
            const gbp = parseFloat(lmePriceRef.current.gbpPrice);
            if (isFinite(gbp) && gbp > 0) {
              cblLmeValue = gbp.toFixed(2);
              prefilledFlags.cblLmeValue = true;
              lmePrefillDoneRef.current = true;
            }
          }
          cblLmeInitialRef.current = cblLmeValue;

          let totalInvoiceValue = data.job.totalInvoiceValue || "";
          if (!totalInvoiceValue) {
            const batteryValueSum = (data.batteries as BatteryData[]).reduce(
              (sum: number, b: BatteryData) => sum + (parseFloat(b.valueGbp || "0") || 0), 0
            );
            totalInvoiceValue = batteryValueSum.toFixed(2);
            prefilledFlags.totalInvoiceValue = true;
          }

          setPrefilled(prefilledFlags);

          setFinancials({
            tonnage: data.job.tonnage || "",
            cblLmeValue,
            cblLmePercent: data.job.cblLmePercent || "",
            cblLmePrice: data.job.cblLmePrice || "",
            transportCost: data.job.transportCost || "",
            customerLmePercent: data.job.customerLmePercent || "",
            customerInvoiceValue: data.job.customerInvoiceValue || "",
            customerInvoiceNo: data.job.customerInvoiceNo || "",
            cblWasteAdviceNoteNo: data.job.cblWasteAdviceNoteNo || "",
            cblDate: data.job.cblDate || "",
            totalInvoiceValue,
            grossProfit: data.job.grossProfit || "",
            itiniumInvoiceNo: data.job.itiniumInvoiceNo || "",
            lmeRateUsed: data.job.lmeRateUsed || "",
            invoiceStatus: data.job.invoiceStatus || "pending_invoice",
            invoiceReceivedDate: data.job.invoiceReceivedDate || "",
            dueDate: data.job.dueDate || "",
            datePaid: data.job.datePaid || "",
          });

          setSiteDetails({
            siteContacts: data.job.siteContacts || "",
            siteHours: data.job.siteHours || "",
            specialInstructions: data.job.specialInstructions || "",
            collectionDate: data.job.collectionDate || "",
          });
        } else if (result.status === 404) {
          setLoadError("not_found");
        } else {
          setLoadError("error");
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError("error");
        setLoading(false);
      });
  }, [params.id]);

  useEffect(() => {
    loadJob();
    fetch("/api/lme/current", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.price) {
          lmePriceRef.current = data.price;
          setLmePrice(data.price);
        }
        if (data?.previousMonthAverage) {
          setPreviousMonthAverage(data.previousMonthAverage);
        }
      })
      .catch(() => {});
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role) setUserRole(data.user.role);
      })
      .catch(() => {});
  }, [loadJob]);

  async function handleDownloadInvoice() {
    if (!job) return;
    setDownloadingInvoice(true);
    try {
      await downloadFromApi(
        `${API_BASE}/api/jobs/${job.id}/invoice.pdf`,
        `invoice-${job.reference.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`
      );
    } catch (e) {
      toast({
        title: "Invoice download failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingInvoice(false);
    }
  }

  async function handleDownloadCollectionSheet() {
    if (!job) return;
    setDownloadingCollectionSheet(true);
    try {
      await downloadFromApi(
        `${API_BASE}/api/jobs/${job.id}/collection-sheet.pdf`,
        `collection-sheet-${job.reference.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`
      );
    } catch (e) {
      toast({
        title: "Collection sheet download failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingCollectionSheet(false);
    }
  }

  async function saveSiteDetails() {
    setSavingSiteDetails(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(siteDetails),
      });
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        toast({ title: "Saved", description: "Collection sheet details updated." });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error.", variant: "destructive" });
    } finally {
      setSavingSiteDetails(false);
    }
  }

  useEffect(() => {
    if (!lmePrice) return;
    if (lmePrefillDoneRef.current) return;
    if (financials.cblLmeValue) return;
    const gbp = parseFloat(lmePrice.gbpPrice);
    if (!isFinite(gbp) || gbp <= 0) return;
    const newVal = gbp.toFixed(2);
    cblLmeInitialRef.current = newVal;
    lmePrefillDoneRef.current = true;
    setFinancials((prev) => ({ ...prev, cblLmeValue: newVal }));
    setPrefilled((pf) => ({ ...pf, cblLmeValue: true }));
  }, [lmePrice, financials.cblLmeValue]);

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

  async function recalculateAll() {
    const rate = getEffectiveLmeRate();
    try {
      const res = await fetch(`/api/jobs/${params.id}/recalculate-pb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(rate !== null ? { lmeGbpRate: rate } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        const byId = new Map<number, { pbContentKg: string | null; valueGbp: string | null }>(
          (data.batteries || []).map((b: { id: number; pbContentKg: string | null; valueGbp: string | null }) => [
            b.id,
            { pbContentKg: b.pbContentKg, valueGbp: b.valueGbp },
          ])
        );
        setBatteries((prev) =>
          prev.map((b) => {
            const upd = byId.get(b.id);
            return upd ? { ...b, pbContentKg: upd.pbContentKg, valueGbp: upd.valueGbp } : b;
          })
        );
        toast({
          title: "Recalculated",
          description:
            "Pb content re-derived from the cell model catalogue and £ Value recalculated using " +
            (parseFloat(financials.cblLmeValue) > 0 ? "CBL LME Value" : "latest LME price") +
            ".",
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.message || "Failed to recalculate.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to recalculate.", variant: "destructive" });
    }
  }

  async function autoConfirmAll() {
    const pendingCount = batteries.filter((battery) => battery.receiptConfirmed !== true).length;
    if (pendingCount === 0) return;
    if (!window.confirm(`This will confirm all ${pendingCount} items with TAB weights — continue?`)) return;

    setAutoConfirming(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/batteries/auto-confirm`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Auto-confirm failed",
          description: data.message || "The pending items could not be confirmed.",
          variant: "destructive",
        });
        return;
      }
      setBatteries(data.batteries || []);
      if (data.job) setJob(data.job);
      setReceiptDelivery(null);
      toast({
        title: "Items confirmed",
        description: `${data.confirmedCount} pending ${data.confirmedCount === 1 ? "item was" : "items were"} confirmed with TAB weights.`,
      });
    } catch {
      toast({
        title: "Auto-confirm failed",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setAutoConfirming(false);
    }
  }

  useEffect(() => {
    const computed = calculateCblLmeValue(
      financials.tonnage,
      financials.cblLmeValue,
      financials.cblLmePercent
    );
    setFinancials((prev) => ({ ...prev, cblLmePrice: computed }));
  }, [financials.tonnage, financials.cblLmeValue, financials.cblLmePercent]);

  useEffect(() => {
    const netPbWeightKg = batteries.reduce(
      (sum, battery) => sum + (parseFloat(battery.pbContentKg || "0") || 0),
      0
    );
    const customerInvoiceValue = calculateCustomerLmeValue(
      netPbWeightKg,
      financials.cblLmeValue,
      financials.customerLmePercent
    );
    setFinancials((prev) => ({ ...prev, customerInvoiceValue }));
  }, [batteries, financials.cblLmeValue, financials.customerLmePercent]);

  useEffect(() => {
    const grossProfit = calculateGrossProfit(
      financials.totalInvoiceValue,
      financials.transportCost,
      financials.cblLmePrice
    );
    setFinancials((prev) => ({ ...prev, grossProfit }));
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
        setReceiptDelivery(null);
        toast({ title: "Saved", description: "Battery details updated." });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.message || "Failed to update battery.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update battery.", variant: "destructive" });
    }
  }

  async function loadReceiptDelivery() {
    setLoadingReceiptDelivery(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/receipt-delivery`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not prepare document delivery");
      setReceiptDelivery(data);
    } catch (error) {
      toast({
        title: "Could not prepare delivery",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingReceiptDelivery(false);
    }
  }

  async function sendReceiptDocuments() {
    if (!receiptDelivery) return;
    const retrying = receiptDelivery.clientStatus === "failed" || receiptDelivery.accountsStatus === "failed";
    const alreadySent = receiptDelivery.clientStatus === "sent" && receiptDelivery.accountsStatus === "sent";
    const clientList = receiptDelivery.clientRecipients.map((recipient) => recipient.email).join(", ");
    const accountsList = receiptDelivery.accountsRecipients.map((recipient) => recipient.email).join(", ");
    const confirmed = window.confirm(
      `${alreadySent ? "Resend" : retrying ? "Retry" : "Send"} completed documents?\n\n` +
      `Client receipt: ${clientList}\nAccounts value document: ${accountsList}\n\n` +
      `Confirmed total value: £${Number(receiptDelivery.totalValue).toFixed(2)}`
    );
    if (!confirmed) return;
    setSendingReceiptDelivery(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}/receipt-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resend: alreadySent }),
      });
      const data = await res.json().catch(() => ({}));
      await loadReceiptDelivery();
      if (!res.ok) throw new Error(data.message || "Some documents could not be sent");
      toast({ title: "Documents sent", description: "The client receipt and accounts value document were sent successfully." });
    } catch (error) {
      toast({
        title: "Delivery incomplete",
        description: error instanceof Error ? error.message : "Please retry the failed delivery.",
        variant: "destructive",
      });
    } finally {
      setSendingReceiptDelivery(false);
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

  if (loadError === "error") {
    return (
      <SidebarLayout title="Job Detail" subtitle="Could not load job">
        <div className="text-center py-20">
          <p className="text-slate-500 mb-4">Couldn't load this job — please try again.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => setLocation("/jobs")}>Back to Jobs</Button>
            <Button onClick={loadJob}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  if (loadError === "not_found") {
    return (
      <SidebarLayout title="Job Not Found" subtitle="The requested job does not exist">
        <div className="text-center py-20">
          <p className="text-slate-500 mb-4">This job doesn't exist or has been removed.</p>
          <Button onClick={() => setLocation("/jobs")}>Back to Jobs</Button>
        </div>
      </SidebarLayout>
    );
  }

  if (!job) {
    return (
      <SidebarLayout title="Job Detail" subtitle="Could not load job">
        <div className="text-center py-20">
          <p className="text-slate-500 mb-4">Couldn't load this job — please try again.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => setLocation("/jobs")}>Back to Jobs</Button>
            <Button onClick={loadJob}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout title={job.reference} subtitle={`${job.clientName} — ${job.depot}`}>
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
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[#0ea5e9] border-[#0ea5e9]/40 hover:bg-[#0ea5e9] hover:text-white transition-colors"
              onClick={handleDownloadCollectionSheet}
              disabled={downloadingCollectionSheet}
            >
              <Truck className="w-3.5 h-3.5 mr-1.5" />
              {downloadingCollectionSheet ? "Preparing…" : "Collection Sheet PDF"}
            </Button>
            {(userRole === "accounts" || userRole === "head_office_admin") && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[#0ea5e9] border-[#0ea5e9]/40 hover:bg-[#0ea5e9] hover:text-white transition-colors"
                onClick={handleDownloadInvoice}
                disabled={downloadingInvoice}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {downloadingInvoice ? "Preparing…" : "Confirmed Collection Sheet PDF"}
              </Button>
            )}
            <Badge variant="outline" className={`font-medium text-sm px-3 py-1 ${statusStyles[job.status] || ""}`}>
              {statusLabels[job.status] || job.status}
            </Badge>
          </div>
        </div>

        {job.scheduleStatus === "proposed" && (userRole === "accounts" || userRole === "head_office_admin") && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6" data-testid="card-schedule-proposal">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-[#0f2744]">Collection date proposed by the collection company</p>
                <p className="text-sm text-slate-600 mt-1">
                  Proposed: <strong>{formatDate(job.proposedCollectionDate)}</strong>
                  {" · "}Driver: <strong>{job.driverName || "—"}</strong>
                  {" · "}Vehicle: <strong>{job.vehicleReg || "—"}</strong>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Confirming emails the collection details to the person who requested the collection.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="h-9 w-40 bg-white"
                  value={confirmDate || job.proposedCollectionDate || ""}
                  onChange={(e) => setConfirmDate(e.target.value)}
                  data-testid="input-confirm-date"
                />
                <Button
                  size="sm"
                  className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                  disabled={confirmingSchedule}
                  onClick={async () => {
                    setConfirmingSchedule(true);
                    try {
                      const body: Record<string, string> = {};
                      const chosen = confirmDate || job.proposedCollectionDate || "";
                      if (chosen && chosen !== job.proposedCollectionDate) body.collectionDate = chosen;
                      const res = await fetch(`/api/jobs/${job.id}/schedule/confirm`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(body),
                      });
                      if (res.ok) {
                        toast({ title: "Collection confirmed", description: "The collection details are being emailed to the person who requested the collection." });
                        loadJob();
                      } else {
                        const data = await res.json().catch(() => null);
                        toast({ title: "Could not confirm", description: data?.message || "Please try again.", variant: "destructive" });
                      }
                    } finally {
                      setConfirmingSchedule(false);
                    }
                  }}
                  data-testid="button-confirm-schedule"
                >
                  {confirmingSchedule ? "Confirming…" : "Confirm Collection Date"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {(userRole === "accounts" || userRole === "head_office_admin") && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6" data-testid="card-job-documents">
            <JobDocumentsPanel jobId={job.id} mode="review" />
          </div>
        )}

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
                      <CollectionBatteryRow
                        key={b.id}
                        battery={b}
                        index={i}
                        onSaveField={updateBatteryAdmin}
                        cellModels={cellModels}
                        manufacturerList={manufacturerList}
                        canEdit={canEditResolved}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {(userRole === "accounts" || userRole === "head_office_admin") && (
                <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50/60 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h5 className="font-semibold text-[#0f2744] flex items-center gap-2">
                        <Mail className="h-4 w-4 text-sky-600" />
                        Completed receipt delivery
                      </h5>
                      {!receiptDelivery ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Check that every item has been reviewed, then preview the client and accounts recipients.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2 text-sm">
                          <p className={receiptDelivery.ready ? "text-green-700" : "text-amber-700"}>
                            {receiptDelivery.reviewedCount} of {receiptDelivery.totalCount} items reviewed
                            {" · "}Confirmed value £{Number(receiptDelivery.totalValue).toFixed(2)}
                          </p>
                          <div>
                            <span className="font-medium text-slate-700">Client receipt: </span>
                            <span className="text-slate-600">
                              {receiptDelivery.clientRecipients.map((recipient) => `${recipient.fullName} (${recipient.email})`).join(", ") || "No recipient found"}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-slate-700">Accounts document: </span>
                            <span className="text-slate-600">
                              {receiptDelivery.accountsRecipients.map((recipient) => `${recipient.fullName} (${recipient.email})`).join(", ") || "No recipient found"}
                            </span>
                          </div>
                          {(receiptDelivery.clientStatus || receiptDelivery.accountsStatus) && (
                            <p className="text-xs text-slate-500">
                              Client: {receiptDelivery.clientStatus || "not sent"} · Accounts: {receiptDelivery.accountsStatus || "not sent"}
                              {receiptDelivery.sentAt ? ` · Completed ${formatDate(receiptDelivery.sentAt)}` : ""}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {!receiptDelivery ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadReceiptDelivery}
                        disabled={loadingReceiptDelivery}
                      >
                        {loadingReceiptDelivery ? "Checking…" : "Preview recipients"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={sendReceiptDocuments}
                        disabled={
                          sendingReceiptDelivery
                          || !receiptDelivery.ready
                          || receiptDelivery.clientRecipients.length === 0
                          || receiptDelivery.accountsRecipients.length === 0
                        }
                      >
                        <Mail className="mr-1.5 h-3.5 w-3.5" />
                        {sendingReceiptDelivery
                          ? "Sending…"
                          : receiptDelivery.clientStatus === "failed" || receiptDelivery.accountsStatus === "failed"
                          ? "Retry failed delivery"
                          : receiptDelivery.clientStatus === "sent" && receiptDelivery.accountsStatus === "sent"
                          ? "Resend documents"
                          : "Send to client"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-l-4 border-[#0f2744] px-6 py-4 bg-slate-50/50 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#0f2744]" />
              <h3 className="font-bold text-[#0f2744] text-lg">Collection Sheet Details</h3>
              <span className="text-sm text-slate-500">(Shown on the transport company PDF)</span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Site Contacts</label>
                <Input
                  value={siteDetails.siteContacts}
                  onChange={(e) => setSiteDetails((prev) => ({ ...prev, siteContacts: e.target.value }))}
                  placeholder="e.g. John Smith 07700 900123"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Site Hours</label>
                <Input
                  value={siteDetails.siteHours}
                  onChange={(e) => setSiteDetails((prev) => ({ ...prev, siteHours: e.target.value }))}
                  placeholder="e.g. Mon–Fri 07:00–16:00"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Collection Date</label>
                <Input
                  type="date"
                  value={siteDetails.collectionDate}
                  onChange={(e) => setSiteDetails((prev) => ({ ...prev, collectionDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Special / Loading Instructions</label>
                <Input
                  value={siteDetails.specialInstructions}
                  onChange={(e) => setSiteDetails((prev) => ({ ...prev, specialInstructions: e.target.value }))}
                  placeholder='Leave blank for "None"'
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveSiteDetails} disabled={savingSiteDetails}>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {savingSiteDetails ? "Saving…" : "Save Collection Sheet Details"}
              </Button>
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                      onClick={autoConfirmAll}
                      disabled={autoConfirming || !batteries.some((battery) => battery.receiptConfirmed !== true)}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {autoConfirming ? "Confirming…" : "Auto-confirm all"}
                    </Button>
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
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <h4 className="font-semibold text-[#0f2744] flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-[#0ea5e9]" />
                  Financial Details (Master Job Log)
                </h4>
                <p className="text-xs text-slate-500">
                  Layout aligned to Ingrid&apos;s proposed format; auto/blocs fields await confirmation.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.1fr_1.1fr]">
                <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-4 border-b border-slate-200 pb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600">Summary</p>
                    <h5 className="mt-1 text-base font-bold text-[#0f2744]">LME / Profit</h5>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                        LME month average (prior month)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">£</span>
                        <Input
                          value={previousMonthAverage?.averageGbpPrice ?? ""}
                          placeholder="Unavailable"
                          readOnly
                          className="bg-white pl-7 font-semibold text-[#0f2744]"
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                        {previousMonthAverage?.averageGbpPrice
                          ? `${previousMonthAverage.month} · ${previousMonthAverage.sampleCount} stored daily ${previousMonthAverage.sampleCount === 1 ? "rate" : "rates"}`
                          : previousMonthAverage
                          ? `No stored daily rates for ${previousMonthAverage.month}`
                          : "Previous-month history unavailable"}
                      </p>
                    </div>
                    <FinancialField
                      label="Gross Profit £ (Current Calculation)"
                      value={financials.grossProfit}
                      onChange={(v) => setFinancials((p) => ({ ...p, grossProfit: v }))}
                      prefix="£"
                      computed
                    />
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
                      Net profit will be added after Ingrid confirms the final formula.
                    </p>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 border-b border-slate-200 pb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">Costs</p>
                    <h5 className="mt-1 text-base font-bold text-[#0f2744]">Waste Collector</h5>
                  </div>
                  <div className="space-y-4">
                    <FinancialField
                      label="CBL LME Value £ (Spot)"
                      value={financials.cblLmeValue}
                      onChange={(v) => { setPrefilled((pf) => ({ ...pf, cblLmeValue: false })); setFinancials((p) => ({ ...p, cblLmeValue: v })); }}
                      icon={<PoundSterling className="w-3.5 h-3.5" />}
                      prefix="£"
                      autoPrefilled={!!prefilled.cblLmeValue}
                    />
                    <FinancialField
                      label="% of LME (CBL)"
                      value={financials.cblLmePercent}
                      onChange={(v) => setFinancials((p) => ({ ...p, cblLmePercent: v }))}
                      suffix="%"
                    />
                    <FinancialField
                      label="Calculated Value of LME (CBL)"
                      value={financials.cblLmePrice}
                      onChange={(v) => setFinancials((p) => ({ ...p, cblLmePrice: v }))}
                      prefix="£"
                      computed
                    />
                    <FinancialField
                      label="Gross Tonnage (Actual)"
                      value={financials.tonnage}
                      onChange={(v) => setFinancials((p) => ({ ...p, tonnage: v }))}
                      icon={<Truck className="w-3.5 h-3.5" />}
                      suffix="t"
                    />
                    <FinancialField
                      label="Transport Cost"
                      value={financials.transportCost}
                      onChange={(v) => setFinancials((p) => ({ ...p, transportCost: v }))}
                      prefix="£"
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
                      onChange={(v) => { setPrefilled((pf) => ({ ...pf, totalInvoiceValue: false })); setFinancials((p) => ({ ...p, totalInvoiceValue: v })); }}
                      prefix="£"
                      autoPrefilled={!!prefilled.totalInvoiceValue}
                    />
                    <FinancialField
                      label="Itinium Invoice No."
                      value={financials.itiniumInvoiceNo}
                      onChange={(v) => setFinancials((p) => ({ ...p, itiniumInvoiceNo: v }))}
                      type="text"
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 border-b border-slate-200 pb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600">Income</p>
                    <h5 className="mt-1 text-base font-bold text-[#0f2744]">Customer</h5>
                  </div>
                  <div className="space-y-4">
                    <FinancialField
                      label="% LME"
                      value={financials.customerLmePercent}
                      onChange={(v) => setFinancials((p) => ({ ...p, customerLmePercent: v }))}
                      suffix="%"
                    />
                    <FinancialField
                      label="Customer Invoice Value £"
                      value={financials.customerInvoiceValue}
                      onChange={(v) => setFinancials((p) => ({ ...p, customerInvoiceValue: v }))}
                      prefix="£"
                      computed
                    />
                    <p className="-mt-2 text-[11px] leading-4 text-slate-500">
                      CBL LME rate × % LME × net Pb weight (
                      {batteries.reduce((sum, battery) => sum + (parseFloat(battery.pbContentKg || "0") || 0), 0).toFixed(3)} kg)
                    </p>
                    <FinancialField
                      label="Customer Invoice No."
                      value={financials.customerInvoiceNo}
                      onChange={(v) => setFinancials((p) => ({ ...p, customerInvoiceNo: v }))}
                      icon={<Receipt className="w-3.5 h-3.5" />}
                      type="text"
                    />
                  </div>
                </section>
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
                {job.status !== "request" && (
                  <Button
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => updateStatus("request")}
                  >
                    Request
                  </Button>
                )}
                {job.status !== "confirmed" && (
                  <Button
                    variant="outline"
                    className="border-teal-300 text-teal-700 hover:bg-teal-50"
                    onClick={() => updateStatus("confirmed")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Confirmed
                  </Button>
                )}
                {job.status !== "received" && (
                  <Button
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => updateStatus("received")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Received
                  </Button>
                )}
                {job.status !== "invoice" && (
                  <Button
                    variant="outline"
                    className="border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={() => updateStatus("invoice")}
                  >
                    Invoice
                  </Button>
                )}
                {job.status !== "awaiting_invoice" && (
                  <Button
                    variant="outline"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    onClick={() => updateStatus("awaiting_invoice")}
                  >
                    Awaiting Invoice
                  </Button>
                )}
                {job.status !== "completed" && (
                  <Button
                    variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => updateStatus("completed")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Completed
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

function CollectionBatteryRow({
  battery,
  index,
  onSaveField,
  cellModels,
  manufacturerList,
  canEdit,
}: {
  battery: BatteryData;
  index: number;
  onSaveField: (id: number, updates: Record<string, string | boolean | null>) => void;
  cellModels: CellModelLite[];
  manufacturerList: { manufacturers: string[]; aliases: Record<string, string> } | null;
  canEdit: boolean;
}) {
  const cellTypeSuggestions = useMemo(() => {
    if ((!battery.cellModelFlagReason && !canEdit) || cellModels.length === 0) return [];
    return rankCellTypeSuggestions(
      battery.cellType || "",
      battery.manufacture,
      cellModels
    );
  }, [battery.cellModelFlagReason, battery.cellType, battery.manufacture, cellModels, canEdit]);

  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const aiRequestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!battery.cellModelFlagReason || cellModels.length === 0) return;
    if (cellTypeSuggestions.length > 0) return;
    const typed = (battery.cellType || "").trim();
    const mfr = (battery.manufacture || "").trim();
    if (!typed || !mfr || mfr.toLowerCase() === "unknown") return;
    const reqKey = `${typed}|${mfr}`;
    if (aiRequestedFor.current === reqKey) return;
    aiRequestedFor.current = reqKey;
    setAiSuggestion(null);

    const candidates = Array.from(
      new Set(
        cellModels
          .filter((m) => manufacturerMatches(mfr, m.manufacturer))
          .map((m) => m.modelName)
      )
    ).slice(0, 300);
    if (candidates.length === 0) return;

    let cancelled = false;
    fetch("/api/suggest-correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ field: "cellType", value: typed, candidates }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.suggestion) setAiSuggestion(data.suggestion);
      })
      .catch(() => {
        // AI fallback is best-effort only.
      });
    return () => {
      cancelled = true;
    };
  }, [battery.cellModelFlagReason, battery.cellType, battery.manufacture, cellModels, cellTypeSuggestions.length]);

  const manufacturerSuggestions = useMemo(() => {
    if ((!battery.manufacturerFlagReason && !canEdit) || !manufacturerList) return [];
    return rankManufacturerSuggestions(
      battery.manufacture || "",
      manufacturerList.manufacturers,
      manufacturerList.aliases
    );
  }, [battery.manufacturerFlagReason, battery.manufacture, manufacturerList, canEdit]);

  const [aiMfrSuggestion, setAiMfrSuggestion] = useState<string | null>(null);
  const aiMfrRequestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!battery.manufacturerFlagReason || !manufacturerList) return;
    if (manufacturerSuggestions.length > 0) return;
    const typed = (battery.manufacture || "").trim();
    if (!typed || typed.toLowerCase() === "unknown") return;
    if (aiMfrRequestedFor.current === typed) return;
    aiMfrRequestedFor.current = typed;
    setAiMfrSuggestion(null);

    const candidates = manufacturerList.manufacturers.filter(
      (m) => m.toLowerCase() !== "other"
    );
    if (candidates.length === 0) return;

    let cancelled = false;
    fetch("/api/suggest-correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ field: "manufacture", value: typed, candidates }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.suggestion) setAiMfrSuggestion(data.suggestion);
      })
      .catch(() => {
        // AI fallback is best-effort only.
      });
    return () => {
      cancelled = true;
    };
  }, [battery.manufacturerFlagReason, battery.manufacture, manufacturerList, manufacturerSuggestions.length]);

  const manufacturerChips =
    manufacturerSuggestions.length > 0
      ? manufacturerSuggestions.map((s) => ({ label: s.name }))
      : aiMfrSuggestion
      ? [{ label: aiMfrSuggestion, hint: "AI suggestion" }]
      : [];

  const suggestionChips =
    cellTypeSuggestions.length > 0
      ? cellTypeSuggestions.map((s) => ({
          label: s.modelName,
          hint: s.manufacturer,
        }))
      : aiSuggestion
      ? [{ label: aiSuggestion, hint: "AI suggestion" }]
      : [];
  const hasAnyFlag = !!(
    battery.serialFlagReason ||
    battery.manufacturerFlagReason ||
    battery.cellModelFlagReason ||
    battery.voltageFlagReason
  );

  return (
    <tr className={`${hasAnyFlag ? "bg-amber-50/60 border-l-4 border-l-amber-400" : (index % 2 === 0 ? "bg-white" : "bg-slate-50/30")}`}>
      <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
      <td className="px-3 py-2.5 text-slate-700">{battery.palletNumber || "—"}</td>
      <td className="px-3 py-2.5 text-slate-700">{battery.assetNumber || "—"}</td>
      <td className="px-3 py-2.5 font-medium text-[#0f2744]">
        {battery.serialFlagReason ? (
          <InlineFlagEdit
            initialValue={battery.batterySerial}
            placeholder="Serial"
            onSave={(v) => onSaveField(battery.id, { batterySerial: v })}
            extraAction={{
              label: "No serial fitted",
              onClick: () => onSaveField(battery.id, { clearSerialFlag: true }),
            }}
          />
        ) : (
          battery.batterySerial || "—"
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {battery.manufacturerFlagReason ? (
          <InlineFlagEdit
            initialValue={battery.manufacture}
            placeholder="Manufacturer"
            onSave={(v) => onSaveField(battery.id, { manufacture: v })}
            suggestions={manufacturerChips}
          />
        ) : canEdit ? (
          <InlineFlagEdit
            initialValue={battery.manufacture}
            placeholder="Manufacturer"
            onSave={(v) => onSaveField(battery.id, { manufacture: v })}
            suggestions={manufacturerChips}
            subtle
          />
        ) : (
          battery.manufacture || "—"
        )}
      </td>
      <td className="px-3 py-2.5">
        {battery.cellModelFlagReason ? (
          <div className="flex items-center gap-1.5">
            <InlineFlagEdit
              initialValue={battery.cellType}
              placeholder="Cell model"
              onSave={(v) => onSaveField(battery.id, { cellType: v })}
              suggestions={suggestionChips}
            />
            {battery.isLooseCells && (
              <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">Loose</Badge>
            )}
          </div>
        ) : canEdit ? (
          <div className="flex items-center gap-1.5">
            <InlineFlagEdit
              initialValue={battery.cellType}
              placeholder="Cell model"
              onSave={(v) => onSaveField(battery.id, { cellType: v })}
              suggestions={suggestionChips}
              subtle
            />
            {battery.isLooseCells && (
              <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">Loose</Badge>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs">{battery.cellType || "—"}</Badge>
            {battery.isLooseCells && (
              <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">Loose</Badge>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {battery.voltageFlagReason ? (
          <InlineFlagEdit
            initialValue={battery.voltage}
            placeholder="Voltage"
            onSave={(v) => onSaveField(battery.id, { voltage: v })}
          />
        ) : (
          battery.voltage || "—"
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-700">{battery.looseCellsQty ?? "—"}</td>
      <td className="px-3 py-2.5">
        {hasAnyFlag ? (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 w-fit">
              <AlertTriangle className="w-3 h-3" />
              Needs Review
            </span>
            {battery.serialFlagReason && (
              <span className="text-[10px] text-amber-700"><span className="font-semibold">Serial:</span> {battery.serialFlagReason}</span>
            )}
            {battery.manufacturerFlagReason && (
              <span className="text-[10px] text-amber-700"><span className="font-semibold">Manufacturer:</span> {battery.manufacturerFlagReason}</span>
            )}
            {battery.cellModelFlagReason && (
              <span className="text-[10px] text-amber-700"><span className="font-semibold">Cell Model:</span> {battery.cellModelFlagReason}</span>
            )}
            {battery.voltageFlagReason && (
              <span className="text-[10px] text-amber-700"><span className="font-semibold">Voltage:</span> {battery.voltageFlagReason}</span>
            )}
            {battery.rowPhoto && (
              <a href={battery.rowPhoto} target="_blank" rel="noreferrer" className="text-[10px] text-[#0ea5e9] hover:underline">View Photo</a>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 w-fit">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate">
        <div className="flex flex-col gap-0.5">
          <span className="truncate">{battery.notes || "—"}</span>
          {battery.resolvedByName && battery.resolvedAt && (
            <span className="text-[10px] text-slate-400" title={new Date(battery.resolvedAt).toLocaleString("en-GB")}>
              Resolved by {battery.resolvedByName} on {formatDate(battery.resolvedAt)}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function InlineFlagEdit({
  initialValue,
  placeholder,
  onSave,
  extraAction,
  suggestions,
  subtle,
}: {
  initialValue: string | null;
  placeholder: string;
  onSave: (value: string) => void;
  extraAction?: { label: string; onClick: () => void };
  suggestions?: { label: string; hint?: string }[];
  subtle?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue || "");

  useEffect(() => {
    setValue(initialValue || "");
  }, [initialValue]);

  const suggestionChips =
    suggestions && suggestions.length > 0 ? (
      <div className="flex items-center gap-1 flex-wrap w-full">
        <span className="text-[10px] text-slate-500">Suggested:</span>
        {suggestions.map((s) => (
          <button
            key={`${s.label}|${s.hint || ""}`}
            type="button"
            onClick={() => {
              setValue(s.label);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-[10px] text-sky-800 hover:bg-sky-100"
            title={s.hint ? `From ${s.hint}` : undefined}
          >
            {s.label}
            {s.hint && <span className="text-sky-500">· {s.hint}</span>}
          </button>
        ))}
      </div>
    ) : null;

  if (!editing) {
    if (subtle) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 -mx-1 hover:bg-slate-100"
          title={`Edit ${placeholder.toLowerCase()}`}
        >
          <span>{initialValue || "—"}</span>
          <Pencil className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
        </button>
      );
    }
    return (
      <div className="flex flex-col gap-1 items-start">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-amber-300 bg-white text-[11px] text-amber-800 hover:bg-amber-50"
          title={`Click to set ${placeholder.toLowerCase()}`}
        >
          {initialValue || `Set ${placeholder.toLowerCase()}`}
        </button>
        {suggestionChips}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onSave(value.trim());
            setEditing(false);
          } else if (e.key === "Escape") {
            setValue(initialValue || "");
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className="h-7 w-28 text-xs bg-white"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
        disabled={!value.trim()}
        onClick={() => {
          if (!value.trim()) return;
          onSave(value.trim());
          setEditing(false);
        }}
      >
        Save
      </Button>
      {extraAction && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-50"
          onClick={() => {
            extraAction.onClick();
            setEditing(false);
          }}
          title="Mark as verified with no serial"
        >
          {extraAction.label}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] text-slate-500"
        onClick={() => {
          setValue(initialValue || "");
          setEditing(false);
        }}
      >
        Cancel
      </Button>
      {suggestionChips}
    </div>
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
        <div className="flex flex-col items-center gap-1">
          <Switch
            checked={receipt}
            onCheckedChange={(checked) => {
              setReceipt(checked);
            }}
          />
          {battery.receiptReviewed && (
            <span className="text-[10px] font-medium text-green-700">Reviewed</span>
          )}
        </div>
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
  autoPrefilled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  icon?: React.ReactNode;
  type?: string;
  computed?: boolean;
  autoPrefilled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
        {icon && <span className="text-slate-400">{icon}</span>}
        {label}
        {computed && <span className="text-[#0ea5e9] text-[10px]">(auto)</span>}
        {autoPrefilled && !computed && <span className="text-sky-500 text-[10px]">(pre-filled)</span>}
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
          } ${suffix ? "pr-7" : ""} ${computed ? "bg-sky-50/50 font-medium" : autoPrefilled ? "bg-sky-50/40 border-sky-200" : "bg-slate-50"}`}
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
