import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useSearch } from "wouter";
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
  serialFlagged: boolean;
  serialFlagReason: string;
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
    serialFlagged: false,
    serialFlagReason: "",
    manufacturerFlagReason: "",
    cellModelFlagReason: "",
    voltageFlagReason: "",
    rowPhoto: "",
  };
}

const CSV_TEMPLATE_HEADERS = "Pallet Number,Asset No,Battery Serial,Manufacturer,Loose Cells Qty,Voltage,Cell Type,Notes";

const CSV_FLAG_REASON = "Missing from CSV import";
const CSV_UNKNOWN_FLAG_REASON = "Unknown value from CSV — please correct";
const MANUAL_UNKNOWN_FLAG_REASON = "Unrecognised value — not found in master list";
const VOLTAGE_VALUES = ["12V", "24V", "36V", "40V", "48V", "80V", "96V"];

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
      const knownLower = new Set(manufacturers.map((m) => m.toLowerCase()));
      if (knownLower.has(v.toLowerCase())) return "";
      if (Object.keys(aliases).some((a) => a.toLowerCase() === v.toLowerCase())) return "";
      return MANUAL_UNKNOWN_FLAG_REASON;
    }
    case "cellType": {
      if (v === "Blocs" || v === "Other") return "";
      if (cellModels.some((m) => m.cellFamily.toLowerCase() === v.toLowerCase())) return "";
      if (cellModels.some((m) => m.modelName.toLowerCase() === v.toLowerCase())) return "";
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
  const [user, setUser] = useState<User | null>(null);
  const [collectionPoint, setCollectionPoint] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [batteries, setBatteries] = useState<BatteryRow[]>([createEmptyBattery()]);
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [pendingCsvImport, setPendingCsvImport] = useState<{
    rows: BatteryRow[];
    issues: {
      rowNum: number;
      rowId: string;
      fields: {
        label: string;
        target?: "manufacture" | "cellModel";
        suggestion?: string;
      }[];
    }[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tonnageOverride, setTonnageOverride] = useState("");
  const [tonnageManual, setTonnageManual] = useState(false);
  const [manufacturers, setManufacturers] = useState<string[]>(DEFAULT_MANUFACTURERS);
  const [manufacturerAliases, setManufacturerAliases] = useState<Record<string, string>>({});
  const [mfrPopoverOpen, setMfrPopoverOpen] = useState<Record<string, boolean>>({});
  const [cellModels, setCellModels] = useState<CellModelOption[]>([]);
  const [collectionPointPresets, setCollectionPointPresets] = useState<CollectionPointPreset[]>([]);
  const [showCPDropdown, setShowCPDropdown] = useState(false);
  const cpInputRef = useRef<HTMLInputElement>(null);
  const cpDropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [clientLocations, setClientLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
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
          if (data.user.locationId) {
            setSelectedLocationId(String(data.user.locationId));
          }
          if (data.user.clientId && data.user.role === "team_leader") {
            fetch(`/api/clients/${data.user.clientId}/locations`, { credentials: "include" })
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                if (d?.locations) {
                  setClientLocations(d.locations.map((l: { id: number; name: string }) => ({ id: l.id, name: l.name })));
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
    fetch("/api/manufacturers", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.manufacturers?.length) setManufacturers(data.manufacturers);
        if (data?.aliases) setManufacturerAliases(data.aliases);
      })
      .catch(() => {});

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
            if (fd.collectionPoint !== undefined) setCollectionPoint(fd.collectionPoint || "");
            if (fd.jobNotes !== undefined) setJobNotes(fd.jobNotes || "");
            if (fd.tonnageOverride !== undefined) setTonnageOverride(fd.tonnageOverride || "");
            if (fd.tonnageManual !== undefined) setTonnageManual(!!fd.tonnageManual);
            if (fd.selectedLocationId !== undefined) setSelectedLocationId(fd.selectedLocationId || "");
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

  useEffect(() => {
    fetch("/api/cell-models", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.models) setCellModels(data.models);
      })
      .catch(() => {});

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
            // PZS/PZB/PZV references are keyed by voltage; derive per-cell
            // weight by dividing any reference entry by its cell count
            // (each cell = 2V, so a 12V battery contains 6 cells, etc).
            const ref = await fetchWeightFromApi(battery.cellType, "12V");
            if (ref) {
              perCell = (parseFloat(ref) / 6).toFixed(3);
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
    } else if (battery.cellModel && battery.voltage) {
      const effMfr = battery.manufacture === "Other" ? battery.manufactureCustom : battery.manufacture;
      const matchedModel =
        cellModels.find((m) => m.modelName === battery.cellModel && (!effMfr || m.manufacturer === effMfr)) ||
        cellModels.find((m) => m.modelName === battery.cellModel);
      const voltageNum = parseInt(String(battery.voltage).replace(/[^0-9]/g, ""), 10);
      if (matchedModel && !isNaN(voltageNum) && voltageNum > 0 && voltageNum % 2 === 0) {
        const numCells = voltageNum / 2;
        weight = (parseFloat(matchedModel.weightPerCellKg) * numCells).toFixed(3);
      }
    } else if (battery.cellType && battery.voltage) {
      const effectiveVoltage = battery.voltage === "Other" ? battery.customVoltage : battery.voltage;
      if (effectiveVoltage) {
        weight = await fetchWeightFromApi(battery.cellType, effectiveVoltage);
      }
    }
    if (weightLookupVersion.current[battery.id] !== version) return;
    setBatteries((prev) =>
      prev.map((b) => (b.id === battery.id && !b.weightManual ? { ...b, estimatedWeightKg: weight } : b))
    );
  }

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
        serialFlagged: false,
        serialFlagReason: "",
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
          if (mfrTrim) {
            const canonical = mfrByNorm.get(normalizeForMatch(mfrTrim));
            if (canonical) normalizedMfr = canonical;
          }

          const normalizedCellType = rawCellType.trim();

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
            cellModel: "",
            voltage: normalizedVoltage,
            customVoltage,
            looseCellsQty: looseQty,
            estimatedWeightKg: colMap["estimatedWeightKg"] !== undefined ? row[colMap["estimatedWeightKg"]] || "" : "",
            weightManual: !!(colMap["estimatedWeightKg"] !== undefined && row[colMap["estimatedWeightKg"]]),
            notes: colMap["notes"] !== undefined ? row[colMap["notes"]] || "" : "",
            isLooseCells: !!(looseQty && parseInt(looseQty, 10) > 0),
            serialFlagged: false,
            serialFlagReason: "",
            manufacturerFlagReason: "",
            cellModelFlagReason: "",
            voltageFlagReason: "",
            rowPhoto: "",
          };
        });

        const issues = validateImportRows(imported);

        if (issues.length > 0) {
          setPendingCsvImport({ rows: imported, issues });
          return;
        }

        commitCsvImport(imported);
      } catch {
        toast({ title: "CSV import failed", description: "Could not parse the CSV file. Please check the format.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

  function validateImportRows(rows: BatteryRow[]) {
    const knownManufacturers = manufacturers.filter((m) => m.toLowerCase() !== "other");
    const knownManufacturersLower = new Set(knownManufacturers.map((m) => m.toLowerCase()));
    const issues: {
      rowNum: number;
      rowId: string;
      fields: { label: string; target?: "manufacture" | "cellModel"; suggestion?: string }[];
    }[] = [];
    rows.forEach((b, i) => {
      const fields: { label: string; target?: "manufacture" | "cellModel"; suggestion?: string }[] = [];
      const voltageApplies = !b.isLooseCells && b.cellType !== "Blocs" && b.cellType !== "Other";
      if (!b.manufacture.trim()) {
        fields.push({ label: "Manufacturer" });
      } else if (knownManufacturers.length > 0 && !knownManufacturersLower.has(b.manufacture.trim().toLowerCase())) {
        fields.push({
          label: `Unknown manufacturer "${b.manufacture.trim()}"`,
          target: "manufacture",
          suggestion: findClosestMatch(b.manufacture, knownManufacturers) ?? undefined,
        });
      }
      if (voltageApplies && !b.voltage.trim()) fields.push({ label: "Voltage" });
      if (fields.length > 0) issues.push({ rowNum: i + 2, rowId: b.id, fields });
    });
    return issues;
  }

  function applyCsvSuggestion(rowId: string, target: "manufacture" | "cellModel", value: string) {
    setPendingCsvImport((prev) => {
      if (!prev) return prev;
      const updatedRows = prev.rows.map((r) => {
        if (r.id !== rowId) return r;
        if (target === "manufacture") {
          return { ...r, manufacture: value, manufactureCustom: "" };
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
    const knownManufacturers = new Set(
      manufacturers.filter((m) => m.toLowerCase() !== "other").map((m) => m.toLowerCase())
    );
    const finalRows = applyFlags
      ? rows.map((b) => {
          const voltageApplies = !b.isLooseCells && b.cellType !== "Blocs" && b.cellType !== "Other";
          let manufacturerFlagReason = b.manufacturerFlagReason;
          if (!b.manufacture.trim()) {
            manufacturerFlagReason = CSV_FLAG_REASON;
          } else if (manufacturers.length > 0 && !knownManufacturers.has(b.manufacture.trim().toLowerCase())) {
            manufacturerFlagReason = CSV_UNKNOWN_FLAG_REASON;
          }
          const voltageFlagReason =
            voltageApplies && !b.voltage.trim() ? CSV_FLAG_REASON : b.voltageFlagReason;
          return {
            ...b,
            manufacturerFlagReason,
            voltageFlagReason,
          };
        })
      : rows;
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
      description: flaggedCount > 0
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
        if (field === "manufacture" && newB.cellModel) {
          const effMfr = value === "Other" ? newB.manufactureCustom : value;
          const stillValid = !effMfr || cellModels.some((m) => m.modelName === newB.cellModel && m.manufacturer === effMfr);
          if (!stillValid) {
            newB.cellModel = "";
            newB.cellType = "";
          }
        }
        if (field === "cellModel") {
          const mfr = newB.manufacture === "Other" ? newB.manufactureCustom : newB.manufacture;
          const model = cellModels.find((m) => m.modelName === value && (!mfr || m.manufacturer === mfr)) || cellModels.find((m) => m.modelName === value);
          if (model) {
            newB.cellType = model.cellFamily;
          }
        }
        // Auto-clear CSV-import flags as soon as the user fills in a value
        if (field === "manufacture" && value.trim()) {
          newB.manufacturerFlagReason = "";
        }
        if (
          (field === "cellType" || field === "cellModel") &&
          (newB.cellModel.trim() || newB.cellType === "Blocs" || newB.cellType === "Other")
        ) {
          newB.cellModelFlagReason = "";
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
    if (!value.trim() || !candidates.length) return;
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
    const hasAtLeastOneIdentifier = batteries.some(
      (b) => b.batterySerial.trim() || b.assetNumber.trim() || b.serialFlagged
    );
    if (!hasAtLeastOneIdentifier) {
      toast({
        title: "Missing battery data",
        description: "Please fill in at least one battery row with an identifier.",
        variant: "destructive",
      });
      return;
    }

    const missingCustomMfr = batteries.some(
      (b) => b.manufacture === "Other" && !b.manufactureCustom.trim()
    );
    if (missingCustomMfr) {
      toast({
        title: "Missing manufacturer name",
        description: "Please enter the manufacturer name for batteries marked as 'Other'.",
        variant: "destructive",
      });
      return;
    }

    const looseCellsMissingInputs = batteries.some(
      (b) =>
        b.isLooseCells &&
        (!b.cellType.trim() || !b.looseCellsQty.trim() || parseInt(b.looseCellsQty, 10) <= 0)
    );
    if (looseCellsMissingInputs) {
      toast({
        title: "Missing details for loose cells",
        description: "Please complete the Cell Type and Cell Qty fields for all loose cell rows.",
        variant: "destructive",
      });
      return;
    }

    const flaggedMissingPhoto = batteries.some(
      (b) => b.serialFlagged && b.serialFlagReason !== "N/A (no serial fitted)" && !b.rowPhoto
    );
    if (flaggedMissingPhoto) {
      toast({
        title: "Photo required",
        description: "A photo is required for batteries with unknown or damaged serial numbers.",
        variant: "destructive",
      });
      return;
    }

    if (currentLoad < minTonnage) {
      toast({
        title: "Below minimum tonnage",
        description: `Minimum collection weight is ${targetMin}t. Current load is ${currentLoad.toFixed(3)}t. Please add more batteries.`,
        variant: "destructive",
      });
      return;
    }

    if (currentLoad > maxCapacity) {
      toast({
        title: "Exceeds maximum tonnage",
        description: `Maximum collection weight is ${maxCapacity}t. Current load is ${currentLoad.toFixed(3)}t. Please reduce the load.`,
        variant: "destructive",
      });
      return;
    }

    // Validate manufacturer, cell type, and voltage against master lists before submitting.
    // If any value is unrecognised, flag it but do not block — flags are stored for Itinium review.
    const validatedBatteries = batteries.map((b) => {
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
      if (b.manufacturerFlagReason === MANUAL_UNKNOWN_FLAG_REASON && !b.manufacturerManuallyConfirmed) {
        unresolvedCritical.push(`${rowLabel}: Manufacturer`);
      }
      if (b.cellModelFlagReason === MANUAL_UNKNOWN_FLAG_REASON && !b.cellTypeManuallyConfirmed) {
        unresolvedCritical.push(`${rowLabel}: Cell Model`);
      }
      if (!b.isLooseCells && b.voltageFlagReason === MANUAL_UNKNOWN_FLAG_REASON && !b.voltageManuallyConfirmed) {
        unresolvedCritical.push(`${rowLabel}: Voltage`);
      }
    });
    if (unresolvedCritical.length > 0) {
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
          depot: getSelectedLocationName() || user?.depot || "Unknown",
          collectionPoint: collectionPoint || null,
          collectionDate: null,
          tonnage: currentLoad > 0 ? currentLoad.toFixed(3) : "0.000",
          tonnageManualOverride: tonnageManual,
          notes: jobNotes || null,
          draftId: currentDraftId || undefined,
          batteries: validatedBatteries.map((b) => ({
            palletNumber: b.palletNumber || null,
            assetNumber: b.assetNumber || null,
            batterySerial: b.serialFlagged ? (b.serialFlagReason || "Unknown") : (b.batterySerial || null),
            manufacture: b.manufacture === "Other" ? (b.manufactureCustom || "Other") : (b.manufacture || null),
            cellType: b.cellModel || b.cellType || null,
            voltage: b.isLooseCells ? null : ((b.voltage === "Other" ? b.customVoltage : b.voltage) || null),
            looseCellsQty: b.looseCellsQty || null,
            estimatedWeightKg: b.estimatedWeightKg || null,
            isLooseCells: b.isLooseCells,
            serialFlagReason: b.serialFlagged ? (b.serialFlagReason || null) : null,
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
        setJobNotes("");
        setTonnageManual(false);
        setTonnageOverride("");
        setCurrentDraftId(null);
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
        collectionPoint,
        jobNotes,
        tonnageOverride,
        tonnageManual,
        selectedLocationId,
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
    const w = parseFloat(b.estimatedWeightKg);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);
  const autoTonnage = totalWeightKg / 1000;
  const currentLoad = tonnageManual && tonnageOverride ? parseFloat(tonnageOverride) || 0 : autoTonnage;
  const minTonnage = 9.5;
  const maxCapacity = 26.0;
  const targetMin = 10.0;
  const approachLowerBound = 11.0;
  const approachUpperBound = 24.0;
  const progressPercent = Math.min(100, Math.round((currentLoad / maxCapacity) * 100));

  type LoadState = "empty" | "red-low" | "red-high" | "amber-low" | "amber-high" | "green";
  let loadState: LoadState = "empty";
  if (currentLoad > 0 && currentLoad < minTonnage) loadState = "red-low";
  else if (currentLoad > maxCapacity) loadState = "red-high";
  else if (currentLoad >= minTonnage && currentLoad < approachLowerBound) loadState = "amber-low";
  else if (currentLoad > approachUpperBound && currentLoad <= maxCapacity) loadState = "amber-high";
  else if (currentLoad >= approachLowerBound && currentLoad <= approachUpperBound) loadState = "green";

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

      <main className="w-full max-w-4xl px-4 sm:px-6 py-6 space-y-6 flex-1 flex flex-col">
        <section
          className={`rounded-xl p-4 sm:p-5 border shadow-sm relative overflow-hidden ${
            isRed ? "bg-red-50 border-red-200" : isAmber ? "bg-amber-50 border-amber-200" : isGreen ? "bg-emerald-50 border-emerald-200" : "bg-sky-50 border-sky-100"
          }`}
          data-testid="section-tonnage-progress"
        >
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Current Load
              </p>
              <h3 className={`text-lg sm:text-xl font-bold ${isRed ? "text-red-700" : isAmber ? "text-amber-700" : "text-[#0f2744]"}`}>
                {currentLoad.toFixed(3)}t{" "}
                <span className="text-slate-500 text-sm sm:text-base font-normal">
                  / {maxCapacity}t max
                </span>
              </h3>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                isRed ? "text-red-700 bg-red-100" : isAmber ? "text-amber-700 bg-amber-100" : isGreen ? "text-emerald-700 bg-emerald-100" : "text-sky-700 bg-sky-100"
              }`}>
                {progressPercent}% Capacity
              </span>
            </div>
          </div>
          {loadState === "red-low" && (
            <p className="text-xs font-medium text-red-700 mb-2">
              Below minimum {targetMin}t (grace from {minTonnage}t). Cannot submit until at least {minTonnage}t.
            </p>
          )}
          {loadState === "red-high" && (
            <p className="text-xs font-medium text-red-700 mb-2">
              Exceeds maximum {maxCapacity}t truck capacity. Remove batteries to submit.
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
        </section>

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
                  {[getSelectedLocationName() || user?.depot, user?.fullName].filter(Boolean).join(" — ")}
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

          {user?.role === "team_leader" && clientLocations.length > 0 && (
            <div className="space-y-1.5 max-w-xl">
              <label className="text-sm font-medium text-[#1e293b] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Location
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none h-11 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                >
                  <option value="">Select a location...</option>
                  {clientLocations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
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
              const hasAnyFlag = battery.serialFlagged || !!battery.manufacturerFlagReason || !!battery.cellModelFlagReason || !!battery.voltageFlagReason;
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
                        className={`pl-9 h-10 border-slate-200 text-sm focus-visible:ring-[#0ea5e9] ${battery.serialFlagged ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-slate-50 text-[#1e293b]"}`}
                        value={battery.serialFlagged ? (battery.serialFlagReason || "Flagged") : battery.batterySerial}
                        onChange={(e) => updateBattery(battery.id, "batterySerial", e.target.value)}
                        disabled={battery.serialFlagged}
                      />
                    </div>
                    {!battery.serialFlagged ? (
                      <button
                        type="button"
                        className="text-[10px] text-amber-600 hover:text-amber-800 hover:underline flex items-center gap-1"
                        onClick={() => {
                          setBatteries((prev) =>
                            prev.map((b) =>
                              b.id === battery.id
                                ? { ...b, serialFlagged: true, serialFlagReason: "Unknown serial", batterySerial: "" }
                                : b
                            )
                          );
                        }}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Serial unknown or damaged?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-[10px] text-[#0ea5e9] hover:underline"
                        onClick={() => {
                          setBatteries((prev) =>
                            prev.map((b) =>
                              b.id === battery.id
                                ? { ...b, serialFlagged: false, serialFlagReason: "", rowPhoto: "" }
                                : b
                            )
                          );
                        }}
                      >
                        Clear flag — enter serial manually
                      </button>
                    )}
                  </div>

                  {battery.serialFlagged && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-amber-700">
                        Reason
                      </label>
                      <Select
                        value={battery.serialFlagReason}
                        onValueChange={(val) => {
                          setBatteries((prev) =>
                            prev.map((b) =>
                              b.id === battery.id
                                ? { ...b, serialFlagReason: val }
                                : b
                            )
                          );
                        }}
                      >
                        <SelectTrigger className="h-10 bg-amber-50 border-amber-200 text-sm text-amber-900 focus:ring-amber-400">
                          <SelectValue placeholder="Select reason..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Unknown serial">Unknown serial</SelectItem>
                          <SelectItem value="Damaged — unreadable">Damaged — unreadable</SelectItem>
                          <SelectItem value="N/A (no serial fitted)">N/A (no serial fitted)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

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
                        setBatteries((prev) =>
                          prev.map((b) =>
                            b.id === battery.id
                              ? { ...b, manufacture: v, manufactureCustom: "", manufacturerFlagReason: "", manufacturerSuggestion: undefined, manufacturerSuggestionConfidence: undefined, manufacturerOriginalValue: undefined, manufacturerManuallyConfirmed: undefined }
                              : b
                          )
                        );
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
                    {battery.manufacturerOriginalValue && !battery.manufacturerFlagReason && (
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
                    {battery.manufacturerFlagReason && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {battery.manufacturerFlagReason === MANUAL_UNKNOWN_FLAG_REASON
                            ? `"${battery.manufacture}" was not recognised — it will be reviewed by Itinium.`
                            : battery.manufacturerFlagReason === CSV_UNKNOWN_FLAG_REASON
                            ? `Flagged — "${battery.manufacture}" is not in Itinium's known list.`
                            : "Flagged — missing from CSV. Fill in to clear."}
                        </p>
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
                        {battery.manufacturerFlagReason === MANUAL_UNKNOWN_FLAG_REASON && battery.manufacturerManuallyConfirmed && (
                          <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                            <Check className="w-3 h-3" /> Confirmed — will be flagged for Itinium review
                          </p>
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
                      Cell Type / Cell Model
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
                                    cellModelFlagReason: (val === "Blocs" || val === "Other") ? "" : b.cellModelFlagReason,
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
                        if (reason === MANUAL_UNKNOWN_FLAG_REASON) {
                          const cellFamilies = Array.from(new Set(cellModels.map((m) => m.cellFamily)));
                          const prefix = committed.trim().toLowerCase().slice(0, 3);
                          const nearbyModels = cellModels
                            .filter((m) => m.modelName.toLowerCase().startsWith(prefix))
                            .slice(0, 40)
                            .map((m) => m.modelName);
                          const candidates = [...cellFamilies, ...nearbyModels];
                          fetchSuggestion(battery.id, "cellType", committed, candidates);
                        }
                      }}
                    />
                    {battery.cellModel && (
                      <p className="text-[10px] text-emerald-600">
                        Cell model selected &mdash; weight = {(() => { const effMfr = battery.manufacture === "Other" ? battery.manufactureCustom : battery.manufacture; return (cellModels.find(m => m.modelName === battery.cellModel && (!effMfr || m.manufacturer === effMfr)) || cellModels.find(m => m.modelName === battery.cellModel))?.weightPerCellKg || "?"; })()} kg/cell
                      </p>
                    )}
                    {battery.cellTypeOriginalValue && !battery.cellModelFlagReason && (
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
                    {battery.cellModelFlagReason && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {battery.cellModelFlagReason === MANUAL_UNKNOWN_FLAG_REASON
                            ? `"${battery.cellModel || battery.cellType}" was not recognised — it will be reviewed by Itinium.`
                            : battery.cellModelFlagReason === CSV_UNKNOWN_FLAG_REASON
                            ? `Flagged — "${battery.cellModel}" is not in Itinium's known list.`
                            : "Flagged — missing from CSV. Fill in to clear."}
                        </p>
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
                          && !battery.cellTypeManuallyConfirmed && (
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
                        {battery.cellModelFlagReason === MANUAL_UNKNOWN_FLAG_REASON && battery.cellTypeManuallyConfirmed && (
                          <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                            <Check className="w-3 h-3" /> Confirmed — will be flagged for Itinium review
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
                            voltage: checked ? "" : battery.voltage,
                            customVoltage: checked ? "" : battery.customVoltage,
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

                  {!battery.isLooseCells && battery.cellType !== "Blocs" && battery.cellType !== "Other" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-600">
                          If Complete Battery &mdash; Voltage
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
                            const trimmed = v.trim();
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
                        {battery.voltageOriginalValue && !battery.voltageFlagReason && (
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
                        {battery.voltageFlagReason && (
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
                    <label className={`text-xs font-medium ${battery.serialFlagged && battery.serialFlagReason !== "N/A (no serial fitted)" ? "text-amber-700" : "text-slate-600"}`}>
                      Row Photo {battery.serialFlagged && battery.serialFlagReason !== "N/A (no serial fitted)" && "(Required)"}
                    </label>
                    {battery.serialFlagged && battery.serialFlagReason !== "N/A (no serial fitted)" && !battery.rowPhoto && (
                      <p className="text-[10px] text-amber-600">A photo is required for batteries without a readable serial number</p>
                    )}
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
                        className={`flex items-center gap-2 px-4 py-2.5 border-2 border-dashed rounded-lg text-sm transition-colors ${
                          battery.serialFlagged && battery.serialFlagReason !== "N/A (no serial fitted)"
                            ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
                            : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500"
                        }`}
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

        <section
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
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".csv,text/csv";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleCsvImport(file);
                };
                input.click();
              }}
              className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-[#0ea5e9] transition-all group outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9] focus-visible:ring-offset-2"
              data-testid="button-upload-csv"
            >
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-[#0ea5e9]" />
              </div>
              <p className="text-[#0f2744] font-bold text-lg mb-1">
                Upload CSV File
              </p>
              <p className="text-slate-500 text-sm mb-1">
                Import battery items from a spreadsheet
              </p>
              <p className="text-slate-400 text-xs">
                Download the template above for the correct format
              </p>
            </button>
          </div>
        </section>

        <section
          className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden"
          data-testid="section-notes"
        >
          <div className="border-l-4 border-slate-300 bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            <h3 className="font-bold text-[#0f2744] text-lg">
              Notes{" "}
              <span className="text-slate-400 font-normal text-sm ml-1">
                (Optional)
              </span>
            </h3>
          </div>
          <div className="p-5">
            <Textarea
              placeholder="Add any additional notes about this collection..."
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
            disabled={savingDraft}
            data-testid="button-save-draft"
          >
            <Save className="w-4 h-4 mr-2" />
            {savingDraft ? "Saving..." : currentDraftId ? "Update Draft" : "Save Draft"}
          </Button>
          <Button
            type="button"
            className="flex-1 sm:w-auto h-12 bg-[#0f2744] hover:bg-[#132744] text-white font-medium px-8 shadow-md"
            onClick={onSubmit}
            disabled={submitting}
            data-testid="button-submit-collection"
          >
            <Send className="w-4 h-4 mr-2" />
            {submitting ? "Submitting..." : "Submit Collection"}
          </Button>
        </div>
      </footer>

      <Dialog
        open={!!pendingCsvImport}
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
                  or have unknown values for fields Itinium needs to price this
                  collection (Manufacturer, Voltage). Apply a suggested
                  match where shown, go back and fix the CSV, or import anyway —
                  affected rows will be flagged for the Itinium team to review.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {pendingCsvImport && (
            <div className="max-h-72 overflow-y-auto border border-amber-200 rounded-md bg-amber-50/40">
              <table className="w-full text-sm">
                <thead className="bg-amber-100/60 text-xs text-amber-900 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">CSV Row</th>
                    <th className="px-3 py-2 text-left font-semibold">Missing or unknown fields</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {pendingCsvImport.issues.map((issue) => (
                    <tr key={issue.rowNum}>
                      <td className="px-3 py-2 text-amber-900 font-mono text-xs align-top">#{issue.rowNum}</td>
                      <td className="px-3 py-2 text-amber-800">
                        <ul className="space-y-1">
                          {issue.fields.map((f, idx) => (
                            <li key={idx} className="flex flex-wrap items-center gap-2">
                              <span>{f.label}</span>
                              {f.target && f.suggestion && (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0ea5e9] hover:text-[#0284c7] hover:underline"
                                  onClick={() => applyCsvSuggestion(issue.rowId, f.target!, f.suggestion!)}
                                  data-testid={`button-csv-suggestion-${issue.rowNum}-${f.target}`}
                                >
                                  Did you mean: {f.suggestion}?
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            if (e.key === "Enter" || e.key === "Tab") {
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
    const model = models.find((m) => m.modelName.toLowerCase() === t.toLowerCase());
    if (model) {
      onChangeRef.current(model.modelName, true);
      onBlurValidateRef.current?.(model.modelName);
    } else {
      const family = models.find((m) => m.cellFamily.toLowerCase() === t.toLowerCase());
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
    const filtered = cellModels.filter((m) => m.manufacturer === manufacturer);
    return filtered;
  }, [cellModels, manufacturer]);

  const filteredModels = useMemo(() => {
    if (!search.trim()) return manufacturerModels.slice(0, 50);
    const q = search.toLowerCase().replace(/\s+/g, "");
    return manufacturerModels
      .filter((m) => m.modelName.toLowerCase().replace(/\s+/g, "").startsWith(q) || m.cellFamily.toLowerCase().includes(q))
      .slice(0, 50);
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
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <span>{m.modelName}</span>
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
