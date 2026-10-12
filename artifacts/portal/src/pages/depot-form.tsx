import { isAdmin as isAdminRole, isCustomer as isCustomerRole } from "@/lib/roles";
import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import {
  Package,
  Battery,
  Camera,
  Upload,
  Save,
  Send,
  FileText,
  Clipboard,
  Zap,
  X,
  Plus,
  Clock,
  ChevronLeft,
  Trash2,
  MapPin,
  Factory,
  Layers,
  Check,
  ChevronsUpDown,
  Search,
  ChevronDown,
  AlertTriangle,
  Copy,
  Download,
  Lightbulb,
} from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isUnknownManufacturerValue } from "@/lib/manufacturer-policy";
export { isUnknownManufacturerValue } from "@/lib/manufacturer-policy";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { JOB_NOTES_DESCRIPTION, JOB_NOTES_PLACEHOLDER } from "@/lib/collection-notes-copy";
import { reviewFlagAfterWeightCorrection, TOKEN_WEIGHT_FLAG_REASON } from "@/lib/battery-review";
import {
  canonicalizeVoltageInput,
  isPositiveIntegerInput,
  isProvisionalLooseCellInput,
  manufacturerMatches,
  parsePositiveWeightInput,
  rankCellTypeSuggestions,
  selectPreferredCatalogueModel,
} from "@/lib/cell-type-suggestions";


interface CellModelOption {
  id: number;
  manufacturer: string;
  modelName: string;
  cellFamily: string;
  cellHeightMm: number;
  cellsCount: number;
  weightPerCellKg: string;
}

interface BatteryRow {
  id: string;
  palletNumber: string;
  assetNumber: string;
  batterySerial: string;
  manufacture: string;
  manufactureCustom: string;
  cellType: string;
  cellModel: string;
  voltage: string;
  customVoltage: string;
  looseCellsQty: string;
  estimatedWeightKg: string;
  weightManual: boolean;
  notes: string;
  isLooseCells: boolean;
  manufacturerFlagReason: string;
  cellModelFlagReason: string;
  voltageFlagReason: string;
  rowPhoto: string;
  manufacturerSuggestion?: string;
  cellTypeSuggestion?: string;
  voltageSuggestion?: string;
  manufacturerManuallyConfirmed?: boolean;
  cellTypeManuallyConfirmed?: boolean;
  voltageManuallyConfirmed?: boolean;
  manufacturerSuggestionConfidence?: "high" | "low";
  cellTypeSuggestionConfidence?: "high" | "low";
  voltageSuggestionConfidence?: "high" | "low";
  manufacturerOriginalValue?: string;
  cellTypeOriginalValue?: string;
  voltageOriginalValue?: string;
  manufacturerSuggestedValue?: string;
  cellTypeSuggestedValue?: string;
  voltageSuggestedValue?: string;
  manufacturerWasAccepted?: boolean;
  cellTypeWasAccepted?: boolean;
  voltageWasAccepted?: boolean;
}

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
  clientId: number | null;
  locationId: number | null;
  clientName: string | null;
  locationName: string | null;
}

interface LocationOption {
  id: number;
  name: string;
  address: string | null;
  siteContacts: string | null;
  siteContactName: string | null;
  siteContactPhone: string | null;
  siteContact2Name: string | null;
  siteContact2Phone: string | null;
  siteContact3Name: string | null;
  siteContact3Phone: string | null;
  siteHours: string | null;
  specialInstructions: string | null;
}

function locationContacts(location: LocationOption): string {
  const structured = [
    [location.siteContactName, location.siteContactPhone],
    [location.siteContact2Name, location.siteContact2Phone],
    [location.siteContact3Name, location.siteContact3Phone],
  ]
    .map((parts) => parts.filter(Boolean).join(" — "))
    .filter(Boolean);
  return structured.length > 0 ? structured.join("\n") : (location.siteContacts || "");
}

function createEmptyBattery(): BatteryRow {
  return {
    id: crypto.randomUUID(),
    palletNumber: "",
    assetNumber: "",
    batterySerial: "",
    manufacture: "",
    manufactureCustom: "",
    cellType: "",
    cellModel: "",
    voltage: "",
    customVoltage: "",
    looseCellsQty: "",
    estimatedWeightKg: "",
    weightManual: false,
    notes: "",
    isLooseCells: false,
    manufacturerFlagReason: "",
    cellModelFlagReason: "",
    voltageFlagReason: "",
    rowPhoto: "",
  };
}

const SAFE_LOAD_FACTOR = 1.4;

const CSV_TEMPLATE_HEADERS = "Pallet Number,Asset No,Battery Serial,Manufacturer,Loose Cells Qty,Voltage,Cell Type,Notes";

const CSV_FLAG_REASON = "Missing from CSV import";
const CSV_UNKNOWN_FLAG_REASON = "Unknown value from CSV — please correct";
const MANUAL_UNKNOWN_FLAG_REASON = "Unrecognised value — not found in master list";
const OTHER_REVIEW_FLAG_REASON = "Other — requires Itinium review";
const TOKEN_WEIGHT_KG = 500;
type LoadState = "empty" | "red-low" | "red-high" | "amber-low" | "amber-high" | "green";

export function getLoadState(currentLoad: number, maxCapacity = 26): LoadState {
  if (currentLoad > 0 && currentLoad < 9.5) return "red-low";
  if (currentLoad > maxCapacity) return "red-high";
  if (currentLoad >= 9.5 && currentLoad < 10) return "amber-low";
  if (currentLoad > 24 && currentLoad <= maxCapacity) return "amber-high";
  if (currentLoad >= 10 && currentLoad <= 24) return "green";
  return "empty";
}
const VOLTAGE_VALUES = ["12V", "24V", "36V", "40V", "48V", "80V", "96V"];

function isReviewableProvisionalRow(battery: BatteryRow): boolean {
  return isProvisionalLooseCellInput({
    isLooseCells: battery.isLooseCells,
    looseCellsQty: battery.looseCellsQty,
    estimatedWeightKg: battery.estimatedWeightKg,
    weightManual: battery.weightManual,
    hasUnknownCellType:
      battery.cellModelFlagReason === MANUAL_UNKNOWN_FLAG_REASON ||
      battery.cellModelFlagReason === CSV_UNKNOWN_FLAG_REASON,
  });
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Parse loose-cell breakdowns written in a notes field, e.g.
// "36 X 5PZS775 + 1 X 6PZS930" -> [{qty: 36, model: "5PZS775"}, {qty: 1, model: "6PZS930"}].
// Only returns segments when the whole note reads as quantity-x-model
// groups; anything else returns [] so free-text notes are never misread.
function parseLooseCellNoteSegments(notes: string): { qty: number; model: string }[] {
  const text = (notes || "").trim();
  if (!text) return [];
  const segmentRe = /(\d+)\s*[xX×]\s*([A-Za-z0-9][A-Za-z0-9 .\/-]*?)(?=\s*(?:[+,;&]|\band\b|$))/g;
  const segments: { qty: number; model: string }[] = [];
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = segmentRe.exec(text)) !== null) {
    const qty = parseInt(match[1], 10);
    const model = match[2].trim();
    // Model names must contain letters ("5PZS775"); reject pure numbers.
    if (!isFinite(qty) || qty <= 0 || !model || !/[A-Za-z]/.test(model)) return [];
    // Reject if there is meaningful text between segments (free-form notes).
    const between = text.slice(consumed, match.index).replace(/[\s+,;&]|and/gi, "");
    if (between) return [];
    segments.push({ qty, model });
    consumed = match.index + match[0].length;
  }
  const trailing = text.slice(consumed).replace(/[\s+,;&.]/g, "");
  if (trailing) return [];
  return segments;
}

function findClosestMatch(value: string, candidates: string[], minSimilarity = 0.6): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  let best: { candidate: string; sim: number } | null = null;
  for (const c of candidates) {
    const cl = c.toLowerCase();
    if (cl === v) return null;
    const dist = levenshtein(v, cl);
    const maxLen = Math.max(v.length, cl.length);
    if (maxLen === 0) continue;
    const sim = 1 - dist / maxLen;
    if (!best || sim > best.sim) best = { candidate: c, sim };
  }
  return best && best.sim >= minSimilarity ? best.candidate : null;
}

function validateBatteryField(
  field: "manufacture" | "cellType" | "voltage",
  value: string,
  manufacturers: string[],
  cellModels: CellModelOption[],
  aliases: Record<string, string>
): string {
  const v = value.trim();
  if (!v) return "";
  switch (field) {
    case "manufacture": {
      // Unknown/placeholder manufacturers are accepted using TAB weights.
      if (isUnknownManufacturerValue(v)) return "";
      const knownLower = new Set(manufacturers.map((m) => m.toLowerCase()));
      if (knownLower.has(v.toLowerCase())) return "";
      if (Object.keys(aliases).some((a) => a.toLowerCase() === v.toLowerCase())) return "";
      return MANUAL_UNKNOWN_FLAG_REASON;
    }
    case "cellType": {
      if (v === "Other") return OTHER_REVIEW_FLAG_REASON;
      if (v === "Blocs") return "";
      const normV = normalizeForMatch(v);
      if (cellModels.some((m) => normalizeForMatch(m.cellFamily) === normV)) return "";
      if (cellModels.some((m) => normalizeForMatch(m.modelName) === normV)) return "";
      return MANUAL_UNKNOWN_FLAG_REASON;
    }
    case "voltage": {
      if (VOLTAGE_VALUES.some((o) => o.toLowerCase() === v.toLowerCase())) return "";
      return MANUAL_UNKNOWN_FLAG_REASON;
    }
  }
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

const SPECIAL_TYPES = [
  { value: "Blocs", label: "Blocs (Loose Cells)" },
  { value: "Other", label: "Other" },
];

const VOLTAGE_OPTIONS = [
  { value: "12V", label: "12V" },
  { value: "24V", label: "24V" },
  { value: "36V", label: "36V" },
  { value: "40V", label: "40V" },
  { value: "48V", label: "48V" },
  { value: "80V", label: "80V" },
  { value: "96V", label: "96V" },
  { value: "Other", label: "Other" },
];

const DEFAULT_MANUFACTURERS = [
  "EnerSys / Hawker",
  "Espex",
  "Eternity / Juice",
  "Exide / GNB",
  "Hoppecke",
  "Midac",
  "TAB",
  "Triathlon / Sunlight",
  "Velaris / Ecobat / EDrive",
  "Other",
];

interface CollectionPointPreset {
  id: number;
  name: string;
  address: string;
}

export default function DepotFormPage() {
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const showReviewFeedback = isAdminRole(user);
  const [provisionalAck, setProvisionalAck] = useState(false);
  const [collectionPoint, setCollectionPoint] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [batteries, setBatteries] = useState<BatteryRow[]>([createEmptyBattery()]);
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(null);
  // A draft starts locked until its saved import history has been restored.
  const [csvImported, setCsvImported] = useState(() => new URLSearchParams(searchStr).has("draft"));
  const csvImportedRef = useRef(csvImported);
  const [csvReading, setCsvReading] = useState(false);
  const csvReadingRef = useRef(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [pendingCsvImport, setPendingCsvImport] = useState<{
    rows: BatteryRow[];
    issues: {
      rowNum: number;
      rowId: string;
      fields: {
        label: string;
        target: "manufacture" | "cellModel" | "voltage";
        suggestion?: string;
      }[];
    }[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tonnageOverride, setTonnageOverride] = useState("");
  const [tonnageManual, setTonnageManual] = useState(false);
  const [manufacturers, setManufacturers] = useState<string[]>(DEFAULT_MANUFACTURERS);
  const [manufacturerAliases, setManufacturerAliases] = useState<Record<string, string>>({});
  const [manufacturersStatus, setManufacturersStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mfrPopoverOpen, setMfrPopoverOpen] = useState<Record<string, boolean>>({});
  const [cellModels, setCellModels] = useState<CellModelOption[]>([]);
  const [cellModelsStatus, setCellModelsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [queuedCsvFile, setQueuedCsvFile] = useState<File | null>(null);
  const [collectionPointPresets, setCollectionPointPresets] = useState<CollectionPointPreset[]>([]);
  const [showCPDropdown, setShowCPDropdown] = useState(false);
  const cpInputRef = useRef<HTMLInputElement>(null);
  const cpDropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [clientLocations, setClientLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [siteContacts, setSiteContacts] = useState("");
  const [siteHours, setSiteHours] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [fetchingSuggestions, setFetchingSuggestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const draftParam = params.get("draft");
    const draftIdFromUrl = draftParam ? parseInt(draftParam, 10) : null;

    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          if (data.user.clientId && isCustomerRole(data.user)) {
            fetch(`/api/clients/${data.user.clientId}/locations`, { credentials: "include" })
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                if (d?.locations) {
                  const locations = d.locations as LocationOption[];
                  setClientLocations(locations);
                  if (!draftIdFromUrl && data.user.locationId) {
                    const selected = locations.find((location) => location.id === data.user.locationId);
                    if (selected) {
                      setSelectedLocationId(String(selected.id));
                      setCollectionPoint(selected.address || "");
                      setSiteContacts(locationContacts(selected));
                      setSiteHours(selected.siteHours || "");
                      setSpecialInstructions(selected.specialInstructions || "");
                    }
                  }
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
    loadManufacturers();

    fetch("/api/collection-points", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.collectionPoints) setCollectionPointPresets(data.collectionPoints);
      })
      .catch(() => {});

    if (draftIdFromUrl && !isNaN(draftIdFromUrl)) {
      fetch("/api/job-drafts", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.drafts) return;
          const draft = data.drafts.find((d: { id: number }) => d.id === draftIdFromUrl);
          if (!draft) return;
          try {
            const fd = typeof draft.formData === "string" ? JSON.parse(draft.formData) : draft.formData;
            // Older populated drafts have no reliable import provenance.
            // Lock their upload rather than risk duplicating existing rows.
            const alreadyImported = typeof fd.csvImported === "boolean"
              ? fd.csvImported
              : Array.isArray(fd.batteries) && fd.batteries.some((b: BatteryRow) =>
                  b.assetNumber || b.batterySerial || b.cellType || b.cellModel || b.palletNumber);
            csvImportedRef.current = alreadyImported;
            setCsvImported(alreadyImported);
            if (fd.collectionPoint !== undefined) setCollectionPoint(fd.collectionPoint || "");
            if (fd.jobNotes !== undefined) setJobNotes(fd.jobNotes || "");
            if (fd.tonnageOverride !== undefined) setTonnageOverride(fd.tonnageOverride || "");
            if (fd.tonnageManual !== undefined) setTonnageManual(!!fd.tonnageManual);
            if (fd.selectedLocationId !== undefined) setSelectedLocationId(fd.selectedLocationId || "");
            if (fd.siteContacts !== undefined) setSiteContacts(fd.siteContacts || "");
            if (fd.siteHours !== undefined) setSiteHours(fd.siteHours || "");
            if (fd.specialInstructions !== undefined) setSpecialInstructions(fd.specialInstructions || "");
            if (fd.batteries && Array.isArray(fd.batteries) && fd.batteries.length > 0) {
              setBatteries(fd.batteries);
            }
            setCurrentDraftId(draftIdFromUrl);
          } catch {
          }
        })
        .catch(() => {});
    }
  }, []);

  async function loadManufacturers(): Promise<boolean> {
    setManufacturersStatus("loading");
    try {
      const res = await fetch("/api/manufacturers", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load manufacturers (${res.status})`);
      const data = await res.json();
      if (data?.manufacturers?.length) setManufacturers(data.manufacturers);
      if (data?.aliases) setManufacturerAliases(data.aliases);
      setManufacturersStatus("ready");
      return true;
    } catch {
      setManufacturersStatus("error");
      return false;
    }
  }

  async function loadCellModels(): Promise<boolean> {
    setCellModelsStatus("loading");
    try {
      const res = await fetch("/api/cell-models", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load cell models (${res.status})`);
      const data = await res.json();
      setCellModels(data?.models || []);
      setCellModelsStatus("ready");
      return true;
    } catch {
      setCellModelsStatus("error");
      return false;
    }
  }

  useEffect(() => {
    loadCellModels();

    function handleClickOutside(e: MouseEvent) {
      if (
        cpDropdownRef.current &&
        !cpDropdownRef.current.contains(e.target as Node) &&
        cpInputRef.current &&
        !cpInputRef.current.contains(e.target as Node)
      ) {
        setShowCPDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCPPresets = collectionPointPresets.filter(
    (cp) =>
      cp.name.toLowerCase().includes(collectionPoint.toLowerCase()) ||
      cp.address.toLowerCase().includes(collectionPoint.toLowerCase())
  );

  async function fetchWeightFromApi(cellType: string, voltage: string | null, cellModel?: string, manufacturer?: string): Promise<string> {
    if (!cellType && !cellModel) return "";
    const params = new URLSearchParams();
    if (cellModel) params.set("cellModel", cellModel);
    if (cellType) params.set("cellType", cellType);
    if (voltage) params.set("voltage", voltage);
    if (manufacturer) params.set("manufacturer", manufacturer);
    try {
      const res = await fetch(`/api/weight-reference/lookup?${params}`, { credentials: "include" });
      if (!res.ok) return "";
      const data = await res.json();
      return data.reference?.weightKg || "";
    } catch {
      return "";
    }
  }

  const weightLookupVersion = useRef<Record<string, number>>({});

  async function computeAndSetAutoWeight(battery: BatteryRow) {
    if (battery.weightManual) return;
    const version = (weightLookupVersion.current[battery.id] || 0) + 1;
    weightLookupVersion.current[battery.id] = version;

    let weight = "";
    if (battery.isLooseCells) {
      if (battery.cellType && battery.looseCellsQty) {
        const qty = parseInt(battery.looseCellsQty, 10);
        if (!isNaN(qty) && qty > 0) {
          let perCell = "";
          if (battery.cellType === "Blocs" || battery.cellType === "Other") {
            perCell = await fetchWeightFromApi(battery.cellType, null);
          } else {
            // Prefer the cell model catalogue: per-cell weights are stored
            // directly against each model (same manufacturer/TAB preference
            // as full batteries — "Unknown" manufacturers use TAB weights).
            const rawEffMfr = battery.manufacture === "Other" ? battery.manufactureCustom : battery.manufacture;
            const effMfr = rawEffMfr.trim().toLowerCase() === "unknown" ? "" : rawEffMfr;
            const modelKey = battery.cellModel || battery.cellType;
            const matchedModel = selectPreferredCatalogueModel(
              cellModels,
              effMfr,
              modelKey
            );
            if (matchedModel) {
              perCell = matchedModel.weightPerCellKg;
            } else {
              // Legacy PZS/PZB/PZV references are keyed by voltage; derive
              // per-cell weight by dividing any reference entry by its cell
              // count (each cell = 2V, so a 12V battery contains 6 cells).
              const ref = await fetchWeightFromApi(battery.cellType, "12V");
              if (ref) {
                perCell = (parseFloat(ref) / 6).toFixed(3);
              }
            }
          }
          if (perCell) {
            weight = (parseFloat(perCell) * qty).toFixed(3);
          }
        }
      }
    } else if (battery.cellType === "Blocs") {
      const perBloc = await fetchWeightFromApi("Blocs", null);
      const qty = parseInt(battery.looseCellsQty, 10);
      if (perBloc && !isNaN(qty) && qty > 0) {
        weight = (parseFloat(perBloc) * qty).toFixed(3);
      }
    } else if (battery.cellType === "Other") {
      weight = await fetchWeightFromApi("Other", null);
    } else if ((battery.cellModel || battery.cellType) && battery.voltage) {
      const rawEffMfr = battery.manufacture === "Other" ? battery.manufactureCustom : battery.manufacture;
      // "Unknown" manufacturers default to TAB weights (client convention).
      const effMfr = rawEffMfr.trim().toLowerCase() === "unknown" ? "" : rawEffMfr;
      const matchedModel = selectPreferredCatalogueModel(
        cellModels,
        effMfr,
        battery.cellModel || battery.cellType
      );
      const effectiveVoltage = battery.voltage === "Other" ? battery.customVoltage : battery.voltage;
      const voltageMatch = String(effectiveVoltage).trim().match(/^(\d+)\s*V?$/i);
      const voltageNum = voltageMatch ? Number(voltageMatch[1]) : NaN;
      if (matchedModel && !isNaN(voltageNum) && voltageNum > 0 && voltageNum % 2 === 0) {
        const numCells = voltageNum / 2;
        weight = (parseFloat(matchedModel.weightPerCellKg) * numCells).toFixed(3);
      } else if (!matchedModel && !battery.cellModel && effectiveVoltage) {
        // Legacy family-only references remain supported. A full designation
        // in cellType must first use the catalogue, including restored drafts.
        weight = await fetchWeightFromApi(battery.cellType, effectiveVoltage);
      }
    }
    if (weightLookupVersion.current[battery.id] !== version) return;
    setBatteries((prev) =>
      prev.map((b) => (b.id === battery.id && !b.weightManual ? {
        ...b,
        estimatedWeightKg: weight,
        cellModelFlagReason: reviewFlagAfterWeightCorrection(b.cellModelFlagReason, weight),
      } : b))
    );
  }

  function canComputeWeight(b: BatteryRow): boolean {
    if (b.isLooseCells) {
      return !!(b.cellType && b.looseCellsQty && parseInt(b.looseCellsQty, 10) > 0);
    }
    if (b.cellType === "Blocs") return !!(b.looseCellsQty && parseInt(b.looseCellsQty, 10) > 0);
    if (b.cellType === "Other") return true;
    if (b.cellModel && b.voltage) return cellModels.length > 0;
    if (b.cellType && b.voltage) {
      return b.voltage !== "Other" || !!b.customVoltage;
    }
    return false;
  }

  function weightSignature(b: BatteryRow): string {
    return [
      b.isLooseCells ? 1 : 0,
      b.cellType,
      b.cellModel,
      b.voltage,
      b.customVoltage,
      b.looseCellsQty,
      b.manufacture,
      b.manufactureCustom,
      cellModels.length,
    ].join("|");
  }

  const weightRetryAttempt = useRef<Record<string, string>>({});

  // Safety net: if a row is fully specified but its auto weight never resolved
  // (e.g. a lookup raced an edit, failed transiently, or fired before the
  // cell-model catalogue loaded), re-trigger the lookup so no completed row
  // silently contributes zero to the total load.
  useEffect(() => {
    for (const b of batteries) {
      if (b.weightManual || b.estimatedWeightKg) continue;
      if (!canComputeWeight(b)) continue;
      const sig = weightSignature(b);
      if (weightRetryAttempt.current[b.id] === sig) continue;
      weightRetryAttempt.current[b.id] = sig;
      computeAndSetAutoWeight(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batteries, cellModels]);

  function getSelectedLocationName(): string {
    if (selectedLocationId) {
      const loc = clientLocations.find((l) => String(l.id) === selectedLocationId);
      if (loc) return loc.name;
    }
    return user?.locationName || "";
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = import.meta.env.BASE_URL;
  }

  function cloneBatteryRow(id: string) {
    setBatteries((prev) => {
      const source = prev.find((b) => b.id === id);
      if (!source) return prev;
      const clone: BatteryRow = {
        ...source,
        id: crypto.randomUUID(),
        assetNumber: "",
        batterySerial: "",
        rowPhoto: "",
      };
      const idx = prev.findIndex((b) => b.id === id);
      const updated = [...prev];
      updated.splice(idx + 1, 0, clone);
      return updated;
    });
  }

  function downloadCsvTemplate() {
    const blob = new Blob([CSV_TEMPLATE_HEADERS + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "battery-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCsvImport(file: File) {
    if (csvImportedRef.current || csvReadingRef.current || pendingCsvImport) return;
    csvReadingRef.current = true;
    setCsvReading(true);
    if (cellModelsStatus === "loading" || manufacturersStatus === "loading") {
      setQueuedCsvFile(file);
      toast({
        title: "Preparing import",
        description: "Waiting for reference data to finish loading — your file will be imported automatically.",
      });
      return;
    }
    if (cellModelsStatus === "error" || manufacturersStatus === "error") {
      setQueuedCsvFile(file);
      toast({
        title: "Retrying data load",
        description: "Some reference data failed to load earlier. Retrying before importing your file…",
      });
      if (cellModelsStatus === "error") loadCellModels();
      if (manufacturersStatus === "error") loadManufacturers();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          toast({ title: "Empty CSV", description: "The CSV file contains no data rows.", variant: "destructive" });
          return;
        }
        const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
        const colMap: Record<string, number> = {};
        const mapping: [string, string[]][] = [
          ["palletNumber", ["palletnumber", "palletno", "pallet"]],
          ["assetNumber", ["assetno", "assetnumber", "asset"]],
          ["batterySerial", ["batteryserial", "batteryserialno", "serial", "serialno"]],
          ["manufacture", ["manufacturer", "manufacture", "mfr"]],
          ["cellType", ["celltype", "celltypefamily", "type", "cellfamily"]],
          ["voltage", ["voltage", "volt", "v"]],
          ["looseCellsQty", ["loosecellsqty", "loosecells", "cellqty", "qty"]],
          ["estimatedWeightKg", ["estweightkg", "estimatedweightkg", "weightkg", "weight"]],
          ["notes", ["notes", "note"]],
        ];
        for (const [field, aliases] of mapping) {
          const idx = headers.findIndex((h) => aliases.includes(h));
          if (idx !== -1) colMap[field] = idx;
        }
        const requiredFields = ["batterySerial", "assetNumber"];
        const missingRequired = requiredFields.filter((f) => !(f in colMap));
        if (missingRequired.length > 0) {
          toast({
            title: "Missing required columns",
            description: `CSV is missing required columns. Please use the template to ensure correct headers.`,
            variant: "destructive",
          });
          return;
        }

        const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell && cell.trim()));
        if (dataRows.length === 0) {
          toast({ title: "Empty CSV", description: "The CSV file contains no data rows.", variant: "destructive" });
          return;
        }
        const knownMfrs = manufacturers.filter((m) => m.toLowerCase() !== "other");
        const mfrByNorm = new Map(knownMfrs.map((m) => [normalizeForMatch(m), m] as const));
        for (const [alias, canonical] of Object.entries(manufacturerAliases)) {
          if (knownMfrs.includes(canonical)) {
            mfrByNorm.set(normalizeForMatch(alias), canonical);
          }
        }
        let lastPalletNumber = "";
        const imported: BatteryRow[] = dataRows.map((row) => {
          const rawPallet = colMap["palletNumber"] !== undefined ? row[colMap["palletNumber"]]?.trim() || "" : "";
          if (rawPallet) lastPalletNumber = rawPallet;
          const looseQty = colMap["looseCellsQty"] !== undefined ? row[colMap["looseCellsQty"]] || "" : "";
          const rawMfr = colMap["manufacture"] !== undefined ? row[colMap["manufacture"]] || "" : "";
          const rawCellType = colMap["cellType"] !== undefined ? row[colMap["cellType"]] || "" : "";

          const mfrTrim = rawMfr.trim();
          let normalizedMfr = mfrTrim;
          let mfrAutoUnknown = false;
          if (mfrTrim && !isUnknownManufacturerValue(mfrTrim)) {
            const canonical = mfrByNorm.get(normalizeForMatch(mfrTrim));
            if (canonical) normalizedMfr = canonical;
          } else {
            // Empty/placeholder manufacturers (blank, "N/A", "unknown",
            // "Other", "-", "none"): default to "Unknown" + TAB weights,
            // without requiring manufacturer review.
            normalizedMfr = "Unknown";
            mfrAutoUnknown = true;
          }

          const rawCellTrim = rawCellType.trim();
          let normalizedCellType = rawCellTrim;
          let normalizedCellModel = "";
          if (rawCellTrim) {
            const normCell = normalizeForMatch(rawCellTrim);
            const preferred = selectPreferredCatalogueModel(
              cellModels,
              mfrAutoUnknown ? null : normalizedMfr,
              rawCellTrim
            );
          if (preferred && normalizeForMatch(preferred.modelName) === normalizeForMatch(rawCellTrim)) {
              normalizedCellModel = preferred.modelName;
              normalizedCellType = preferred.cellFamily;
            } else {
              const familyMatch = cellModels.find(
                (m) => normalizeForMatch(m.cellFamily) === normCell
              );
              if (familyMatch) {
                normalizedCellType = familyMatch.cellFamily;
              } else if (normCell === "blocs") {
                normalizedCellType = "Blocs";
              } else if (normCell === "other") {
                normalizedCellType = "Other";
              }
            }
          }

          const rawVoltage = colMap["voltage"] !== undefined ? (row[colMap["voltage"]] || "").trim() : "";
          let normalizedVoltage = "";
          let customVoltage = "";
          if (rawVoltage) {
            const numMatch = rawVoltage.match(/\d+(?:\.\d+)?/);
            const num = numMatch ? parseFloat(numMatch[0]) : NaN;
            const canonical =
              !isNaN(num) && Number.isInteger(num)
                ? VOLTAGE_VALUES.find((v) => parseInt(v, 10) === num)
                : undefined;
            if (canonical) {
              normalizedVoltage = canonical;
            } else if (!isNaN(num) && num > 0) {
              normalizedVoltage = "Other";
              customVoltage = `${num}V`;
            } else {
              normalizedVoltage = "Other";
              customVoltage = rawVoltage;
            }
          }

          return {
            id: crypto.randomUUID(),
            palletNumber: lastPalletNumber,
            assetNumber: row[colMap["assetNumber"]] || "",
            batterySerial: row[colMap["batterySerial"]] || "",
            manufacture: normalizedMfr,
            manufactureCustom: "",
            cellType: normalizedCellType,
            cellModel: normalizedCellModel,
            voltage: normalizedVoltage,
            customVoltage,
            looseCellsQty: looseQty,
            estimatedWeightKg: colMap["estimatedWeightKg"] !== undefined ? row[colMap["estimatedWeightKg"]] || "" : "",
            weightManual: !!(colMap["estimatedWeightKg"] !== undefined && row[colMap["estimatedWeightKg"]]),
            notes: colMap["notes"] !== undefined ? row[colMap["notes"]] || "" : "",
            isLooseCells: !!(looseQty && parseInt(looseQty, 10) > 0),
            manufacturerFlagReason: "",
            cellModelFlagReason: normalizedCellType === "Other" ? OTHER_REVIEW_FLAG_REASON : "",
            voltageFlagReason: "",
            rowPhoto: "",
          };
        });

        // Loose-cell rows sometimes arrive with the real breakdown written in
        // the notes (e.g. "36 X 5PZS775 + 1 X 6PZS930") and a placeholder
        // quantity of 1. Expand those into one loose-cell row per segment so
        // quantities, weights and Pb are calculated from the true cell counts.
        const expanded: BatteryRow[] = [];
        for (const row of imported) {
          const segments = row.isLooseCells ? parseLooseCellNoteSegments(row.notes) : [];
          const parsedTotal = segments.reduce((sum, s) => sum + s.qty, 0);
          const currentQty = parseInt(row.looseCellsQty, 10) || 0;
          if (segments.length === 0 || (parsedTotal === currentQty && segments.length === 1)) {
            expanded.push(row);
            continue;
          }
          // Only split when every segment resolves to a known cell model —
          // otherwise the note is probably free text and the row is left
          // untouched for manual review.
          const resolved = segments.map((seg) => {
            const preferredSeg = selectPreferredCatalogueModel(
              cellModels,
              row.manufacture,
              seg.model
            );
            return { seg, model: preferredSeg };
          });
          if (resolved.some((r) => !r.model)) {
            expanded.push(row);
            continue;
          }
          resolved.forEach(({ seg, model }, idx) => {
            expanded.push({
              ...row,
              id: idx === 0 ? row.id : crypto.randomUUID(),
              looseCellsQty: String(seg.qty),
              cellModel: model!.modelName,
              cellType: model!.cellFamily,
              estimatedWeightKg: "",
              weightManual: false,
            });
          });
        }

        const issues = validateImportRows(expanded);

        if (showReviewFeedback && issues.length > 0) {
          setPendingCsvImport({ rows: expanded, issues });
          return;
        }

        // Clients import directly, retaining review flags for Itinium rather
        // than asking the requester to resolve catalogue details.
        commitCsvImport(expanded, !showReviewFeedback);
      } catch {
        toast({ title: "CSV import failed", description: "Could not parse the CSV file. Please check the format.", variant: "destructive" });
      } finally {
        csvReadingRef.current = false;
        setCsvReading(false);
      }
    };
    const readFailed = () => {
      csvReadingRef.current = false;
      setCsvReading(false);
      toast({ title: "CSV import failed", description: "Could not read the file. Please try again.", variant: "destructive" });
    };
    reader.onerror = readFailed;
    reader.onabort = readFailed;
    try {
      reader.readAsText(file);
    } catch {
      readFailed();
    }
  }

  useEffect(() => {
    if (!queuedCsvFile) return;
    if (cellModelsStatus === "loading" || manufacturersStatus === "loading") return;
    if (cellModelsStatus === "ready" && manufacturersStatus === "ready") {
      const file = queuedCsvFile;
      setQueuedCsvFile(null);
      csvReadingRef.current = false;
      handleCsvImport(file);
    } else {
      setQueuedCsvFile(null);
      csvReadingRef.current = false;
      setCsvReading(false);
      const failed =
        cellModelsStatus === "error" && manufacturersStatus === "error"
          ? "The cell model catalogue and manufacturer list"
          : cellModelsStatus === "error"
            ? "The cell model catalogue"
            : "The manufacturer list";
      toast({
        title: "Reference data unavailable",
        description: `${failed} could not be loaded, so imported rows could be missing weights or wrongly flagged. The import was cancelled — please check your connection and try again.`,
        variant: "destructive",
      });
    }
  }, [cellModelsStatus, manufacturersStatus, queuedCsvFile]);

  function validateImportRows(rows: BatteryRow[]) {
    const knownManufacturers = manufacturers.filter((m) => m.toLowerCase() !== "other");
    const knownManufacturersLower = new Set(knownManufacturers.map((m) => m.toLowerCase()));
    const issues: {
      rowNum: number;
      rowId: string;
      fields: { label: string; target: "manufacture" | "cellModel" | "voltage"; suggestion?: string }[];
    }[] = [];
    rows.forEach((b, i) => {
      const fields: { label: string; target: "manufacture" | "cellModel" | "voltage"; suggestion?: string }[] = [];
      const voltageApplies = !b.isLooseCells && b.cellType !== "Blocs" && b.cellType !== "Other";
      const mfrVal = b.manufacture.trim();
      // Empty manufacturers are auto-mapped to "Unknown" (TAB weights) at
      // import time and accepted without manufacturer review.
      if (
        mfrVal &&
        mfrVal.toLowerCase() !== "unknown" &&
        knownManufacturers.length > 0 &&
        !knownManufacturersLower.has(mfrVal.toLowerCase())
      ) {
        fields.push({
          label: `We don't recognise the manufacturer "${b.manufacture.trim()}"`,
          target: "manufacture",
          suggestion: findClosestMatch(b.manufacture, knownManufacturers) ?? undefined,
        });
      }
      const cellTypeTrim = b.cellType.trim();
      if (
        cellTypeTrim &&
        cellTypeTrim !== "Blocs" &&
        cellTypeTrim !== "Other" &&
        cellModels.length > 0 &&
        !cellModels.some((m) => normalizeForMatch(m.cellFamily) === normalizeForMatch(cellTypeTrim)) &&
        !cellModels.some((m) => normalizeForMatch(m.modelName) === normalizeForMatch(cellTypeTrim)) &&
        !(b.cellModel.trim() && cellModels.some((m) => normalizeForMatch(m.modelName) === normalizeForMatch(b.cellModel.trim())))
      ) {
        const modelNames = Array.from(new Set(cellModels.map((m) => m.modelName)));
        fields.push({
          label: `We don't recognise the cell type "${cellTypeTrim}"`,
          target: "cellModel",
          suggestion: findClosestMatch(cellTypeTrim, modelNames) ?? undefined,
        });
      }
      if (voltageApplies && !b.voltage.trim()) {
        fields.push({ label: "Voltage is missing", target: "voltage" });
      }
      if (fields.length > 0) issues.push({ rowNum: i + 2, rowId: b.id, fields });
    });
    return issues;
  }

  function applyCsvSuggestion(rowId: string, target: "manufacture" | "cellModel" | "voltage", value: string) {
    setPendingCsvImport((prev) => {
      if (!prev) return prev;
      const updatedRows = prev.rows.map((r) => {
        if (r.id !== rowId) return r;
        if (target === "manufacture") {
          return { ...r, manufacture: value, manufactureCustom: "" };
        }
        if (target === "voltage") {
          return { ...r, voltage: value, customVoltage: "" };
        }
        const mfr = r.manufacture.trim();
        const matchedModel =
          (mfr
            ? cellModels.find(
                (m) => m.modelName === value && m.manufacturer.toLowerCase() === mfr.toLowerCase()
              )
            : undefined) ?? cellModels.find((m) => m.modelName === value);
        return {
          ...r,
          cellModel: value,
          cellType: matchedModel ? matchedModel.cellFamily : r.cellType,
        };
      });
      const updatedIssues = validateImportRows(updatedRows);
      if (updatedIssues.length === 0) {
        setTimeout(() => {
          commitCsvImport(updatedRows);
          setPendingCsvImport(null);
        }, 0);
      }
      return { rows: updatedRows, issues: updatedIssues };
    });
  }

  function commitCsvImport(rows: BatteryRow[], applyFlags = false) {
    if (csvImportedRef.current || rows.length === 0) return;
    const knownManufacturers = new Set(
      manufacturers.filter((m) => m.toLowerCase() !== "other").map((m) => m.toLowerCase())
    );
    const finalRows = applyFlags
      ? rows.map((b) => {
          const voltageApplies = !b.isLooseCells && b.cellType !== "Blocs" && b.cellType !== "Other";
          let manufacturerFlagReason = b.manufacturerFlagReason;
          const mfrVal = b.manufacture.trim();
          if (isUnknownManufacturerValue(mfrVal)) {
            manufacturerFlagReason = "";
          } else if (manufacturers.length > 0 && !knownManufacturers.has(mfrVal.toLowerCase())) {
            manufacturerFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
          const voltageFlagReason =
            voltageApplies && !b.voltage.trim() ? CSV_FLAG_REASON : b.voltageFlagReason;
          const cellTypeTrim = b.cellType.trim();
          let cellModelFlagReason = b.cellModelFlagReason;
          if (cellTypeTrim === "Other") cellModelFlagReason = OTHER_REVIEW_FLAG_REASON;
          if (
            cellTypeTrim &&
            cellTypeTrim !== "Blocs" &&
            cellTypeTrim !== "Other" &&
            cellModels.length > 0 &&
            !cellModels.some((m) => normalizeForMatch(m.cellFamily) === normalizeForMatch(cellTypeTrim)) &&
            !cellModels.some((m) => normalizeForMatch(m.modelName) === normalizeForMatch(cellTypeTrim)) &&
            !(b.cellModel.trim() && cellModels.some((m) => normalizeForMatch(m.modelName) === normalizeForMatch(b.cellModel.trim())))
          ) {
            cellModelFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
          return {
            ...b,
            manufacturerFlagReason,
            cellModelFlagReason,
            voltageFlagReason,
          };
        })
      : rows;
    csvImportedRef.current = true;
    setCsvImported(true);
    setBatteries((prev) => {
      const hasOnlyEmpty = prev.length === 1 && !prev[0].assetNumber && !prev[0].batterySerial && !prev[0].palletNumber;
      return hasOnlyEmpty ? finalRows : [...prev, ...finalRows];
    });
    finalRows.forEach((row) => {
      if (!row.weightManual) computeAndSetAutoWeight(row);
    });
    const flaggedCount = applyFlags
      ? finalRows.filter((b) => b.manufacturerFlagReason || b.cellModelFlagReason || b.voltageFlagReason).length
      : 0;
    toast({
      title: "CSV imported",
      description: showReviewFeedback && flaggedCount > 0
        ? `${finalRows.length} row(s) added — ${flaggedCount} flagged for Itinium review.`
        : `${finalRows.length} battery row(s) added from CSV.`,
    });
  }

  function updateBattery(id: string, field: keyof BatteryRow, value: string) {
    setBatteries((prev) => {
      const updated = prev.map((b) => {
        if (b.id !== id) return b;
        const newB = { ...b, [field]: value };
        if (field === "cellType" && (value === "Blocs" || value === "Other")) {
          newB.cellModel = "";
        }
        if (field === "cellModel") {
          const mfr = newB.manufacture === "Other" ? newB.manufactureCustom : newB.manufacture;
          const model = cellModels.find((m) => m.modelName === value && (!mfr || m.manufacturer === mfr)) || cellModels.find((m) => m.modelName === value);
          if (model) {
            newB.cellType = model.cellFamily;
          }
        }
        // Auto-clear CSV-import flags as soon as the user fills in a value
        if (field === "manufacture") {
          newB.manufacturerFlagReason = validateBatteryField("manufacture", value, manufacturers, cellModels, manufacturerAliases);
        }
        if (
          (field === "cellType" || field === "cellModel") &&
          (newB.cellModel.trim() || newB.cellType === "Blocs" || newB.cellType === "Other")
        ) {
          newB.cellModelFlagReason = newB.cellType === "Other" ? OTHER_REVIEW_FLAG_REASON : "";
        }
        if (field === "voltage" || field === "customVoltage") {
          const effectiveVoltage = newB.voltage === "Other" ? newB.customVoltage : newB.voltage;
          if (effectiveVoltage.trim()) {
            newB.voltageFlagReason = "";
          }
        }
        return newB;
      });
      if (field === "cellType" || field === "cellModel" || field === "voltage" || field === "looseCellsQty" || field === "customVoltage" || field === "manufacture") {
        const battery = updated.find((b) => b.id === id);
        if (battery && !battery.weightManual) {
          computeAndSetAutoWeight(battery);
        }
      }
      return updated;
    });
  }

  function addBatteryRow() {
    setBatteries((prev) => [...prev, createEmptyBattery()]);
  }

  function removeBatteryRow(id: string) {
    if (batteries.length <= 1) return;
    setBatteries((prev) => prev.filter((b) => b.id !== id));
  }

  async function fetchSuggestion(
    batteryId: string,
    field: "manufacture" | "cellType" | "voltage",
    value: string,
    candidates: string[]
  ) {
    // Do not silently auto-correct values when the requester cannot see or
    // accept/restore the correction. Itinium can review the saved flags.
    if (!showReviewFeedback || !value.trim() || !candidates.length) return;
    const key = `${batteryId}_${field}`;
    setFetchingSuggestions((prev) => new Set([...prev, key]));
    try {
      const res = await fetch("/api/suggest-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ field, value, candidates: candidates.slice(0, 60) }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { suggestion: string | null; confidence: "high" | "low" | null };
      if (!data.suggestion) return;

      if (data.confidence === "high") {
        // Auto-apply: clear the flag, update the field, store original value for Restore
        setBatteries((prev) =>
          prev.map((b) => {
            if (b.id !== batteryId) return b;
            if (field === "manufacture") {
              return {
                ...b,
                manufacture: data.suggestion!,
                manufactureCustom: "",
                manufacturerFlagReason: "",
                manufacturerSuggestionConfidence: "high" as const,
                manufacturerOriginalValue: value,
                manufacturerSuggestedValue: data.suggestion!,
                manufacturerWasAccepted: true,
                manufacturerManuallyConfirmed: undefined,
              };
            }
            if (field === "cellType") {
              const isModel = cellModels.some((m) => m.modelName === data.suggestion);
              return isModel
                ? { ...b, cellModel: data.suggestion!, cellModelFlagReason: "", cellTypeSuggestion: undefined, cellTypeSuggestionConfidence: "high" as const, cellTypeOriginalValue: value, cellTypeSuggestedValue: data.suggestion!, cellTypeWasAccepted: true, cellTypeManuallyConfirmed: undefined }
                : { ...b, cellType: data.suggestion!, cellModel: "", cellModelFlagReason: "", cellTypeSuggestion: undefined, cellTypeSuggestionConfidence: "high" as const, cellTypeOriginalValue: value, cellTypeSuggestedValue: data.suggestion!, cellTypeWasAccepted: true, cellTypeManuallyConfirmed: undefined };
            }
            if (field === "voltage") {
              return { ...b, voltage: data.suggestion!, customVoltage: "", voltageFlagReason: "", voltageSuggestion: undefined, voltageSuggestionConfidence: "high" as const, voltageOriginalValue: value, voltageSuggestedValue: data.suggestion!, voltageWasAccepted: true, voltageManuallyConfirmed: undefined };
            }
            return b;
          })
        );
      } else {
        // Low confidence: show CorrectionPrompt for user to choose
        setBatteries((prev) =>
          prev.map((b) => {
            if (b.id !== batteryId) return b;
            if (field === "manufacture") return { ...b, manufacturerSuggestion: data.suggestion!, manufacturerSuggestionConfidence: "low" as const, manufacturerOriginalValue: value, manufacturerSuggestedValue: data.suggestion! };
            if (field === "cellType") return { ...b, cellTypeSuggestion: data.suggestion!, cellTypeSuggestionConfidence: "low" as const, cellTypeOriginalValue: value, cellTypeSuggestedValue: data.suggestion! };
            if (field === "voltage") return { ...b, voltageSuggestion: data.suggestion!, voltageSuggestionConfidence: "low" as const, voltageOriginalValue: value, voltageSuggestedValue: data.suggestion! };
            return b;
          })
        );
      }
    } catch {
      // Suggestions are non-critical — fail silently
    } finally {
      setFetchingSuggestions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function onSubmit() {
    if (user && isCustomerRole(user) &&
      !clientLocations.some(location => String(location.id) === selectedLocationId)) {
      toast({ title: "Select a location", description: "Choose a location belonging to your client before submitting.", variant: "destructive" });
      return;
    }
    if (!showReviewFeedback && tokenWeightRows.length > 0 && !provisionalAck) {
      toast({
        title: "Confirm provisional submission",
        description: "Some battery weights are unknown. Tick the provisional weight confirmation to submit for Itinium Admin verification, or complete the battery details.",
        variant: "destructive",
      });
      return;
    }
    const hasAtLeastOneIdentifier = batteries.some(
      (b) => b.batterySerial.trim() || b.assetNumber.trim()
    );
    if (!hasAtLeastOneIdentifier) {
      toast({
        title: "Missing battery data",
        description: "Please fill in at least one battery row with an identifier.",
        variant: "destructive",
      });
      return;
    }

    // Rows marked "Other" with no manufacturer name (and placeholder names
    // like "N/A" or "unknown") are treated as Unknown manufacturers: they use
    // TAB weights without a manufacturer review requirement.
    const batteriesWithMfrFallback = batteries.map((b) => {
      const effRaw = b.manufacture === "Other" ? b.manufactureCustom : b.manufacture;
      if (
        (b.manufacture === "Other" && !b.manufactureCustom.trim()) ||
        !effRaw.trim() ||
        isUnknownManufacturerValue(effRaw)
      ) {
        return {
          ...b,
          manufacture: "Unknown",
          manufactureCustom: "",
          manufacturerFlagReason: "",
        };
      }
      return b;
    });

    const batteriesWithWeightFallback = batteriesWithMfrFallback.map((b) => {
      if (parsePositiveWeightInput(b.estimatedWeightKg) !== null) return b;
      return {
        ...b,
        estimatedWeightKg: String(TOKEN_WEIGHT_KG),
        cellModelFlagReason: b.cellModelFlagReason || TOKEN_WEIGHT_FLAG_REASON,
      };
    });

    const submissionLoad = showReviewFeedback && tonnageManual && tonnageOverride
      ? Math.max(autoTonnage, parseFloat(tonnageOverride) || 0)
      : batteriesWithWeightFallback.reduce(
          (sum, b) => sum + (parsePositiveWeightInput(b.estimatedWeightKg) || 0),
          0
        ) * GROSS_WEIGHT_FACTOR / 1000;
    if (submissionLoad > maxCapacity) {
      toast({
        title: "Exceeds maximum tonnage",
        description: `Reduce this collection request to at most ${maxCapacity} tonnes before submitting. Request any additional tonnage through a separate new collection job. Contact Itinium directly for assistance.`,
        variant: "destructive",
      });
      return;
    }

    // Validate manufacturer, cell type, and voltage against master lists before submitting.
    // If any value is unrecognised, flag it but do not block — flags are stored for Itinium review.
    const validatedBatteries = batteriesWithWeightFallback.map((b) => {
      const updated = { ...b };
      const effMfr =
        b.manufacture === "Other" && b.manufactureCustom ? b.manufactureCustom : b.manufacture;
      if (effMfr.trim() && !b.manufacturerFlagReason) {
        const reason = validateBatteryField(
          "manufacture", effMfr, manufacturers, cellModels, manufacturerAliases
        );
        if (reason) updated.manufacturerFlagReason = reason;
      }
      const effCell = b.cellModel || b.cellType;
      if (effCell.trim() && !b.cellModelFlagReason) {
        const reason = validateBatteryField(
          "cellType", effCell, manufacturers, cellModels, manufacturerAliases
        );
        if (reason) updated.cellModelFlagReason = reason;
      }
      const effVoltage =
        b.voltage === "Other" && b.customVoltage ? b.customVoltage : b.voltage;
      const voltageApplies =
        !b.isLooseCells && b.cellType !== "Blocs" && b.cellType !== "Other";
      if (voltageApplies && effVoltage.trim() && !b.voltageFlagReason) {
        const reason = validateBatteryField(
          "voltage", effVoltage, manufacturers, cellModels, manufacturerAliases
        );
        if (reason) updated.voltageFlagReason = reason;
      }
      return updated;
    });
    const hasNewFlags = validatedBatteries.some(
      (b, i) =>
        b.manufacture !== batteries[i].manufacture ||
        b.manufacturerFlagReason !== batteries[i].manufacturerFlagReason ||
        b.cellModelFlagReason !== batteries[i].cellModelFlagReason ||
        b.voltageFlagReason !== batteries[i].voltageFlagReason
    );
    if (hasNewFlags) {
      setBatteries(validatedBatteries);
    }

    // Block submit on unresolved critical flags (manufacturer, cell model, voltage)
    const unresolvedCritical: string[] = [];
    validatedBatteries.forEach((b, i) => {
      const rowLabel = `Row ${i + 1}`;
      if (
        b.cellModelFlagReason === MANUAL_UNKNOWN_FLAG_REASON &&
        !b.cellTypeManuallyConfirmed &&
        !isReviewableProvisionalRow(b)
      ) {
        unresolvedCritical.push(`${rowLabel}: Cell Type`);
      }
      if (!b.isLooseCells && b.voltageFlagReason === MANUAL_UNKNOWN_FLAG_REASON && !b.voltageManuallyConfirmed) {
        unresolvedCritical.push(`${rowLabel}: Voltage`);
      }
    });
    if (showReviewFeedback && unresolvedCritical.length > 0) {
      toast({
        title: "Unrecognised fields must be resolved",
        description: `Please accept a suggestion or confirm the following before submitting: ${unresolvedCritical.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          depot: getSelectedLocationName() || user?.depot || "Head Office",
          locationId: selectedLocationId ? Number(selectedLocationId) : null,
          collectionPoint: collectionPoint || null,
          siteContacts: siteContacts || null,
          siteHours: siteHours || null,
          specialInstructions: specialInstructions || null,
          collectionDate: null,
          tonnage: submissionLoad > 0 ? submissionLoad.toFixed(3) : "0.000",
          tonnageManualOverride: showReviewFeedback && tonnageManual,
          notes: jobNotes || null,
          draftId: currentDraftId || undefined,
          batteries: validatedBatteries.map((b) => ({
            palletNumber: b.palletNumber || null,
            assetNumber: b.assetNumber || null,
            batterySerial: b.batterySerial || null,
            manufacture: b.manufacture === "Other" ? (b.manufactureCustom || "Other") : (b.manufacture || null),
            cellType: b.cellModel || b.cellType || null,
            voltage: (b.voltage === "Other" ? b.customVoltage : b.voltage) || null,
            looseCellsQty: b.looseCellsQty || null,
            estimatedWeightKg: b.estimatedWeightKg || null,
            weightManual: b.weightManual === true,
            isLooseCells: b.isLooseCells,
            serialFlagReason: null,
            manufacturerFlagReason: b.manufacturerFlagReason || null,
            cellModelFlagReason: b.cellModelFlagReason || null,
            voltageFlagReason: b.isLooseCells ? null : (b.voltageFlagReason || null),
            manufacturerCorrectionConfidence: b.manufacturerSuggestionConfidence || null,
            cellModelCorrectionConfidence: b.cellTypeSuggestionConfidence || null,
            voltageCorrectionConfidence: b.isLooseCells ? null : (b.voltageSuggestionConfidence || null),
            manufacturerOriginalValue: b.manufacturerOriginalValue || null,
            manufacturerSuggestedValue: b.manufacturerSuggestedValue || null,
            manufacturerWasAccepted: typeof b.manufacturerWasAccepted === "boolean" ? b.manufacturerWasAccepted : null,
            cellModelOriginalValue: b.cellTypeOriginalValue || null,
            cellModelSuggestedValue: b.cellTypeSuggestedValue || null,
            cellModelWasAccepted: typeof b.cellTypeWasAccepted === "boolean" ? b.cellTypeWasAccepted : null,
            voltageOriginalValue: b.isLooseCells ? null : (b.voltageOriginalValue || null),
            voltageSuggestedValue: b.isLooseCells ? null : (b.voltageSuggestedValue || null),
            voltageWasAccepted: b.isLooseCells ? null : (typeof b.voltageWasAccepted === "boolean" ? b.voltageWasAccepted : null),
            rowPhoto: b.rowPhoto || null,
            notes: b.notes || null,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast({
          title: "Collection submitted",
          description: `Job ${data.job.reference} submitted with ${batteries.length} battery item(s).`,
        });
        setBatteries([createEmptyBattery()]);
        setCollectionPoint("");
        setSiteContacts("");
        setSiteHours("");
        setSpecialInstructions("");
        setJobNotes("");
        setTonnageManual(false);
        setTonnageOverride("");
        setCurrentDraftId(null);
        csvImportedRef.current = false;
        setCsvImported(false);
        navigate("/");
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Submission failed",
          description: err.message || "Something went wrong.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Submission failed",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveDraft() {
    setSavingDraft(true);
    try {
      const formData = {
        csvImported: csvImportedRef.current,
        collectionPoint,
        jobNotes,
        tonnageOverride,
        tonnageManual,
        selectedLocationId,
        siteContacts,
        siteHours,
        specialInstructions,
        batteries,
      };
      const body: Record<string, unknown> = {
        formData,
        collectionPoint: collectionPoint || null,
        batteryCount: batteries.length,
      };
      if (currentDraftId !== null) {
        body.draftId = currentDraftId;
      }
      const res = await fetch("/api/job-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentDraftId(data.draft.id);
        toast({
          title: "Draft saved",
          description: `Draft #${data.draft.id} saved — ${batteries.length} battery row(s).`,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Could not save draft",
          description: (err as { message?: string }).message || "Something went wrong.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Could not save draft",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingDraft(false);
    }
  }

  const totalWeightKg = batteries.reduce((sum, b) => {
    const hasData = b.batterySerial.trim() || b.assetNumber.trim() || b.cellType.trim() || b.cellModel.trim();
    if (!hasData) return sum;
    return sum + (parsePositiveWeightInput(b.estimatedWeightKg) || TOKEN_WEIGHT_KG);
  }, 0);
  // Gross load = total lead content x 1.4 (client-confirmed 30 July 2026).
  // This matches the x1.4 safe-load tonnage stored server-side.
  const GROSS_WEIGHT_FACTOR = 1.4;
  const autoTonnage = (totalWeightKg * GROSS_WEIGHT_FACTOR) / 1000;
  const tokenWeightRows = batteries
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => {
      const hasData = b.batterySerial.trim() || b.assetNumber.trim() || b.cellType.trim() || b.cellModel.trim();
      return hasData && (parsePositiveWeightInput(b.estimatedWeightKg) === null || b.cellModelFlagReason === TOKEN_WEIGHT_FLAG_REASON);
    });
  const currentLoad = showReviewFeedback && tonnageManual && tonnageOverride ? Math.max(autoTonnage, parseFloat(tonnageOverride) || 0) : autoTonnage;
  const minTonnage = 9.5;
  const maxCapacity = 26.0;
  const targetMin = 10.0;
  const progressPercent = Math.min(100, Math.round((currentLoad / maxCapacity) * 100));

  const loadState = getLoadState(currentLoad, maxCapacity);

  const isRed = loadState === "red-low" || loadState === "red-high";
  const isAmber = loadState === "amber-low" || loadState === "amber-high";
  const isGreen = loadState === "green";

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-24 pt-16 flex flex-col items-center">
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 flex items-center justify-between px-4 sm:px-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 text-slate-500 hover:text-[#0f2744] transition-colors mr-2"
            data-testid="link-back-dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <img
            src={itiniumLogo}
            alt="Itinium Partnership"
            className="h-10"
          />
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-medium text-slate-700 cursor-pointer"
            onClick={handleLogout}
            data-testid="button-header-logout"
          >
            {user?.fullName || "Loading..."}
          </span>
        </div>
      </header>

      <main
        className="w-full max-w-4xl px-4 sm:px-6 py-6 space-y-6 flex-1 flex flex-col"
        onFocusCapture={(event) => {
          // Keep keyboard/mobile focus below the fixed header and sticky
          // summary, including when a browser restores a scrolled draft.
          const target = event.target as HTMLElement;
          const summary = event.currentTarget.querySelector('[data-testid="section-tonnage-progress"]');
          if (!summary || summary.contains(target)) return;
          const top = target.getBoundingClientRect().top;
          const visibleTop = summary.getBoundingClientRect().bottom + 12;
          if (top < visibleTop) window.scrollBy({ top: top - visibleTop, behavior: "instant" });
        }}
      >
        <section
          className={`sticky top-16 z-40 shrink-0 rounded-xl p-3 sm:p-4 border shadow-sm ${
            isRed ? "bg-red-50 border-red-200" : isAmber ? "bg-amber-50 border-amber-200" : isGreen ? "bg-emerald-50 border-emerald-200" : "bg-sky-50 border-sky-100"
          }`}
          data-testid="section-tonnage-progress"
        >
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Current Total Load
              </p>
              <h3 className={`text-lg sm:text-xl font-bold ${isRed ? "text-red-700" : isAmber ? "text-amber-700" : "text-[#0f2744]"}`}>
                {currentLoad.toFixed(3)}t{" "}
                <span className="text-slate-500 text-sm sm:text-base font-normal">
                  / {maxCapacity}t max
                </span>
              </h3>
              {tokenWeightRows.length > 0 && <p className="text-xs text-amber-800">Provisional — weights need confirmation</p>}
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                isRed ? "text-red-700 bg-red-100" : isAmber ? "text-amber-700 bg-amber-100" : isGreen ? "text-emerald-700 bg-emerald-100" : "text-sky-700 bg-sky-100"
              }`}>
                {progressPercent}% Capacity
              </span>
            </div>
          </div>
        </section>
        <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="load-guidance">
          {loadState === "red-low" && (
            <p className="text-xs font-medium text-red-700 mb-2">
              This load is currently under 10 tonnes, so a transportation charge will apply. For clarification or assistance please contact the Itinium team.
            </p>
          )}
          {loadState === "red-high" && (
            <p className="text-xs font-medium text-red-700 mb-2">
              This collection request exceeds the {maxCapacity}-tonne maximum and cannot be submitted.
              Reduce it to at most {maxCapacity} tonnes, then request any additional tonnage through a
              separate new collection job. Contact Itinium directly for assistance.
            </p>
          )}
          {loadState === "amber-low" && (
            <p className="text-xs font-medium text-amber-700 mb-2">
              Approaching minimum threshold. Target is {targetMin}t+.
            </p>
          )}
          {loadState === "amber-high" && (
            <p className="text-xs font-medium text-amber-700 mb-2">
              Approaching maximum {maxCapacity}t capacity. Consider limiting the load.
            </p>
          )}
          {isGreen && (
            <p className="text-xs font-medium text-emerald-700 mb-2">
              Load is within the optimal range.
            </p>
          )}
          {tokenWeightRows.length > 0 && (
            <p className="text-xs font-medium text-amber-700 mb-2" data-testid="text-zero-weight-warning">
              Weight is not confirmed for {tokenWeightRows.length} battery row{tokenWeightRows.length > 1 ? "s" : ""}.
              A provisional 500kg allowance per unresolved row, plus the loading factor, is included in the total;
              it is not a verified weight. Complete the battery details or save your draft and contact Itinium
              for assistance. {showReviewFeedback ? "These rows require Itinium review." : "You may submit provisionally; Itinium Admin must verify the weight before the collection is confirmed."}
            </p>
          )}
          {tokenWeightRows.length > 0 && !showReviewFeedback && (
            <label className="flex items-start gap-2 text-xs font-medium text-amber-900 rounded-md border border-amber-300 bg-amber-50 p-2.5 mb-2">
              <input type="checkbox" className="mt-0.5" checked={provisionalAck} onChange={(e) => setProvisionalAck(e.target.checked)} data-testid="checkbox-provisional-ack" />
              I understand this is a provisional submission with unknown weights. The total load is an estimate and Itinium Admin must verify it before confirmation.
            </label>
          )}
          <div className="relative h-3 w-full bg-slate-200 rounded-full overflow-hidden mt-3">
            <div
              className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                isRed ? "bg-gradient-to-r from-red-400 to-red-500" : isAmber ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-gradient-to-r from-[#0ea5e9] to-[#10b981]"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
              style={{ left: `${Math.round((minTonnage / maxCapacity) * 100)}%` }}
              title={`Minimum: ${minTonnage}t`}
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-xs text-slate-500">
              Minimum 10 Ton, without carriage charge
            </p>
            <p className="text-xs text-slate-500">
              Max: {maxCapacity}t
            </p>
          </div>
        </div>

        <section
          className="bg-white rounded-xl p-5 border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)]"
          data-testid="section-collection-info"
        >
          <div className="flex flex-wrap gap-4 items-end justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">
                  Redundant Battery Collection Note
                </p>
                <p className="text-sm font-medium text-[#0f2744]">
                  {[getSelectedLocationName() || user?.depot || "Head Office", user?.fullName].filter(Boolean).join(" — ")}
                </p>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"
              data-testid="badge-status-draft"
            >
              <Clock className="w-3.5 h-3.5" />
              Draft
            </span>
          </div>

          {user && isCustomerRole(user) && (
            <div className="space-y-1.5 max-w-xl">
              <label className="text-sm font-medium text-[#1e293b] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Location
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none h-11 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                  value={selectedLocationId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedLocationId(value);
                    const location = clientLocations.find((item) => String(item.id) === value);
                    if (location) {
                      setCollectionPoint(location.address || "");
                      setSiteContacts(locationContacts(location));
                      setSiteHours(location.siteHours || "");
                      setSpecialInstructions(location.specialInstructions || "");
                    } else {
                      setCollectionPoint("");
                      setSiteContacts("");
                      setSiteHours("");
                      setSpecialInstructions("");
                    }
                  }}
                >
                  <option value="">Select a location...</option>
                  {clientLocations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-xs text-slate-500">Choose a location for this collection. This does not change your saved default.</p>
              {clientLocations.length === 0 && <p role="alert" className="text-sm text-amber-700">No permitted locations are available. Ask your administrator to assign your account a location.</p>}
            </div>
          )}

          <div className="space-y-1.5 relative max-w-xl">
            <label className="text-sm font-medium text-[#1e293b] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Collection Point
            </label>
            <Input
              ref={cpInputRef}
              placeholder="Search or type address..."
              className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
              value={collectionPoint}
              onChange={(e) => {
                setCollectionPoint(e.target.value);
                setShowCPDropdown(true);
              }}
              onFocus={() => setShowCPDropdown(true)}
              data-testid="input-collection-point"
              autoComplete="off"
            />
            {showCPDropdown && filteredCPPresets.length > 0 && (
              <div
                ref={cpDropdownRef}
                className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                data-testid="collection-point-dropdown"
              >
                {filteredCPPresets.map((cp) => (
                  <button
                    key={cp.id}
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-sky-50 transition-colors border-b border-slate-50 last:border-b-0"
                    onClick={() => {
                      setCollectionPoint(`${cp.name} — ${cp.address}`);
                      setShowCPDropdown(false);
                    }}
                    data-testid={`cp-option-${cp.id}`}
                  >
                    <p className="text-sm font-medium text-[#0f2744]">{cp.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{cp.address}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Site Contact Names &amp; Telephone Numbers</label>
              <Textarea
                value={siteContacts}
                onChange={(e) => setSiteContacts(e.target.value)}
                placeholder={"e.g. John Smith — 07700 900123\nJane Smith — 07700 900456"}
                className="min-h-24 bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                data-testid="input-site-contacts"
              />
              <p className="text-xs text-slate-500">One contact per line. You can amend the saved location contacts for this job.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">Site Hours</label>
                <Input
                  value={siteHours}
                  onChange={(e) => setSiteHours(e.target.value)}
                  placeholder="e.g. Mon–Fri 07:00–16:00"
                  className="h-11 bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                  data-testid="input-site-hours"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">Special Instructions</label>
                <Textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="e.g. Report to the gatehouse on arrival"
                  className="min-h-20 bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                  data-testid="input-special-instructions"
                />
              </div>
            </div>
          </div>
        </section>

        <section
          className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden"
          data-testid="section-csv-upload"
        >
          <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="font-bold text-[#0f2744] text-lg">
                Import from CSV
              </h3>
            </div>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0ea5e9] hover:text-[#0284c7] hover:bg-sky-50 rounded-md transition-colors border border-[#0ea5e9]/30"
              data-testid="button-download-csv-template"
            >
              <Download className="w-3.5 h-3.5" />
              Download Template
            </button>
          </div>
          <div className="p-5">
            <button
              type="button"
              onClick={() => {
                if (csvImportedRef.current || csvReadingRef.current || pendingCsvImport) return;
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".csv,text/csv";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleCsvImport(file);
                };
                input.click();
              }}
              disabled={csvImported || csvReading || !!pendingCsvImport}
              className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 enabled:hover:bg-slate-100 enabled:hover:border-[#0ea5e9] disabled:cursor-not-allowed transition-all group outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9] focus-visible:ring-offset-2"
              data-testid="button-upload-csv"
            >
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-[#0ea5e9]" />
              </div>
              <p className="text-[#0f2744] font-bold text-lg mb-1">
                {csvImported ? "CSV upload locked" : csvReading ? "Preparing CSV import…" : "Upload CSV File"}
              </p>
              <p className="text-slate-500 text-sm mb-1">
                {csvImported
                  ? "Only one CSV upload is allowed per collection request. You can still edit or add rows manually."
                  : "Import battery items from one spreadsheet — one successful upload per collection request."}
              </p>
              <p className="text-slate-400 text-xs">
                Download the template above for the correct format
              </p>
            </button>
          </div>
        </section>

        <section
          className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden"
          data-testid="section-battery-items"
        >
          <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Battery className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="font-bold text-[#0f2744] text-lg">
                Battery Items
              </h3>
              <span className="text-sm text-slate-500 ml-1">
                ({batteries.length} {batteries.length === 1 ? "row" : "rows"})
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
              onClick={addBatteryRow}
              data-testid="button-add-battery-row"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Row
            </Button>
          </div>

          <div className="divide-y divide-slate-100">
            {batteries.map((battery, index) => {
              const hasAnyFlag = showReviewFeedback && (
                (!!battery.manufacturerFlagReason && !isUnknownManufacturerValue(battery.manufacture))
                || !!battery.cellModelFlagReason || !!battery.voltageFlagReason
              );
              return (
              <div
                key={battery.id}
                className={`p-5 bg-white hover:bg-slate-50/30 transition-colors ${hasAnyFlag ? "border-l-4 border-l-amber-400" : ""}`}
                data-testid={`battery-row-${index}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Battery #{index + 1}
                    </span>
                    {hasAnyFlag && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" />
                        Needs Review
                      </span>
                    )}
                    {battery.isLooseCells && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                        Loose Cells
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => cloneBatteryRow(battery.id)}
                      className="text-slate-400 hover:text-[#0ea5e9] transition-colors p-1 rounded hover:bg-sky-50"
                      title="Clone this row"
                      data-testid={`button-clone-battery-${index}`}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {batteries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBatteryRow(battery.id)}
                        className="text-red-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                        data-testid={`button-remove-battery-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Pallet No.
                    </label>
                    <Input
                      placeholder="e.g., PLT-001"
                      className="h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9]"
                      value={battery.palletNumber}
                      onChange={(e) => updateBattery(battery.id, "palletNumber", e.target.value)}
                      data-testid={`input-pallet-number-${index}`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Asset No.
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Clipboard className="h-3.5 w-3.5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                      </div>
                      <Input
                        placeholder="e.g., AST-2026-001"
                        className="pl-9 h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9]"
                        value={battery.assetNumber}
                        onChange={(e) => updateBattery(battery.id, "assetNumber", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Battery Serial No.
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Package className="h-3.5 w-3.5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                      </div>
                      <Input
                        placeholder="e.g., BSN-ABCD-001"
                        className="pl-9 h-10 border-slate-200 text-sm focus-visible:ring-[#0ea5e9] bg-slate-50 text-[#1e293b]"
                        value={battery.batterySerial}
                        onChange={(e) => updateBattery(battery.id, "batterySerial", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Manufacturer
                    </label>
                    <TypeaheadInput
                      value={battery.manufacture === "Other" && battery.manufactureCustom ? battery.manufactureCustom : battery.manufacture}
                      options={manufacturers}
                      placeholder="Type or select manufacturer…"
                      icon={<Factory className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                      testId={`input-manufacture-${index}`}
                      onChange={(v) => {
                         setBatteries((prev) => prev.map((b) => {
                           if (b.id !== battery.id) return b;
                           const next = {
                             ...b, manufacture: v, manufactureCustom: "",
                             manufacturerFlagReason: validateBatteryField("manufacture", v, manufacturers, cellModels, manufacturerAliases),
                             manufacturerSuggestion: undefined, manufacturerSuggestionConfidence: undefined,
                             manufacturerOriginalValue: undefined, manufacturerManuallyConfirmed: undefined,
                           };
                           if (!next.weightManual) computeAndSetAutoWeight(next);
                           return next;
                         }));
                      }}
                      onBlurValidate={(v) => {
                        const trimmed = v.trim();
                        const canonical = manufacturers.find(
                          (m) => m.toLowerCase() === trimmed.toLowerCase()
                        );
                        const reason = validateBatteryField(
                          "manufacture", trimmed, manufacturers, cellModels, manufacturerAliases
                        );
                        setBatteries((prev) =>
                          prev.map((b) =>
                            b.id === battery.id
                              ? {
                                  ...b,
                                  manufacture: canonical ?? trimmed,
                                  manufactureCustom: "",
                                  manufacturerFlagReason: reason,
                                  manufacturerSuggestion: undefined,
                                  manufacturerSuggestionConfidence: undefined,
                                  manufacturerOriginalValue: undefined,
                                  manufacturerManuallyConfirmed: undefined,
                                }
                              : b
                          )
                        );
                        if (reason === MANUAL_UNKNOWN_FLAG_REASON) {
                          const candidates = manufacturers.filter((m) => m.toLowerCase() !== "other");
                          fetchSuggestion(battery.id, "manufacture", trimmed, candidates);
                        }
                      }}
                    />
                    {showReviewFeedback && battery.manufacturerOriginalValue && !battery.manufacturerFlagReason && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-sky-50 border border-sky-200 rounded-md mt-1">
                        <Lightbulb className="w-3 h-3 text-sky-500 flex-shrink-0" />
                        <p className="text-[11px] text-sky-700 flex-1 min-w-0">
                          Auto-corrected from <strong className="font-semibold">"{battery.manufacturerOriginalValue}"</strong>
                        </p>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                          onClick={() => {
                            const orig = battery.manufacturerOriginalValue!;
                            const restored = battery.manufacture;
                            setBatteries((prev) => prev.map((b) => b.id === battery.id ? {
                              ...b, manufacture: orig, manufactureCustom: "", manufacturerOriginalValue: undefined,
                              manufacturerFlagReason: MANUAL_UNKNOWN_FLAG_REASON, manufacturerSuggestion: restored,
                              manufacturerSuggestionConfidence: "low", manufacturerManuallyConfirmed: undefined,
                              manufacturerWasAccepted: false,
                            } : b));
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    )}
                    {showReviewFeedback && battery.manufacturerFlagReason && !isUnknownManufacturerValue(battery.manufacture) && (
                      <div className="space-y-1">
                        {battery.manufacturerFlagReason === MANUAL_UNKNOWN_FLAG_REASON && battery.manufacturerSuggestion && (
                          <CorrectionPrompt
                            suggestion={battery.manufacturerSuggestion}
                            onAccept={() => {
                              const accepted = battery.manufacturerSuggestion!;
                              setBatteries((prev) =>
                                prev.map((b) =>
                                  b.id === battery.id
                                    ? { ...b, manufacture: accepted, manufactureCustom: "", manufacturerFlagReason: "", manufacturerSuggestion: undefined, manufacturerWasAccepted: true }
                                    : b
                                )
                              );
                            }}
                            onDismiss={() => {
                              setBatteries((prev) =>
                                prev.map((b) =>
                                  b.id === battery.id ? { ...b, manufacturerSuggestion: undefined, manufacturerWasAccepted: false } : b
                                )
                              );
                            }}
                          />
                        )}
                        {battery.manufacturerFlagReason === MANUAL_UNKNOWN_FLAG_REASON
                          && !battery.manufacturerSuggestion
                          && !fetchingSuggestions.has(`${battery.id}_manufacture`)
                          && !battery.manufacturerManuallyConfirmed && (
                          <label className="flex items-center gap-1.5 cursor-pointer group mt-0.5">
                            <input
                              type="checkbox"
                              className="accent-amber-600 cursor-pointer"
                              onChange={() => setBatteries((prev) => prev.map((b) => b.id === battery.id ? { ...b, manufacturerManuallyConfirmed: true, manufacturerWasAccepted: false } : b))}
                            />
                            <span className="text-[10px] text-slate-500 group-hover:text-slate-600 transition-colors">
                              I confirm this value is correct — submit for Itinium review
                            </span>
                          </label>
                        )}
                        {battery.manufacturerFlagReason === CSV_UNKNOWN_FLAG_REASON &&
                          (() => {
                            const knownMfrs = manufacturers.filter((m) => m.toLowerCase() !== "other");
                            const suggestion = findClosestMatch(battery.manufacture, knownMfrs);
                            if (!suggestion) return null;
                            return (
                              <button
                                type="button"
                                className="text-[10px] font-medium text-[#0ea5e9] hover:text-[#0284c7] hover:underline"
                                onClick={() => {
                                  setBatteries((prev) =>
                                    prev.map((b) =>
                                      b.id === battery.id
                                        ? { ...b, manufacture: suggestion, manufactureCustom: "", manufacturerFlagReason: "" }
                                        : b
                                    )
                                  );
                                }}
                                data-testid={`button-mfr-suggestion-${index}`}
                              >
                                Did you mean: {suggestion}?
                              </button>
                            );
                          })()}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                    <label className="text-xs font-medium text-slate-600">
                      Cell Type
                    </label>
                    <CellModelCombobox
                      cellModels={cellModels}
                      manufacturer={battery.manufacture === "Other" ? battery.manufactureCustom : battery.manufacture}
                      value={battery.cellModel || battery.cellType}
                      onChange={(val, isModel) => {
                        if (isModel) {
                          updateBattery(battery.id, "cellModel", val);
                        } else {
                          setBatteries((prev) =>
                            prev.map((b) =>
                              b.id === battery.id
                                ? {
                                    ...b,
                                    cellType: val,
                                    cellModel: "",
                                     cellModelFlagReason: val === "Other" ? OTHER_REVIEW_FLAG_REASON : val === "Blocs" ? "" : b.cellModelFlagReason,
                                    voltageFlagReason: (val === "Blocs" || val === "Other") ? "" : b.voltageFlagReason,
                                    cellTypeSuggestion: undefined,
                                    cellTypeSuggestionConfidence: undefined,
                                    cellTypeOriginalValue: undefined,
                                    cellTypeManuallyConfirmed: undefined,
                                  }
                                : b
                            )
                          );
                          const updated = { ...battery, cellType: val, cellModel: "" };
                          if (!updated.weightManual) computeAndSetAutoWeight(updated);
                        }
                      }}
                      onBlurValidate={(committed) => {
                        const reason = validateBatteryField(
                          "cellType", committed, manufacturers, cellModels, manufacturerAliases
                        );
                        setBatteries((prev) =>
                          prev.map((b) =>
                            b.id === battery.id ? { ...b, cellModelFlagReason: reason, cellTypeSuggestion: undefined, cellTypeSuggestionConfidence: undefined, cellTypeOriginalValue: undefined, cellTypeManuallyConfirmed: undefined } : b
                          )
                        );
                      }}
                    />
                    {showReviewFeedback && battery.cellTypeOriginalValue && !battery.cellModelFlagReason && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-sky-50 border border-sky-200 rounded-md mt-1">
                        <Lightbulb className="w-3 h-3 text-sky-500 flex-shrink-0" />
                        <p className="text-[11px] text-sky-700 flex-1 min-w-0">
                          Auto-corrected from <strong className="font-semibold">"{battery.cellTypeOriginalValue}"</strong>
                        </p>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                          onClick={() => {
                            const orig = battery.cellTypeOriginalValue!;
                            const restored = battery.cellModel || battery.cellType;
                            setBatteries((prev) => prev.map((b) => b.id === battery.id ? {
                              ...b, cellType: orig, cellModel: "", cellTypeOriginalValue: undefined,
                              cellModelFlagReason: MANUAL_UNKNOWN_FLAG_REASON, cellTypeSuggestion: restored,
                              cellTypeSuggestionConfidence: "low", cellTypeManuallyConfirmed: undefined,
                              cellTypeWasAccepted: false,
                            } : b));
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    )}
                    {showReviewFeedback && battery.cellModelFlagReason && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-amber-700">Needs Review — {battery.cellModelFlagReason}</p>
                        {battery.cellModelFlagReason === MANUAL_UNKNOWN_FLAG_REASON && battery.cellTypeSuggestion && (
                          <CorrectionPrompt
                            suggestion={battery.cellTypeSuggestion}
                            onAccept={() => {
                              const accepted = battery.cellTypeSuggestion!;
                              const isModel = cellModels.some((m) => m.modelName === accepted);
                              if (isModel) {
                                updateBattery(battery.id, "cellModel", accepted);
                                setBatteries((prev) => prev.map((b) => b.id === battery.id ? { ...b, cellTypeSuggestion: undefined, cellTypeWasAccepted: true } : b));
                              } else {
                                setBatteries((prev) =>
                                  prev.map((b) =>
                                    b.id === battery.id
                                      ? { ...b, cellType: accepted, cellModel: "", cellModelFlagReason: "", cellTypeSuggestion: undefined, cellTypeWasAccepted: true }
                                      : b
                                  )
                                );
                              }
                            }}
                            onDismiss={() => {
                              setBatteries((prev) =>
                                prev.map((b) =>
                                  b.id === battery.id ? { ...b, cellTypeSuggestion: undefined, cellTypeWasAccepted: false } : b
                                )
                              );
                            }}
                          />
                        )}
                        {battery.cellModelFlagReason === MANUAL_UNKNOWN_FLAG_REASON
                          && !battery.cellTypeSuggestion
                          && !fetchingSuggestions.has(`${battery.id}_cellType`)
                          && !battery.cellTypeManuallyConfirmed
                          && !isReviewableProvisionalRow(battery) && (
                          <label className="flex items-center gap-1.5 cursor-pointer group mt-0.5">
                            <input
                              type="checkbox"
                              className="accent-amber-600 cursor-pointer"
                              onChange={() => setBatteries((prev) => prev.map((b) => b.id === battery.id ? { ...b, cellTypeManuallyConfirmed: true, cellTypeWasAccepted: false } : b))}
                            />
                            <span className="text-[10px] text-slate-500 group-hover:text-slate-600 transition-colors">
                              I confirm this value is correct — submit for Itinium review
                            </span>
                          </label>
                        )}
                        {isReviewableProvisionalRow(battery) && (
                          <p className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            Provisional cell type and manual weight — Itinium will confirm after collection.
                          </p>
                        )}
                        {battery.cellModelFlagReason === CSV_UNKNOWN_FLAG_REASON &&
                          (() => {
                            const effMfr = battery.manufacture === "Other" ? battery.manufactureCustom : battery.manufacture;
                            const scoped = effMfr
                              ? cellModels.filter((m) => m.manufacturer.toLowerCase() === effMfr.toLowerCase())
                              : cellModels;
                            const candidates = Array.from(new Set(scoped.map((m) => m.modelName)));
                            const searchTerm = battery.cellModel || battery.cellType;
                            let suggestion = findClosestMatch(searchTerm, candidates);
                            if (!suggestion && effMfr) {
                              suggestion = findClosestMatch(
                                searchTerm,
                                Array.from(new Set(cellModels.map((m) => m.modelName)))
                              );
                            }
                            if (!suggestion) return null;
                            return (
                              <button
                                type="button"
                                className="text-[10px] font-medium text-[#0ea5e9] hover:text-[#0284c7] hover:underline"
                                onClick={() => updateBattery(battery.id, "cellModel", suggestion!)}
                                data-testid={`button-cellmodel-suggestion-${index}`}
                              >
                                Did you mean: {suggestion}?
                              </button>
                            );
                          })()}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer h-10 px-3 bg-slate-50 border border-slate-200 rounded-md w-full">
                      <input
                        type="checkbox"
                        checked={battery.isLooseCells}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const updatedBattery: BatteryRow = {
                            ...battery,
                            isLooseCells: checked,
                            voltage: battery.voltage,
                            customVoltage: battery.customVoltage,
                            looseCellsQty: checked ? battery.looseCellsQty : (battery.cellType === "Blocs" ? battery.looseCellsQty : ""),
                            weightManual: checked ? false : battery.weightManual,
                            estimatedWeightKg: checked ? "" : battery.estimatedWeightKg,
                            voltageFlagReason: checked ? "" : battery.voltageFlagReason,
                          };
                          setBatteries((prev) =>
                            prev.map((b) => (b.id === battery.id ? updatedBattery : b))
                          );
                          computeAndSetAutoWeight(updatedBattery);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-[#0ea5e9] focus:ring-[#0ea5e9]"
                      />
                      <span className="text-xs font-medium text-slate-600">Loose cells?</span>
                    </label>
                  </div>

                  {(battery.isLooseCells || (battery.cellType !== "Blocs" && battery.cellType !== "Other")) && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-600">
                          {battery.isLooseCells ? "Loose Cell Voltage (optional)" : "If Complete Battery — Voltage"}
                        </label>
                        <TypeaheadInput
                          value={battery.voltage === "Other" && battery.customVoltage ? battery.customVoltage : battery.voltage}
                          options={VOLTAGE_VALUES}
                          placeholder="e.g. 48V"
                          icon={<Zap className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                          testId={`input-voltage-${index}`}
                          onChange={(v) => {
                            setBatteries((prev) =>
                              prev.map((b) =>
                                b.id === battery.id
                                  ? { ...b, voltage: v, customVoltage: "", voltageFlagReason: "", voltageSuggestion: undefined, voltageSuggestionConfidence: undefined, voltageOriginalValue: undefined, voltageManuallyConfirmed: undefined }
                                  : b
                              )
                            );
                          }}
                          onBlurValidate={(v) => {
                            const trimmed = canonicalizeVoltageInput(v);
                            const canonical = VOLTAGE_VALUES.find(
                              (o) => o.toLowerCase() === trimmed.toLowerCase()
                            );
                            const reason = validateBatteryField(
                              "voltage", trimmed, manufacturers, cellModels, manufacturerAliases
                            );
                            setBatteries((prev) =>
                              prev.map((b) => {
                                if (b.id !== battery.id) return b;
                                const updated = {
                                  ...b,
                                  voltage: canonical ?? trimmed,
                                  customVoltage: "",
                                  voltageFlagReason: reason,
                                  voltageSuggestion: undefined,
                                  voltageSuggestionConfidence: undefined,
                                  voltageOriginalValue: undefined,
                                  voltageManuallyConfirmed: undefined,
                                };
                                if (!updated.weightManual) computeAndSetAutoWeight(updated);
                                return updated;
                              })
                            );
                            if (reason === MANUAL_UNKNOWN_FLAG_REASON) {
                              fetchSuggestion(battery.id, "voltage", trimmed, VOLTAGE_VALUES);
                            }
                          }}
                        />
                        {showReviewFeedback && battery.voltageOriginalValue && !battery.voltageFlagReason && (
                          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-sky-50 border border-sky-200 rounded-md mt-1">
                            <Lightbulb className="w-3 h-3 text-sky-500 flex-shrink-0" />
                            <p className="text-[11px] text-sky-700 flex-1 min-w-0">
                              Auto-corrected from <strong className="font-semibold">"{battery.voltageOriginalValue}"</strong>
                            </p>
                            <button
                              type="button"
                              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                              onClick={() => {
                                const orig = battery.voltageOriginalValue!;
                                const restored = battery.voltage;
                                setBatteries((prev) => prev.map((b) => b.id === battery.id ? {
                                  ...b, voltage: orig, customVoltage: "", voltageOriginalValue: undefined,
                                  voltageFlagReason: MANUAL_UNKNOWN_FLAG_REASON, voltageSuggestion: restored,
                                  voltageSuggestionConfidence: "low", voltageManuallyConfirmed: undefined,
                                  voltageWasAccepted: false,
                                } : b));
                              }}
                            >
                              Restore
                            </button>
                          </div>
                        )}
                        {showReviewFeedback && battery.voltageFlagReason && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {battery.voltageFlagReason === MANUAL_UNKNOWN_FLAG_REASON
                                ? `"${battery.voltage}" is not a standard voltage — it will be reviewed by Itinium.`
                                : "Voltage flagged — missing from CSV. Fill in to clear."}
                            </p>
                            {battery.voltageFlagReason === MANUAL_UNKNOWN_FLAG_REASON && battery.voltageSuggestion && (
                              <CorrectionPrompt
                                suggestion={battery.voltageSuggestion}
                                onAccept={() => {
                                  const accepted = battery.voltageSuggestion!;
                                  setBatteries((prev) =>
                                    prev.map((b) => {
                                      if (b.id !== battery.id) return b;
                                      const updated = { ...b, voltage: accepted, customVoltage: "", voltageFlagReason: "", voltageSuggestion: undefined, voltageWasAccepted: true };
                                      if (!updated.weightManual) computeAndSetAutoWeight(updated);
                                      return updated;
                                    })
                                  );
                                }}
                                onDismiss={() => {
                                  setBatteries((prev) =>
                                    prev.map((b) =>
                                      b.id === battery.id ? { ...b, voltageSuggestion: undefined, voltageWasAccepted: false } : b
                                    )
                                  );
                                }}
                              />
                            )}
                            {battery.voltageFlagReason === MANUAL_UNKNOWN_FLAG_REASON
                              && !battery.voltageSuggestion
                              && !fetchingSuggestions.has(`${battery.id}_voltage`)
                              && !battery.voltageManuallyConfirmed && (
                              <label className="flex items-center gap-1.5 cursor-pointer group mt-0.5">
                                <input
                                  type="checkbox"
                                  className="accent-amber-600 cursor-pointer"
                                  onChange={() => setBatteries((prev) => prev.map((b) => b.id === battery.id ? { ...b, voltageManuallyConfirmed: true, voltageWasAccepted: false } : b))}
                                />
                                <span className="text-[10px] text-slate-500 group-hover:text-slate-600 transition-colors">
                                  I confirm this value is correct — submit for Itinium review
                                </span>
                              </label>
                            )}
                            {battery.voltageFlagReason === MANUAL_UNKNOWN_FLAG_REASON && battery.voltageManuallyConfirmed && (
                              <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                                <Check className="w-3 h-3" /> Confirmed — will be flagged for Itinium review
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {(battery.isLooseCells || battery.cellType === "Blocs") && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        Cell Qty
                      </label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g., 12"
                        className="h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9]"
                        value={battery.looseCellsQty}
                        onChange={(e) => updateBattery(battery.id, "looseCellsQty", e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                    <label className="text-xs font-medium text-slate-600">
                      Notes
                    </label>
                    <Input
                      placeholder="Any notes for this battery..."
                      className="h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9]"
                      value={battery.notes}
                      onChange={(e) => updateBattery(battery.id, "notes", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                    <label className="text-xs font-medium text-slate-600">
                      Row Photo
                    </label>
                    {battery.rowPhoto ? (
                      <div className="flex items-center gap-3">
                        <div className="relative w-16 h-16 rounded-lg bg-slate-200 border border-slate-300 group overflow-hidden">
                          <img
                            src={battery.rowPhoto}
                            alt="Battery row photo"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setBatteries((prev) =>
                                prev.map((b) =>
                                  b.id === battery.id ? { ...b, rowPhoto: "" } : b
                                )
                              );
                            }}
                            className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-xs text-emerald-600">Photo attached</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/jpeg,image/png";
                          input.onchange = (ev) => {
                            const file = (ev.target as HTMLInputElement).files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const dataUrl = reader.result as string;
                                setBatteries((prev) =>
                                  prev.map((b) =>
                                    b.id === battery.id ? { ...b, rowPhoto: dataUrl } : b
                                  )
                                );
                                toast({ title: "Photo attached", description: "Row photo added." });
                              };
                              reader.readAsDataURL(file);
                            }
                          };
                          input.click();
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed rounded-lg text-sm transition-colors border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500"
                      >
                        <Camera className="w-4 h-4" />
                        Upload Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <button
              type="button"
              onClick={addBatteryRow}
              className="w-full py-2.5 text-sm font-medium text-[#0ea5e9] hover:text-[#0284c7] hover:bg-sky-50 rounded-lg transition-colors flex items-center justify-center gap-2"
              data-testid="button-add-battery-row-bottom"
            >
              <Plus className="w-4 h-4" />
              Add Another Battery Row
            </button>
          </div>
        </section>

        {showReviewFeedback && <section
          className="bg-white rounded-xl p-5 border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)]"
          data-testid="section-tonnage-override"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="font-bold text-[#0f2744] text-lg">Total Tonnage</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-slate-500">Manual override</span>
              <input
                type="checkbox"
                checked={tonnageManual}
                onChange={(e) => {
                  setTonnageManual(e.target.checked);
                  if (e.target.checked) {
                    setTonnageOverride(autoTonnage.toFixed(3));
                  }
                }}
                className="h-4 w-4 rounded border-slate-300 text-[#0ea5e9] focus:ring-[#0ea5e9]"
              />
            </label>
          </div>
          {tonnageManual ? (
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.001"
                min="0"
                value={tonnageOverride}
                onChange={(e) => setTonnageOverride(e.target.value)}
                className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] max-w-[200px]"
              />
              <span className="text-sm text-slate-500">tonnes</span>
              <button
                type="button"
                className="text-xs text-[#0ea5e9] hover:underline"
                onClick={() => {
                  setTonnageManual(false);
                  setTonnageOverride("");
                }}
              >
                Use auto-calculated
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-[#0f2744]">{autoTonnage.toFixed(3)}t</span>
              <span className="text-sm text-emerald-600">Auto-calculated from battery weights</span>
            </div>
          )}
        </section>}

        <section
          className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden"
          data-testid="section-notes"
        >
          <div className="border-l-4 border-slate-300 bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            <h3 className="font-bold text-[#0f2744] text-lg">
              Internal notes{" "}
              <span className="text-slate-400 font-normal text-sm ml-1">
                (Optional)
              </span>
            </h3>
          </div>
          <div className="p-5">
            <p id="job-notes-description" className="text-sm text-slate-500 mb-3">{JOB_NOTES_DESCRIPTION}</p>
            <Textarea
              aria-label="Internal notes"
              aria-describedby="job-notes-description"
              placeholder={JOB_NOTES_PLACEHOLDER}
              className="min-h-[120px] bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9] resize-y"
              data-testid="textarea-notes"
              value={jobNotes}
              onChange={(e) => setJobNotes(e.target.value)}
            />
          </div>
        </section>

        <div className="h-6" />
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgb(0,0,0,0.05)] z-50 flex items-center justify-between gap-4">
        <div className="w-full max-w-4xl mx-auto flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none border-slate-300 text-slate-600 hover:bg-slate-50 h-12 font-medium"
            onClick={onSaveDraft}
            disabled={savingDraft || csvReading || !!pendingCsvImport}
            data-testid="button-save-draft"
          >
            <Save className="w-4 h-4 mr-2" />
            {savingDraft ? "Saving..." : currentDraftId ? "Update Draft" : "Save Draft"}
          </Button>
          <Button
            type="button"
            className="flex-1 sm:w-auto h-12 bg-[#0f2744] hover:bg-[#132744] text-white font-medium px-8 shadow-md"
            onClick={onSubmit}
            disabled={submitting || csvReading || !!pendingCsvImport || currentLoad > maxCapacity || (!showReviewFeedback && tokenWeightRows.length > 0 && !provisionalAck)}
            data-testid="button-submit-collection"
          >
            <Send className="w-4 h-4 mr-2" />
            {submitting ? "Submitting..." : "Submit Collection"}
          </Button>
        </div>
      </footer>

      <Dialog
        open={showReviewFeedback && !!pendingCsvImport}
        onOpenChange={(open) => { if (!open) setPendingCsvImport(null); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0f2744]">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              CSV rows need attention
            </DialogTitle>
            <DialogDescription>
              {pendingCsvImport && (
                <>
                  {pendingCsvImport.issues.length} of {pendingCsvImport.rows.length} row(s) in your CSV are missing
                  some details we need to price this collection. You can fill
                  them in right here — each row disappears from this list once
                  it's complete, and the import finishes automatically. If
                  you're not sure about something, you can still import anyway
                  and the Itinium team will review it.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {pendingCsvImport && (
            <div className="max-h-[50vh] overflow-y-auto border border-amber-200 rounded-md bg-amber-50/40 divide-y divide-amber-100">
              {pendingCsvImport.issues.map((issue) => {
                const row = pendingCsvImport.rows.find((r) => r.id === issue.rowId);
                return (
                  <div key={issue.rowId} className="px-3 py-3">
                    <p className="text-xs font-semibold text-amber-900 mb-2">
                      CSV row #{issue.rowNum}
                      {row?.batterySerial ? (
                        <span className="font-normal text-amber-700"> — serial {row.batterySerial}</span>
                      ) : null}
                    </p>
                    <div className="space-y-2">
                      {issue.fields.map((f, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                          <span className="text-xs text-amber-800 sm:w-56 flex-shrink-0">{f.label}</span>
                          <div className="flex-1 min-w-0 max-w-xs">
                            {f.target === "manufacture" && (
                              <Select
                                onValueChange={(v) => applyCsvSuggestion(issue.rowId, "manufacture", v)}
                              >
                                <SelectTrigger
                                  className="h-9 bg-white text-sm"
                                  data-testid={`select-csv-fix-manufacturer-${issue.rowNum}`}
                                >
                                  <SelectValue placeholder="Choose a manufacturer..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {manufacturers
                                    .filter((m) => m.toLowerCase() !== "other")
                                    .map((m) => (
                                      <SelectItem key={m} value={m}>
                                        {m}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}
                            {f.target === "cellModel" && (
                              <div data-testid={`combobox-csv-fix-cellmodel-${issue.rowNum}`}>
                                <CellModelCombobox
                                  cellModels={cellModels}
                                  manufacturer={row?.manufacture ?? ""}
                                  value=""
                                  onChange={(v, isModel) => {
                                    if (isModel) applyCsvSuggestion(issue.rowId, "cellModel", v);
                                  }}
                                />
                              </div>
                            )}
                            {f.target === "voltage" && (
                              <Select
                                onValueChange={(v) => applyCsvSuggestion(issue.rowId, "voltage", v)}
                              >
                                <SelectTrigger
                                  className="h-9 bg-white text-sm"
                                  data-testid={`select-csv-fix-voltage-${issue.rowNum}`}
                                >
                                  <SelectValue placeholder="Choose a voltage..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {VOLTAGE_VALUES.map((v) => (
                                    <SelectItem key={v} value={v}>
                                      {v}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          {f.suggestion && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0ea5e9] hover:text-[#0284c7] hover:underline flex-shrink-0"
                              onClick={() => applyCsvSuggestion(issue.rowId, f.target, f.suggestion!)}
                              data-testid={`button-csv-suggestion-${issue.rowNum}-${f.target}`}
                            >
                              Did you mean: {f.suggestion}?
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingCsvImport(null)}
              data-testid="button-csv-validation-cancel"
            >
              Cancel — fix CSV
            </Button>
            <Button
              type="button"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => {
                if (pendingCsvImport) {
                  commitCsvImport(pendingCsvImport.rows, true);
                  setPendingCsvImport(null);
                }
              }}
              data-testid="button-csv-validation-override"
            >
              Import anyway and flag for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TypeaheadInput({
  value,
  onChange,
  onBlurValidate,
  placeholder,
  options,
  icon,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlurValidate: (v: string) => void;
  placeholder?: string;
  options: string[];
  icon?: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [value, options]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center h-10 bg-slate-50 border rounded-md px-3 gap-2 transition-colors ${
          open
            ? "border-[#0ea5e9] ring-2 ring-[#0ea5e9]/20"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        {icon}
        <input
          type="text"
          className="flex-1 bg-transparent text-sm text-[#1e293b] outline-none placeholder:text-slate-400"
          value={value}
          placeholder={placeholder}
          data-testid={testId}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => {
              if (!containerRef.current?.contains(document.activeElement)) {
                setOpen(false);
                onBlurValidate(value);
              }
            }, 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              onBlurValidate(value);
            }
            if (e.key === "Tab") {
              const exact = options.find(
                (option) => option.toLowerCase() === value.trim().toLowerCase()
              );
              const committed = exact || (filtered.length === 1 ? filtered[0] : value);
              if (committed !== value) onChange(committed);
              setOpen(false);
              onBlurValidate(committed);
            } else if (e.key === "Enter") {
              setOpen(false);
              onBlurValidate(value);
            }
          }}
        />
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 flex-shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt);
                setOpen(false);
                onBlurValidate(opt);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CellModelCombobox({
  cellModels,
  manufacturer,
  value,
  onChange,
  onBlurValidate,
}: {
  cellModels: CellModelOption[];
  manufacturer: string;
  value: string;
  onChange: (value: string, isModel: boolean) => void;
  onBlurValidate?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef("");
  const cellModelsRef = useRef(cellModels);
  const onChangeRef = useRef(onChange);
  const onBlurValidateRef = useRef(onBlurValidate);
  const valueRef = useRef(value);

  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { cellModelsRef.current = cellModels; });
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { onBlurValidateRef.current = onBlurValidate; });
  useEffect(() => { valueRef.current = value; });

  function commitTyped(typed: string) {
    const t = typed.trim();
    if (!t) {
      onBlurValidateRef.current?.(valueRef.current);
      return;
    }
    const models = cellModelsRef.current;
    const normT = t.toLowerCase().replace(/[^a-z0-9]/g, "");
    const model = models.find(
      (m) => m.modelName.toLowerCase().replace(/[^a-z0-9]/g, "") === normT
    );
    if (model) {
      onChangeRef.current(t, true);
      onBlurValidateRef.current?.(t);
    } else {
      const family = models.find(
        (m) => m.cellFamily.toLowerCase().replace(/[^a-z0-9]/g, "") === normT
      );
      const committed = family ? family.cellFamily : t;
      onChangeRef.current(committed, false);
      onBlurValidateRef.current?.(committed);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const typed = searchRef.current.trim();
        if (typed) {
          commitTyped(typed);
        }
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const manufacturerModels = useMemo(() => {
    if (!manufacturer) return cellModels;
    const filtered = cellModels.filter((m) => manufacturerMatches(manufacturer, m.manufacturer));
    return [...filtered, ...cellModels.filter((m) => m.manufacturer === "TAB" && !filtered.includes(m))];
  }, [cellModels, manufacturer]);

  const filteredModels = useMemo(() => {
    if (!search.trim()) return manufacturerModels.slice(0, 50);
    const suggestions = rankCellTypeSuggestions(search, manufacturer, manufacturerModels, 50, 0.72);
    return suggestions.map((suggestion) => manufacturerModels.find(
      (model) => model.modelName === suggestion.modelName && model.manufacturer === suggestion.manufacturer
    )!).filter(Boolean);
  }, [manufacturerModels, search]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, CellModelOption[]> = {};
    for (const m of filteredModels) {
      if (!groups[m.cellFamily]) groups[m.cellFamily] = [];
      groups[m.cellFamily].push(m);
    }
    return groups;
  }, [filteredModels]);

  const displayValue = value || "";
  const isSpecial = value === "Blocs" || value === "Other";

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center h-10 bg-slate-50 border rounded-md px-3 gap-2 cursor-pointer transition-colors ${
          open ? "border-[#0ea5e9] ring-2 ring-[#0ea5e9]/20" : "border-slate-200 hover:border-slate-300"
        }`}
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <Layers className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-[#1e293b] outline-none placeholder:text-slate-400"
            placeholder="Search cell models (e.g. 5 PzS 775)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => {
              setTimeout(() => {
                if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
                  const typed = searchRef.current.trim();
                  if (typed) {
                    commitTyped(typed);
                  }
                  setOpen(false);
                  setSearch("");
                }
              }, 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setSearch("");
              }
              if (e.key === "Enter" && search.trim()) {
                e.preventDefault();
                commitTyped(search);
                setOpen(false);
                setSearch("");
              }
            }}
          />
        ) : (
          <span className={`flex-1 text-sm truncate ${displayValue ? "text-[#1e293b]" : "text-slate-400"}`}>
            {displayValue || "Select cell model or type..."}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
          <div className="p-1.5 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Special Types</p>
            {SPECIAL_TYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  value === st.value ? "bg-[#0ea5e9]/10 text-[#0ea5e9] font-medium" : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => {
                  onChange(st.value, false);
                  setOpen(false);
                  setSearch("");
                }}
              >
                {st.label}
              </button>
            ))}
          </div>

          {Object.keys(groupedModels).length > 0 ? (
            <div className="p-1.5">
              {Object.entries(groupedModels).map(([family, models]) => (
                <div key={family}>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1.5 mt-1">{family}</p>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors flex items-center justify-between ${
                        value === m.modelName ? "bg-[#0ea5e9]/10 text-[#0ea5e9] font-medium" : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        onChange(m.modelName, true);
                         // The input's delayed blur must not commit the old
                         // search text over a deliberately selected model.
                         searchRef.current = "";
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <span>{m.modelName} <span className="text-xs text-slate-400">({m.manufacturer})</span></span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-slate-400">
              {search ? "No matching cell models found" : manufacturer ? `No cell models found for ${manufacturer}` : "Loading cell models..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CorrectionPrompt({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-sky-50 border border-sky-200 rounded-md">
      <Lightbulb className="w-3 h-3 text-sky-500 flex-shrink-0" />
      <p className="text-[11px] text-sky-700 flex-1 min-w-0 truncate">
        Did you mean <strong className="font-semibold">{suggestion}</strong>?
      </p>
      <button
        type="button"
        className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-500 text-white hover:bg-sky-600 transition-colors flex-shrink-0"
        onClick={onAccept}
      >
        Accept
      </button>
      <button
        type="button"
        className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
        onClick={onDismiss}
      >
        Keep mine
      </button>
    </div>
  );
}
