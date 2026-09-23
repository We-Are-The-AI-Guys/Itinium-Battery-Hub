import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  rankCellTypeSuggestions,
  manufacturerMatches,
  type CellModelLite,
} from "@/lib/cell-type-suggestions";
import { rankManufacturerSuggestions } from "@/lib/manufacturer-suggestions";
import {
  calculateCblLmeValue,
  calculateCustomerFinanceMasterValues,
  isCollectionLmeUsable,
  calculateGrossProfit,
  calculateNetProfit,
  calculatePercentageRate,
  calculateReceiptValueGbp,
  calculateReceivedReceiptTotals,
  resolveCustomerLmePercent,
  calculateSectionInvoiceValue,
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
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarLayout } from "@/components/sidebar-layout";
import { JobDocumentsPanel } from "@/components/job-documents";
import { useToast } from "@/hooks/use-toast";
import {
  getJobNextStep,
  isBackwardJobStatusChange,
  JOB_STATUS_JOURNEY,
} from "@/lib/job-status";

interface LmePrice {
  id: number;
  priceDate: string;
  usdPrice: string;
  exchangeRate: string;
  gbpPrice: string;
  source: string;
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
  wasteSpotRate: string | null;
  wasteTractionPercent: string | null;
  wasteBlocsPercent: string | null;
  wasteTractionRate: string | null;
  wasteBlocsRate: string | null;
  wasteTractionTonnage: string | null;
  wasteBlocsTonnage: string | null;
  wasteAdHocCosts: string | null;
  wasteTransportCost: string | null;
  wasteInvoiceValue: string | null;
  wasteInvoiceNo: string | null;
  customerTractionPercent: string | null;
  customerBlocsPercent: string | null;
  customerTractionRate: string | null;
  customerBlocsRate: string | null;
  customerTractionTonnage: string | null;
  customerBlocsTonnage: string | null;
  customerAdHocCosts: string | null;
  customerTransportCost: string | null;
  netProfit: string | null;
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

function collectionDetailsDate(
  job: Pick<JobData, "collectionDate" | "proposedCollectionDate"> | null | undefined
): string {
  return job?.collectionDate || job?.proposedCollectionDate || "";
}

function getInvoiceDueStatus(dueDate: string, datePaid: string): {
  label: string;
  tone: "neutral" | "good" | "warning" | "overdue";
} {
  if (!dueDate) return { label: "—", tone: "neutral" };
  if (datePaid) return { label: "Paid", tone: "good" };
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`, tone: "overdue" };
  if (days === 0) return { label: "Due today", tone: "warning" };
  return { label: `${days} day${days === 1 ? "" : "s"} left`, tone: days <= 7 ? "warning" : "good" };
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

interface ReceiptDraft {
  receiptConfirmed: boolean;
  pbContentKg: string;
  valueGbp: string;
  notes: string;
  voltage: string;
}

type ReceiptDraftField = keyof ReceiptDraft;

function receiptDraftFromBattery(battery: BatteryData): ReceiptDraft {
  return {
    receiptConfirmed: battery.receiptConfirmed ?? false,
    pbContentKg: battery.pbContentKg || "",
    valueGbp: battery.valueGbp || "",
    notes: battery.notes || "",
    voltage: battery.voltage || "",
  };
}

function receiptPatchFromDraft(
  draft: ReceiptDraft,
  dirtyFields: Set<ReceiptDraftField>
): Partial<Record<ReceiptDraftField, string | boolean | null>> {
  const patch: Partial<Record<ReceiptDraftField, string | boolean | null>> = {};
  for (const field of dirtyFields) {
    patch[field] = field === "receiptConfirmed" ? draft[field] : draft[field] || null;
  }
  return patch;
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

const statusDotStyles: Record<string, string> = {
  request: "bg-amber-500",
  confirmed: "bg-teal-500",
  received: "bg-blue-500",
  invoice: "bg-violet-500",
  awaiting_invoice: "bg-orange-500",
  completed: "bg-green-500",
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
  const [financialEditing, setFinancialEditing] = useState(false);
  const [autoConfirming, setAutoConfirming] = useState(false);
  const [autofillingReview, setAutofillingReview] = useState(false);
  const [lmePrice, setLmePrice] = useState<LmePrice | null>(null);
  const [collectionLmePrice, setCollectionLmePrice] = useState<LmePrice | null>(null);
  const [collectionLmeStatus, setCollectionLmeStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable"
  >("idle");
  const [collectionLmeEffectiveDate, setCollectionLmeEffectiveDate] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);
  const cblLmeInitialRef = useRef<string | null>(null);
  const receiptValueInputsRef = useRef<string | null>(null);
  const previousReceiptLmeRateRef = useRef<number | null>(null);
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
    wasteSpotRate: "",
    wasteTractionPercent: "",
    wasteBlocsPercent: "",
    wasteTractionRate: "",
    wasteBlocsRate: "",
    wasteTractionTonnage: "",
    wasteBlocsTonnage: "",
    wasteAdHocCosts: "",
    wasteTransportCost: "",
    wasteInvoiceValue: "",
    wasteInvoiceNo: "",
    customerTractionPercent: "",
    customerBlocsPercent: "",
    customerTractionRate: "",
    customerBlocsRate: "",
    customerTractionTonnage: "",
    customerBlocsTonnage: "",
    customerAdHocCosts: "",
    customerTransportCost: "",
    netProfit: "",
  });
  const financialSnapshotRef = useRef(financials);
  const [receiptDrafts, setReceiptDrafts] = useState<Record<number, ReceiptDraft>>({});
  const [dirtyReceiptIds, setDirtyReceiptIds] = useState<Set<number>>(new Set());
  const [dirtyReceiptFields, setDirtyReceiptFields] = useState<Record<number, Set<ReceiptDraftField>>>({});
  const [savingReceiptRows, setSavingReceiptRows] = useState(false);

  const [siteDetails, setSiteDetails] = useState({
    siteContacts: "",
    siteHours: "",
    specialInstructions: "",
    collectionDate: "",
    notes: "",
  });
  const collectionLmeUsable = isCollectionLmeUsable(
    collectionLmeStatus,
    collectionLmePrice !== null,
    collectionLmeEffectiveDate,
    job?.collectionDate || "",
    siteDetails.collectionDate
  );
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
  const canManageStatus = userRole === "accounts" || userRole === "head_office_admin";
  const canEditFinancials =
    userRole === "team_leader" || userRole === "accounts" || userRole === "head_office_admin";
  const canEditReceipt = canEditFinancials;

  const receivedTotals = useMemo(() => calculateReceivedReceiptTotals(
    batteries.map((battery) => {
      const draft = receiptDrafts[battery.id];
      const receiptDecisionChanged = dirtyReceiptFields[battery.id]?.has("receiptConfirmed") === true;
      return {
        receiptConfirmed: draft?.receiptConfirmed ?? battery.receiptConfirmed,
        receiptReviewed: receiptDecisionChanged ? true : battery.receiptReviewed,
        estimatedWeightKg: battery.estimatedWeightKg,
        pbContentKg: draft?.pbContentKg ?? battery.pbContentKg,
        valueGbp: draft?.valueGbp ?? battery.valueGbp,
      };
    })
  ), [batteries, receiptDrafts, dirtyReceiptFields]);

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
          const customerLmePercent = data.job.customerLmePercent || "";
          const customerTractionPercent =
            data.job.customerTractionPercent || customerLmePercent;
          const effectiveReceiptPercent = resolveCustomerLmePercent(
            customerTractionPercent,
            customerLmePercent
          );
          receiptValueInputsRef.current = `${cblLmeValue}|${effectiveReceiptPercent}`;
          const historicalReceiptRate = parseFloat(
            data.job.cblLmeValue || data.job.lmeRateUsed || ""
          );
          previousReceiptLmeRateRef.current =
            isFinite(historicalReceiptRate) && historicalReceiptRate > 0
              ? historicalReceiptRate
              : null;
          setBatteries(data.batteries);
          setReceiptDrafts(
            Object.fromEntries(
              (data.batteries as BatteryData[]).map((battery) => [
                battery.id,
                receiptDraftFromBattery(battery),
              ])
            )
          );
          setDirtyReceiptIds(new Set());
          setDirtyReceiptFields({});

          let totalInvoiceValue = data.job.totalInvoiceValue || "";
          if (!totalInvoiceValue) {
            totalInvoiceValue = calculateReceivedReceiptTotals(
              data.batteries as BatteryData[]
            ).valueGbp.toFixed(2);
            prefilledFlags.totalInvoiceValue = true;
          }

          setPrefilled(prefilledFlags);

          const loadedFinancials = {
            tonnage: data.job.tonnage || "",
            cblLmeValue,
            cblLmePercent: data.job.cblLmePercent || "",
            cblLmePrice: data.job.cblLmePrice || "",
            transportCost: data.job.transportCost || "",
            customerLmePercent,
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
            wasteSpotRate: data.job.wasteSpotRate || data.job.cblLmeValue || "",
            wasteTractionPercent: data.job.wasteTractionPercent || "",
            wasteBlocsPercent: data.job.wasteBlocsPercent || "",
            wasteTractionRate: data.job.wasteTractionRate || "",
            wasteBlocsRate: data.job.wasteBlocsRate || "",
            wasteTractionTonnage: data.job.wasteTractionTonnage || "",
            wasteBlocsTonnage: data.job.wasteBlocsTonnage || "",
            wasteAdHocCosts: data.job.wasteAdHocCosts || "",
            wasteTransportCost: data.job.wasteTransportCost || data.job.transportCost || "",
            wasteInvoiceValue: data.job.wasteInvoiceValue || data.job.totalInvoiceValue || "",
            wasteInvoiceNo: data.job.wasteInvoiceNo || data.job.itiniumInvoiceNo || "",
            customerTractionPercent,
            customerBlocsPercent: data.job.customerBlocsPercent || "",
            customerTractionRate: data.job.customerTractionRate || "",
            customerBlocsRate: data.job.customerBlocsRate || "",
            customerTractionTonnage: data.job.customerTractionTonnage || "",
            customerBlocsTonnage: data.job.customerBlocsTonnage || "",
            customerAdHocCosts: data.job.customerAdHocCosts || "",
            customerTransportCost: data.job.customerTransportCost || "",
            netProfit: data.job.netProfit || "",
          };
          setFinancials(loadedFinancials);
          financialSnapshotRef.current = loadedFinancials;
          setFinancialEditing(false);

          setSiteDetails({
            siteContacts: data.job.siteContacts || "",
            siteHours: data.job.siteHours || "",
            specialInstructions: data.job.specialInstructions || "",
            collectionDate: collectionDetailsDate(data.job),
            notes: data.job.notes || "",
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
      })
      .catch(() => {});
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role) setUserRole(data.user.role);
      })
      .catch(() => {});
  }, [loadJob]);

  useEffect(() => {
    const collectionDate = job?.collectionDate || "";
    if (!collectionDate) {
      setCollectionLmePrice(null);
      setCollectionLmeEffectiveDate(null);
      setCollectionLmeStatus("idle");
      return;
    }
    const controller = new AbortController();
    setCollectionLmePrice(null);
    setCollectionLmeEffectiveDate(null);
    setCollectionLmeStatus("loading");
    fetch(`/api/lme/current?effectiveDate=${encodeURIComponent(collectionDate)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        const effectivePrice = data?.effectivePrice || null;
        setCollectionLmePrice(effectivePrice);
        setCollectionLmeEffectiveDate(effectivePrice ? collectionDate : null);
        setCollectionLmeStatus(effectivePrice ? "ready" : "unavailable");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCollectionLmePrice(null);
        setCollectionLmeEffectiveDate(null);
        setCollectionLmeStatus("unavailable");
      });
    return () => controller.abort();
  }, [job?.collectionDate]);

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
      const body: Partial<typeof siteDetails> = { ...siteDetails };
      if (siteDetails.collectionDate === collectionDetailsDate(job)) {
        delete body.collectionDate;
      }
      const res = await fetch(`/api/jobs/${params.id}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
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
    const valNum = calculateReceiptValueGbp(
      pbNum,
      effectiveRate,
      resolveCustomerLmePercent(
        financials.customerTractionPercent,
        financials.customerLmePercent
      )
    );
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
        body: JSON.stringify({
          ...(rate !== null ? { lmeGbpRate: rate } : {}),
          customerLmePercent: resolveCustomerLmePercent(
            financials.customerTractionPercent,
            financials.customerLmePercent
          ),
        }),
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
            ` at ${parseFloat(resolveCustomerLmePercent(financials.customerTractionPercent, financials.customerLmePercent) || "0") || 0}% Customer LME.`,
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
    if (!window.confirm(`All ${pendingCount} unconfirmed manufacturers will be confirmed with TAB weights — continue?`)) return;

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
      const confirmedBatteries = (data.batteries || []) as BatteryData[];
      setBatteries(confirmedBatteries);
      setReceiptDrafts(Object.fromEntries(
        confirmedBatteries.map((battery) => [battery.id, receiptDraftFromBattery(battery)])
      ));
      setDirtyReceiptIds(new Set());
      setDirtyReceiptFields({});
      if (data.job) setJob(data.job);
      setReceiptDelivery(null);
      toast({
        title: "Manufacturers confirmed",
        description: `${data.confirmedCount} unconfirmed ${data.confirmedCount === 1 ? "manufacturer was" : "manufacturers were"} confirmed with TAB weights.`,
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

  async function autofillReviewFields() {
    const flagged = batteries.filter((battery) =>
      battery.serialFlagReason
      || battery.manufacturerFlagReason
      || battery.cellModelFlagReason
      || battery.voltageFlagReason
    );
    if (flagged.length === 0) return;
    if (!window.confirm(`Accept the existing values for all ${flagged.length} items under review?`)) return;

    setAutofillingReview(true);
    try {
      const results = await Promise.all(flagged.map(async (battery) => {
        const updates: Record<string, string | boolean | null> = {};
        if (battery.serialFlagReason) {
          if (battery.batterySerial) updates.batterySerial = battery.batterySerial;
          else updates.clearSerialFlag = true;
        }
        if (battery.manufacturerFlagReason) updates.manufacture = battery.manufacture;
        if (battery.cellModelFlagReason) updates.cellType = battery.cellType;
        if (battery.voltageFlagReason) updates.voltage = battery.voltage;
        const res = await fetch(`/api/jobs/${params.id}/batteries/${battery.id}/admin`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(updates),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || `Could not accept item ${battery.id}`);
        return data.battery as BatteryData;
      }));
      const updatedById = new Map(results.map((battery) => [battery.id, battery]));
      setBatteries((current) => current.map((battery) => updatedById.get(battery.id) || battery));
      setReceiptDelivery(null);
      toast({
        title: "Review fields accepted",
        description: `${results.length} ${results.length === 1 ? "item was" : "items were"} saved using the existing job data.`,
      });
    } catch (error) {
      await loadJob();
      toast({
        title: "Autofill incomplete",
        description: error instanceof Error ? error.message : "Some review fields could not be saved.",
        variant: "destructive",
      });
    } finally {
      setAutofillingReview(false);
    }
  }

  useEffect(() => {
    setFinancials((prev) => ({
      ...prev,
      totalInvoiceValue: receivedTotals.valueGbp.toFixed(2),
    }));
  }, [receivedTotals.valueGbp]);

  useEffect(() => {
    const computed = calculateCblLmeValue(
      financials.tonnage,
      financials.cblLmeValue,
      financials.cblLmePercent
    );
    setFinancials((prev) => ({ ...prev, cblLmePrice: computed }));
  }, [financials.tonnage, financials.cblLmeValue, financials.cblLmePercent]);

  useEffect(() => {
    const grossProfit = calculateGrossProfit(
      financials.totalInvoiceValue,
      financials.transportCost,
      financials.cblLmePrice
    );
    setFinancials((prev) => ({ ...prev, grossProfit }));
  }, [financials.totalInvoiceValue, financials.transportCost, financials.cblLmePrice]);

  useEffect(() => {
    if (collectionLmeStatus !== "ready" || !collectionLmePrice) return;
    const customerLmeAverage = collectionLmePrice?.gbpPrice || "";
    const confirmedPbKg = receivedTotals.pbKg;
    const wasteTractionRate = calculatePercentageRate(financials.wasteSpotRate, financials.wasteTractionPercent);
    const wasteBlocsRate = "0.00";
    const customerTractionRate = calculatePercentageRate(customerLmeAverage, financials.customerTractionPercent);
    const customerBlocsRate = calculatePercentageRate(customerLmeAverage, financials.customerBlocsPercent);
    const wasteInvoiceValue = calculateSectionInvoiceValue(
      financials.wasteTractionTonnage, wasteTractionRate,
      "", "",
      financials.wasteTransportCost, financials.wasteAdHocCosts
    );
    const customerFinanceMaster = calculateCustomerFinanceMasterValues(
      confirmedPbKg, customerTractionRate,
      financials.customerBlocsTonnage, customerBlocsRate,
      financials.customerTransportCost, financials.customerAdHocCosts
    );
    const confirmedPbTonnage = customerFinanceMaster.tractionTonnage;
    const customerInvoiceValue = customerFinanceMaster.invoiceValue;
    const netProfit = calculateNetProfit(wasteInvoiceValue, customerInvoiceValue);
    setFinancials((prev) => ({
      ...prev,
      wasteTractionRate,
      wasteBlocsRate,
      customerTractionRate,
      customerBlocsRate,
      customerTractionTonnage: confirmedPbTonnage,
      wasteInvoiceValue,
      customerInvoiceValue,
      netProfit,
    }));
  }, [
    receivedTotals.pbKg, collectionLmePrice?.gbpPrice, collectionLmeStatus,
    financials.wasteSpotRate, financials.wasteTractionPercent,
    financials.wasteTractionTonnage,
    financials.wasteTransportCost, financials.wasteAdHocCosts,
    financials.customerTractionPercent, financials.customerBlocsPercent,
    financials.customerBlocsTonnage, financials.customerTransportCost, financials.customerAdHocCosts,
  ]);

  useEffect(() => {
    if (cblLmeInitialRef.current === null) return;
    const effectiveReceiptPercent = resolveCustomerLmePercent(
      financials.customerTractionPercent,
      financials.customerLmePercent
    );
    const calculationKey = `${financials.cblLmeValue}|${effectiveReceiptPercent}`;
    if (calculationKey === receiptValueInputsRef.current) return;
    const previousInputs = receiptValueInputsRef.current?.split("|") ?? [];
    const previousRate = previousReceiptLmeRateRef.current;
    const previousPercent = previousInputs[1] || "";
    cblLmeInitialRef.current = financials.cblLmeValue;
    receiptValueInputsRef.current = calculationKey;
    const rate = parseFloat(financials.cblLmeValue);
    if (!isFinite(rate) || rate <= 0) return;
    previousReceiptLmeRateRef.current = rate;
    setBatteries((prev) =>
      prev.map((b) => {
        const pbNum = b.pbContentKg ? parseFloat(b.pbContentKg) : null;
        const previousAutoValue = calculateReceiptValueGbp(
          pbNum,
          previousRate,
          previousPercent
        );
        const legacyGrossValue = calculateReceiptValueGbp(
          pbNum,
          previousRate,
          "100"
        );
        const savedValue = parseFloat(b.valueGbp || "");
        const isAutomatic =
          !isFinite(savedValue)
          || savedValue === 0
          || [previousAutoValue, legacyGrossValue].some(
            (candidate) => candidate !== null && Number(candidate.toFixed(2)) === savedValue
          );
        if (!isAutomatic) return b;
        const valNum = calculateReceiptValueGbp(pbNum, rate, effectiveReceiptPercent);
        return valNum !== null ? { ...b, valueGbp: valNum.toFixed(2) } : b;
      })
    );
  }, [
    financials.cblLmeValue,
    financials.customerLmePercent,
    financials.customerTractionPercent,
  ]);

  async function saveFinancials() {
    const { wasteBlocsPercent: _unusedWasteBlocsPercent, ...financialsWithoutWasteBlocsPercent } = financials;
    const changedEntries = Object.entries(financialsWithoutWasteBlocsPercent).filter(
      ([key, value]) =>
        value !== financialSnapshotRef.current[key as keyof typeof financials]
    );
    const lmeIndependentFields = new Set([
      "wasteInvoiceNo",
      "customerInvoiceNo",
      "invoiceStatus",
      "invoiceReceivedDate",
      "dueDate",
      "datePaid",
    ]);
    const requiresCollectionLme = changedEntries.some(([key]) => !lmeIndependentFields.has(key));
    if (requiresCollectionLme && !collectionLmeUsable) {
      toast({
        title: "Collection LME price unavailable",
        description:
          siteDetails.collectionDate !== (job?.collectionDate || "")
            ? "Save the collection date before saving financial details."
            : "A monthly LME price is required for the saved collection date.",
        variant: "destructive",
      });
      return;
    }
    if (changedEntries.length === 0) {
      setFinancialEditing(false);
      return;
    }
    setSaving(true);
    try {
      const payload = userRole === "team_leader"
        ? Object.fromEntries(
            changedEntries.filter(([key]) =>
              !["invoiceStatus", "invoiceReceivedDate", "dueDate", "datePaid"].includes(key)
            )
          )
        : Object.fromEntries(changedEntries);
      const res = await fetch(`/api/jobs/${params.id}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        if (Array.isArray(data.batteries)) setBatteries(data.batteries);
        const persistedFinancials = Object.fromEntries(
          Object.keys(financials).map((key) => [key, data.job[key] ?? ""])
        ) as typeof financials;
        setFinancials(persistedFinancials);
        financialSnapshotRef.current = persistedFinancials;
        setFinancialEditing(false);
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

  function startEditingFinancials() {
    financialSnapshotRef.current = { ...financials };
    setFinancialEditing(true);
  }

  function cancelEditingFinancials() {
    setFinancials(financialSnapshotRef.current);
    setFinancialEditing(false);
  }

  function updateReceiptDraft(batteryId: number, updates: Partial<ReceiptDraft>) {
    setReceiptDrafts((current) => ({
      ...current,
      [batteryId]: {
        ...(current[batteryId] || receiptDraftFromBattery(
          batteries.find((battery) => battery.id === batteryId)!
        )),
        ...updates,
      },
    }));
    setDirtyReceiptIds((current) => new Set(current).add(batteryId));
    setDirtyReceiptFields((current) => ({
      ...current,
      [batteryId]: new Set([
        ...(current[batteryId] || []),
        ...(Object.keys(updates) as ReceiptDraftField[]),
      ]),
    }));
  }

  async function saveReceiptRows() {
    const ids = Array.from(dirtyReceiptIds);
    if (ids.length === 0) return;
    setSavingReceiptRows(true);
    const saved: Array<{ batteryId: number; battery: BatteryData; job?: JobData }> = [];
    const failedIds: number[] = [];
    for (const batteryId of ids) {
      try {
        const draft = receiptDrafts[batteryId];
        const fields = dirtyReceiptFields[batteryId] || new Set<ReceiptDraftField>();
        const res = await fetch(`/api/jobs/${params.id}/batteries/${batteryId}/admin`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(receiptPatchFromDraft(draft, fields)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Failed to save battery");
        saved.push({
          batteryId,
          battery: data.battery as BatteryData,
          job: data.job as JobData | undefined,
        });
      } catch {
        failedIds.push(batteryId);
      }
    }
    if (saved.length > 0) {
      const savedById = new Map(saved.map((result) => [result.batteryId, result.battery]));
      setBatteries((current) =>
        current.map((battery) => savedById.get(battery.id) || battery)
      );
      setReceiptDrafts((current) => {
        const next = { ...current };
        for (const result of saved) next[result.batteryId] = receiptDraftFromBattery(result.battery);
        return next;
      });
      const latestJob = saved.at(-1)?.job;
      if (latestJob) setJob(latestJob);
      setReceiptDelivery(null);
    }
    setDirtyReceiptIds(new Set(failedIds));
    setDirtyReceiptFields((current) => {
      const next = { ...current };
      for (const result of saved) delete next[result.batteryId];
      return next;
    });
    setSavingReceiptRows(false);
    if (failedIds.length === 0) {
      toast({
        title: "Receipt table saved",
        description: `${saved.length} ${saved.length === 1 ? "row" : "rows"} updated.`,
      });
    } else {
      toast({
        title: "Some rows could not be saved",
        description: `${saved.length} saved; ${failedIds.length} still need saving.`,
        variant: "destructive",
      });
    }
  }

  async function updateStatus(newStatus: string) {
    if (!job || newStatus === job.status) return;
    if (
      isBackwardJobStatusChange(job.status, newStatus)
      && !window.confirm(
        `Move this job back to ${statusLabels[newStatus]}?\n\nLater workflow information may already have been recorded. Automatic progression can move the job forward again when a later milestone is completed.`
      )
    ) {
      return;
    }
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
        toast({ title: "Status updated", description: `Job marked as ${statusLabels[newStatus] || newStatus}.` });
      } else {
        toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error.", variant: "destructive" });
    }
  }

  async function updateBatteryAdmin(
    batteryId: number,
    updates: Record<string, string | boolean | null>
  ) {
    if (dirtyReceiptIds.has(batteryId)) {
      toast({
        title: "Save receipt changes first",
        description: "This battery has unsaved receipt-table changes. Save them before editing the collection row.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch(`/api/jobs/${params.id}/batteries/${batteryId}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to update battery");
      }
      setBatteries((current) =>
        current.map((battery) => (battery.id === batteryId ? data.battery : battery))
      );
      setReceiptDrafts((current) => ({
        ...current,
        [batteryId]: receiptDraftFromBattery(data.battery),
      }));
      setDirtyReceiptIds((current) => {
        const next = new Set(current);
        next.delete(batteryId);
        return next;
      });
      if (data.job) setJob(data.job);
      setReceiptDelivery(null);
      toast({ title: "Saved", description: "Battery details updated." });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update battery.",
        variant: "destructive",
      });
    }
  }

  async function addReplacementBattery() {
    const cellType = window.prompt("Cell type for the replacement row:");
    if (cellType === null) return;
    const voltage = window.prompt("Voltage (optional):") ?? "";
    const manufacture = window.prompt("Manufacturer (optional):") ?? "";
    const batterySerial = window.prompt("Battery serial or identifier (optional):") ?? "";
    const weight = window.prompt("Estimated weight in kg (required):");
    if (weight === null) return;
    try {
      const res = await fetch(`/api/jobs/${params.id}/batteries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cellType, voltage, manufacture, batterySerial, estimatedWeightKg: weight }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not add the row");
      setBatteries((current) => [...current, data.battery]);
      if (data.job) setJob(data.job);
      setReceiptDelivery(null);
      toast({ title: "Row added", description: "The replacement battery row is ready for receipt confirmation." });
    } catch (error) {
      toast({ title: "Could not add row", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  async function removeBattery(battery: BatteryData) {
    const label = battery.batterySerial || battery.assetNumber || battery.palletNumber || `item ${battery.id}`;
    if (!window.confirm(`Remove ${label} from this job? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/jobs/${params.id}/batteries/${battery.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not remove the row");
      setBatteries((current) => current.filter((item) => item.id !== battery.id));
      if (data.job) setJob(data.job);
      setReceiptDelivery(null);
      toast({ title: "Row removed", description: `${label} was removed from the job.` });
    } catch (error) {
      toast({ title: "Could not remove row", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
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
      if (data.job) setJob(data.job);
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setLocation("/jobs")}
              className="mr-2 flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#0f2744] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Jobs
            </button>
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
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="job-status-journey">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job progress</p>
                  <div className="mt-1 flex items-center gap-2" role="status" aria-label={`Current job status: ${statusLabels[job.status] || job.status}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${statusDotStyles[job.status] || "bg-slate-400"}`} aria-hidden="true" />
                    <span className="font-semibold text-[#0f2744]">{statusLabels[job.status] || job.status}</span>
                  </div>
                </div>
              </div>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Job status journey">
                {JOB_STATUS_JOURNEY.map((status, index) => {
                  const currentIndex = JOB_STATUS_JOURNEY.indexOf(job.status as (typeof JOB_STATUS_JOURNEY)[number]);
                  const isCurrent = status === job.status;
                  const isComplete = index < currentIndex;
                  return (
                    <li
                      key={status}
                      aria-current={isCurrent ? "step" : undefined}
                      aria-label={`${statusLabels[status]}: ${isCurrent ? "Current" : isComplete ? "Completed" : "Upcoming"}`}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        isCurrent
                          ? "border-sky-300 bg-sky-50 text-sky-800"
                          : isComplete
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {isComplete && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                        {statusLabels[status]}
                        <span className="sr-only"> — {isCurrent ? "Current" : isComplete ? "Completed" : "Upcoming"}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-sm text-slate-600" data-testid="job-next-step">
                <span className="font-semibold text-slate-700">Next step: </span>
                {getJobNextStep({
                  status: job.status,
                  scheduleStatus: job.scheduleStatus,
                  invoiceReceivedDate: job.invoiceReceivedDate,
                  invoiceStatus: job.invoiceStatus,
                  datePaid: job.datePaid,
                  receiptClientDeliveryStatus: job.receiptClientDeliveryStatus,
                  receiptAccountsDeliveryStatus: job.receiptAccountsDeliveryStatus,
                  remainingReviewCount: batteries.filter((battery) => !battery.receiptReviewed).length,
                })}
              </p>
            </div>
            {canManageStatus && (
              <div className="w-full shrink-0 xl:w-52">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="manual-job-status">
                  Change status
                </label>
                <Select value={job.status} onValueChange={updateStatus}>
                  <SelectTrigger id="manual-job-status" aria-label="Change job status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_STATUS_JOURNEY.map((status) => (
                      <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-slate-500">Use only for exceptions. Normal progress updates automatically.</p>
              </div>
            )}
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
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Submitted</p>
                <p className="text-sm text-slate-700">{formatDate(job.submittedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Tonnage (Depot)</p>
                <p className="text-sm text-slate-700">{parseFloat(job.tonnage).toFixed(3)}t</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                <Battery className="w-4 h-4 text-[#0ea5e9]" />
                <h4 className="font-semibold text-[#0f2744]">Battery Items ({batteries.length})</h4>
                </div>
                {canEditResolved && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={autofillReviewFields}
                    disabled={autofillingReview || !batteries.some((battery) =>
                      battery.serialFlagReason
                      || battery.manufacturerFlagReason
                      || battery.cellModelFlagReason
                      || battery.voltageFlagReason
                    )}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    {autofillingReview ? "Autofilling…" : "Autofill"}
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-200 bg-sky-50/50">
                      <th colSpan={10} className="px-4 py-4 text-left font-normal">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-[#0f2744]" />
                            <span className="font-semibold text-[#0f2744]">Collection Sheet Details</span>
                          </div>
                          <Button size="sm" onClick={saveSiteDetails} disabled={savingSiteDetails}>
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            {savingSiteDetails ? "Saving…" : "Save collection details"}
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Driver Name</label>
                            <Input value={job.driverName || ""} placeholder="Not assigned" disabled />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Vehicle Registration</label>
                            <Input value={job.vehicleReg || ""} placeholder="Not assigned" disabled />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Collection Date</label>
                            <Input
                              type="date"
                              value={siteDetails.collectionDate}
                              onChange={(e) => setSiteDetails((prev) => ({ ...prev, collectionDate: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Site Contacts</label>
                            <Input
                              value={siteDetails.siteContacts}
                              onChange={(e) => setSiteDetails((prev) => ({ ...prev, siteContacts: e.target.value }))}
                              placeholder="e.g. John Smith 07700 900123"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Site Hours</label>
                            <Input
                              value={siteDetails.siteHours}
                              onChange={(e) => setSiteDetails((prev) => ({ ...prev, siteHours: e.target.value }))}
                              placeholder="e.g. Mon–Fri 07:00–16:00"
                            />
                          </div>
                          <div className="xl:col-span-3">
                            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Special / Loading Instructions</label>
                            <Input
                              value={siteDetails.specialInstructions}
                              onChange={(e) => setSiteDetails((prev) => ({ ...prev, specialInstructions: e.target.value }))}
                              placeholder='Leave blank for "None"'
                            />
                          </div>
                          <div className="md:col-span-2 xl:col-span-4">
                            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Collection Notes</label>
                            <textarea
                              value={siteDetails.notes}
                              onChange={(e) => setSiteDetails((prev) => ({ ...prev, notes: e.target.value }))}
                              placeholder="Add any additional notes for this collection"
                              rows={3}
                              className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9] focus-visible:ring-offset-2"
                            />
                          </div>
                        </div>
                      </th>
                    </tr>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
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
                    {canEditReceipt && <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                      onClick={saveReceiptRows}
                      disabled={savingReceiptRows || dirtyReceiptIds.size === 0}
                    >
                      <Save className="w-3 h-3" />
                      {savingReceiptRows ? "Saving…" : `Save table${dirtyReceiptIds.size ? ` (${dirtyReceiptIds.size})` : ""}`}
                    </Button>}
                    {canEditResolved && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={addReplacementBattery}
                        disabled={savingReceiptRows}
                      >
                        <Plus className="w-3 h-3" />
                        Add row
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                      onClick={autoConfirmAll}
                      disabled={
                        savingReceiptRows
                        || autoConfirming
                        || !batteries.some((battery) => battery.receiptConfirmed !== true)
                      }
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {autoConfirming ? "Confirming…" : "Auto-confirm all"}
                    </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={recalculateAll}
                    disabled={savingReceiptRows || getEffectiveLmeRate() === null}
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
                      <th className="px-3 py-2.5 text-left font-semibold">Notes</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {batteries.map((b, i) => (
                      <BatteryAdminRow
                        key={b.id}
                        battery={b}
                        index={i}
                        draft={receiptDrafts[b.id] || receiptDraftFromBattery(b)}
                        onChange={updateReceiptDraft}
                        disabled={!canEditReceipt || savingReceiptRows}
                        onRemove={canEditResolved ? removeBattery : undefined}
                        lmeGbpRate={getEffectiveLmeRate()}
                        customerLmePercent={resolveCustomerLmePercent(
                          financials.customerTractionPercent,
                          financials.customerLmePercent
                        )}
                      />
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-right font-bold text-[#0f2744] text-xs uppercase">
                        Totals
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[#0f2744]">
                        {receivedTotals.pbKg.toFixed(3)} kg
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[#0f2744]">
                        £{receivedTotals.valueGbp.toFixed(2)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {canEditReceipt && <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700"
                  onClick={saveReceiptRows}
                  disabled={savingReceiptRows || dirtyReceiptIds.size === 0}
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingReceiptRows ? "Saving receipt table…" : `Save receipt table${dirtyReceiptIds.size ? ` (${dirtyReceiptIds.size})` : ""}`}
                </Button>
              </div>}
            </div>

            <div className="border-t border-slate-200 pt-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h4 className="font-semibold text-[#0f2744] flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-[#0ea5e9]" />
                  Financial Details (Master Job Log)
                </h4>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-500">
                    Traction and Blocs are calculated separately using the workbook rules.
                  </p>
                  {!financialEditing && canEditFinancials && (
                    <Button variant="outline" size="sm" onClick={startEditingFinancials}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit Financial Master
                    </Button>
                  )}
                </div>
              </div>
              <fieldset disabled={!financialEditing}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.1fr_1.1fr]">
                <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-4 border-b border-slate-200 pb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600">Summary</p>
                    <h5 className="mt-1 text-base font-bold text-[#0f2744]">LME / Profit</h5>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-slate-500">
                        Collection month LME price
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">£</span>
                        <Input
                          value={collectionLmeUsable && collectionLmePrice ? collectionLmePrice.gbpPrice : ""}
                          placeholder="Unavailable"
                          readOnly
                          className="bg-white pl-7 font-semibold text-[#0f2744]"
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                        {siteDetails.collectionDate !== (job?.collectionDate || "")
                          ? "Save the changed collection date to apply its monthly LME price"
                          : collectionLmeStatus === "loading"
                          ? "Loading the LME price for the collection month…"
                          : collectionLmePrice
                          ? `Effective ${new Date(`${collectionLmePrice.priceDate}T00:00:00`).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })} · based on collection date`
                          : job?.collectionDate
                          ? "No LME price is available for the collection month"
                          : "Set a collection date to select the applicable LME price"}
                      </p>
                    </div>
                    <FinancialField label="Net Profit" value={collectionLmeUsable ? financials.netProfit : ""} onChange={() => {}} prefix="£" computed />
                    <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-4 text-sky-800">
                      Waste Collector invoice value less Customer invoice value.
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
                      label="Spot (LME)"
                      value={financials.wasteSpotRate}
                      onChange={(v) => setFinancials((p) => ({ ...p, wasteSpotRate: v }))}
                      icon={<PoundSterling className="w-3.5 h-3.5" />}
                      prefix="£"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FinancialField label="% Spot Traction" value={financials.wasteTractionPercent} onChange={(v) => setFinancials((p) => ({ ...p, wasteTractionPercent: v }))} suffix="%" />
                      <FinancialField label="£/t Traction" value={financials.wasteTractionRate} onChange={() => {}} prefix="£" computed />
                      <FinancialField label="£/t Blocs" value={financials.wasteBlocsRate} onChange={() => {}} prefix="£" computed />
                      <div className="col-span-2 grid grid-cols-2 gap-3">
                        <FinancialField label="Pb tonnage Traction" value={financials.wasteTractionTonnage} onChange={(v) => setFinancials((p) => ({ ...p, wasteTractionTonnage: v }))} suffix="t" />
                        <FinancialField label="Pb tonnage Blocs" value={financials.wasteBlocsTonnage} onChange={(v) => setFinancials((p) => ({ ...p, wasteBlocsTonnage: v }))} suffix="t" />
                      </div>
                    </div>
                    <FinancialField label="Ad hoc costs" value={financials.wasteAdHocCosts} onChange={(v) => setFinancials((p) => ({ ...p, wasteAdHocCosts: v }))} prefix="£" />
                    <FinancialField label="Transport" value={financials.wasteTransportCost} onChange={(v) => setFinancials((p) => ({ ...p, wasteTransportCost: v }))} prefix="£" />
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
                      label="Invoice Value"
                      value={financials.wasteInvoiceValue}
                      onChange={() => {}}
                      prefix="£"
                      computed
                    />
                    <FinancialField
                      label="Invoice No."
                      value={financials.wasteInvoiceNo}
                      onChange={(v) => setFinancials((p) => ({ ...p, wasteInvoiceNo: v }))}
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
                    <div className="grid grid-cols-2 gap-3">
                      <FinancialField label="% LME Traction" value={financials.customerTractionPercent} onChange={(v) => setFinancials((p) => ({ ...p, customerTractionPercent: v }))} suffix="%" />
                      <FinancialField label="% LME Blocs" value={financials.customerBlocsPercent} onChange={(v) => setFinancials((p) => ({ ...p, customerBlocsPercent: v }))} suffix="%" />
                       <FinancialField label="£/t Traction" value={collectionLmeUsable ? financials.customerTractionRate : ""} onChange={() => {}} prefix="£" computed />
                       <FinancialField label="£/t Blocs" value={collectionLmeUsable ? financials.customerBlocsRate : ""} onChange={() => {}} prefix="£" computed />
                      <FinancialField label="Pb tonnage Traction" value={financials.customerTractionTonnage} onChange={() => {}} suffix="t" computed />
                      <FinancialField label="Pb tonnage Blocs" value={financials.customerBlocsTonnage} onChange={(v) => setFinancials((p) => ({ ...p, customerBlocsTonnage: v }))} suffix="t" />
                    </div>
                    <FinancialField label="Ad hoc costs" value={financials.customerAdHocCosts} onChange={(v) => setFinancials((p) => ({ ...p, customerAdHocCosts: v }))} prefix="£" />
                    <FinancialField label="Transport" value={financials.customerTransportCost} onChange={(v) => setFinancials((p) => ({ ...p, customerTransportCost: v }))} prefix="£" />
                    <FinancialField
                      label="Customer Invoice Value £"
                      value={collectionLmeUsable ? financials.customerInvoiceValue : ""}
                      onChange={() => {}}
                      prefix="£"
                      computed
                    />
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
                <fieldset disabled={!canManageStatus} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                       Days left to pay
                    </label>
                    <div className="h-9 flex items-center px-3 text-sm font-medium rounded-md border border-slate-200 bg-sky-50/50">
                      {(() => {
                        const status = getInvoiceDueStatus(financials.dueDate, financials.datePaid);
                        const toneClass = {
                          neutral: "text-slate-400",
                          good: "text-green-600",
                          warning: "text-amber-600",
                          overdue: "text-red-600",
                        }[status.tone];
                        return <span className={toneClass}>{status.label}</span>;
                      })()}
                    </div>
                  </div>
                </fieldset>
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
                      disabled={!canManageStatus}
                      onClick={() => setFinancials((p) => ({ ...p, invoiceStatus: opt.value }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
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

              {financialEditing && (
                <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100">
                  <Button
                    onClick={saveFinancials}
                    disabled={saving}
                    className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Financial Master"}
                  </Button>
                  <Button variant="outline" onClick={cancelEditingFinancials} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              )}
              </fieldset>

              {(userRole === "accounts" || userRole === "head_office_admin") && (
                <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50/60 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h5 className="font-semibold text-[#0f2744] flex items-center gap-2">
                        <Mail className="h-4 w-4 text-sky-600" />
                        Completed receipt delivery
                      </h5>
                      {!receiptDelivery ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Once all receipt checks and financial values are complete, preview the client and accounts recipients.
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
      <td className="px-3 py-2.5 text-slate-700">
        {canEdit ? <InlineFlagEdit initialValue={battery.palletNumber} placeholder="Pallet" onSave={(v) => onSaveField(battery.id, { palletNumber: v })} subtle allowEmpty /> : battery.palletNumber || "—"}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {canEdit ? <InlineFlagEdit initialValue={battery.assetNumber} placeholder="Asset" onSave={(v) => onSaveField(battery.id, { assetNumber: v })} subtle allowEmpty /> : battery.assetNumber || "—"}
      </td>
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
        ) : canEdit ? (
          <InlineFlagEdit initialValue={battery.batterySerial} placeholder="Serial" onSave={(v) => onSaveField(battery.id, { batterySerial: v })} subtle allowEmpty />
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
        ) : canEdit ? (
          <InlineFlagEdit initialValue={battery.voltage} placeholder="Voltage" onSave={(v) => onSaveField(battery.id, { voltage: v })} subtle allowEmpty />
        ) : (
          battery.voltage || "—"
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {canEdit ? (
          <InlineFlagEdit
            initialValue={battery.looseCellsQty == null ? null : String(battery.looseCellsQty)}
            placeholder="Loose qty"
            onSave={(v) => onSaveField(battery.id, { looseCellsQty: v })}
            subtle
            allowEmpty
            inputType="number"
          />
        ) : battery.looseCellsQty ?? "—"}
      </td>
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
      <td className="px-3 py-2.5 text-slate-500 max-w-[240px]">
        <div className="flex flex-col gap-0.5">
          {canEdit ? (
            <InlineFlagEdit initialValue={battery.notes} placeholder="Notes" onSave={(v) => onSaveField(battery.id, { notes: v })} subtle allowEmpty />
          ) : (
            <span className="truncate">{battery.notes || "—"}</span>
          )}
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
  allowEmpty = false,
  inputType = "text",
}: {
  initialValue: string | null;
  placeholder: string;
  onSave: (value: string) => void;
  extraAction?: { label: string; onClick: () => void };
  suggestions?: { label: string; hint?: string }[];
  subtle?: boolean;
  allowEmpty?: boolean;
  inputType?: "text" | "number";
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
        type={inputType}
        min={inputType === "number" ? 0 : undefined}
        step={inputType === "number" ? 1 : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (allowEmpty || value.trim())) {
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
        disabled={!allowEmpty && !value.trim()}
        onClick={() => {
          if (!allowEmpty && !value.trim()) return;
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
  draft,
  onChange,
  disabled,
  onRemove,
  lmeGbpRate,
  customerLmePercent,
}: {
  battery: BatteryData;
  index: number;
  draft: ReceiptDraft;
  onChange: (id: number, updates: Partial<ReceiptDraft>) => void;
  disabled: boolean;
  onRemove?: (battery: BatteryData) => void;
  lmeGbpRate: number | null;
  customerLmePercent: string;
}) {
  const [isAutoCalced, setIsAutoCalced] = useState(false);

  useEffect(() => {
    if (disabled || lmeGbpRate === null) return;
    const pbNum = battery.pbContentKg ? parseFloat(battery.pbContentKg) : null;
    if (pbNum !== null && isFinite(pbNum) && !battery.valueGbp) {
      const valNum = calculateReceiptValueGbp(pbNum, lmeGbpRate, customerLmePercent);
      if (valNum !== null) {
        onChange(battery.id, { valueGbp: valNum.toFixed(2) });
        setIsAutoCalced(true);
      }
    }
  }, [battery.id, battery.pbContentKg, battery.valueGbp, disabled, lmeGbpRate, customerLmePercent]);

  function handleRecalculate() {
    const pbNum = draft.pbContentKg ? parseFloat(draft.pbContentKg) : null;
    const valNum = calculateReceiptValueGbp(pbNum, lmeGbpRate, customerLmePercent);
    if (valNum !== null) onChange(battery.id, { valueGbp: valNum.toFixed(2) });
    setIsAutoCalced(true);
  }

  const canRecalculate = draft.pbContentKg && lmeGbpRate !== null;

  return (
    <tr className={index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}>
      <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
      <td className="px-3 py-2.5 text-slate-700 font-medium">
        {battery.batterySerial || battery.palletNumber || "—"}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant="outline" className="text-xs">{battery.cellType || "—"}</Badge>
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {battery.isLooseCells ? (
          <Input
            disabled={disabled}
            value={draft.voltage}
            onChange={(e) => onChange(battery.id, { voltage: e.target.value })}
            placeholder="Enter voltage"
            className="h-8 w-28 bg-slate-50 text-sm"
            aria-label={`Voltage for loose cells row ${index + 1}`}
          />
        ) : (
          battery.voltage || "—"
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <div className="flex flex-col items-center gap-1">
          <Switch
            disabled={disabled}
            checked={draft.receiptConfirmed}
            onCheckedChange={(checked) => onChange(battery.id, { receiptConfirmed: checked })}
          />
          {battery.receiptReviewed && (
            <span className="text-[10px] font-medium text-green-700">Reviewed</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Input
          disabled={disabled}
          type="number"
          step="0.001"
          placeholder="0.000"
          className={`h-8 w-24 text-sm ${isAutoCalced && draft.pbContentKg ? "bg-sky-50 border-sky-200" : "bg-slate-50"}`}
          value={draft.pbContentKg}
          onChange={(e) => { onChange(battery.id, { pbContentKg: e.target.value }); setIsAutoCalced(false); }}
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          disabled={disabled}
          type="number"
          step="0.01"
          placeholder="0.00"
          className={`h-8 w-24 text-sm ${isAutoCalced && draft.valueGbp ? "bg-sky-50 border-sky-200" : "bg-slate-50"}`}
          value={draft.valueGbp}
          onChange={(e) => { onChange(battery.id, { valueGbp: e.target.value }); setIsAutoCalced(false); }}
        />
      </td>
      <td className="px-3 py-2.5">
        <textarea
          disabled={disabled}
          placeholder="Add notes…"
          rows={2}
          className="min-h-16 w-56 resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={draft.notes}
          onChange={(e) => onChange(battery.id, { notes: e.target.value })}
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
              disabled={disabled}
              title="Recalculate Pb & Value"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onRemove(battery)}
              disabled={disabled}
              title="Remove row"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
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
