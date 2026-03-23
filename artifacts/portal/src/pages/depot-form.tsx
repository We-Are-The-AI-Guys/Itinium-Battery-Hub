import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
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
  CalendarDays,
  Factory,
  Layers,
  Check,
  ChevronsUpDown,
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
import { useToast } from "@/hooks/use-toast";

interface BatteryRow {
  id: string;
  assetNumber: string;
  batterySerial: string;
  manufacture: string;
  manufactureCustom: string;
  cellType: string;
  voltage: string;
  customVoltage: string;
  looseCellsQty: string;
  estimatedWeightKg: string;
  weightManual: boolean;
  notes: string;
}

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
}

function createEmptyBattery(): BatteryRow {
  return {
    id: crypto.randomUUID(),
    assetNumber: "",
    batterySerial: "",
    manufacture: "",
    manufactureCustom: "",
    cellType: "",
    voltage: "",
    customVoltage: "",
    looseCellsQty: "",
    estimatedWeightKg: "",
    weightManual: false,
    notes: "",
  };
}

const CELL_TYPES = [
  { value: "PZB", label: "PZB" },
  { value: "PZS", label: "PZS" },
  { value: "PZV", label: "PZV" },
  { value: "Blocs", label: "Blocs" },
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
  "EnerSys Hawker",
  "Espex",
  "Eternity",
  "Exide / GNB",
  "Hawker",
  "Velaris / Ecobat / EDrive",
  "Hoppecke",
  "Juice",
  "Midac",
  "TAB",
  "Triathlon / Sunlight",
  "Other",
];

export default function DepotFormPage() {
  const [user, setUser] = useState<User | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [collectionPoint, setCollectionPoint] = useState("");
  const [collectionDate, setCollectionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [jobNotes, setJobNotes] = useState("");
  const [batteries, setBatteries] = useState<BatteryRow[]>([createEmptyBattery()]);
  const [submitting, setSubmitting] = useState(false);
  const [tonnageOverride, setTonnageOverride] = useState("");
  const [tonnageManual, setTonnageManual] = useState(false);
  const [manufacturers, setManufacturers] = useState<string[]>(DEFAULT_MANUFACTURERS);
  const [mfrPopoverOpen, setMfrPopoverOpen] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
    fetch("/api/manufacturers", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.manufacturers?.length) setManufacturers(data.manufacturers);
      })
      .catch(() => {});
  }, []);

  async function fetchWeightFromApi(cellType: string, voltage: string | null): Promise<string> {
    if (!cellType) return "";
    const params = new URLSearchParams({ cellType });
    if (voltage) params.set("voltage", voltage);
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
    if (battery.cellType === "Blocs") {
      const perBloc = await fetchWeightFromApi("Blocs", null);
      const qty = parseInt(battery.looseCellsQty, 10);
      if (perBloc && !isNaN(qty) && qty > 0) {
        weight = (parseFloat(perBloc) * qty).toFixed(3);
      }
    } else if (battery.cellType === "Other") {
      weight = await fetchWeightFromApi("Other", null);
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = import.meta.env.BASE_URL;
  }

  function handlePhotoUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        const newPhotos = Array.from(files).map((file) =>
          URL.createObjectURL(file)
        );
        setUploadedPhotos((prev) => [...prev, ...newPhotos]);
        toast({
          title: "Photos attached",
          description: `${files.length} photo(s) added successfully`,
        });
      }
    };
    input.click();
  }

  function removePhoto(index: number) {
    setUploadedPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function updateBattery(id: string, field: keyof BatteryRow, value: string) {
    setBatteries((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, [field]: value } : b));
      if (field === "cellType" || field === "voltage" || field === "looseCellsQty" || field === "customVoltage") {
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

  async function onSubmit() {
    const hasAtLeastOneSerial = batteries.some(
      (b) => b.batterySerial.trim() || b.assetNumber.trim()
    );
    if (!hasAtLeastOneSerial) {
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

    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientName: customerName || user?.fullName || "Unknown",
          depot: user?.depot || "Unknown",
          collectionPoint: collectionPoint || null,
          collectionDate: collectionDate || null,
          tonnage: currentLoad > 0 ? currentLoad.toFixed(3) : "0.000",
          tonnageManualOverride: tonnageManual,
          notes: jobNotes || null,
          batteries: batteries.map((b) => ({
            assetNumber: b.assetNumber || null,
            batterySerial: b.batterySerial || null,
            manufacture: b.manufacture === "Other" ? (b.manufactureCustom || "Other") : (b.manufacture || null),
            cellType: b.cellType || null,
            voltage: (b.voltage === "Other" ? b.customVoltage : b.voltage) || null,
            looseCellsQty: b.looseCellsQty || null,
            estimatedWeightKg: b.estimatedWeightKg || null,
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
        setCustomerName("");
        setCollectionPoint("");
        setJobNotes("");
        setUploadedPhotos([]);
        setTonnageManual(false);
        setTonnageOverride("");
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

  function onSaveDraft() {
    toast({
      title: "Draft saved",
      description: "Your collection draft has been saved.",
    });
  }

  const totalWeightKg = batteries.reduce((sum, b) => {
    const w = parseFloat(b.estimatedWeightKg);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);
  const autoTonnage = totalWeightKg / 1000;
  const currentLoad = tonnageManual && tonnageOverride ? parseFloat(tonnageOverride) || 0 : autoTonnage;
  const maxCapacity = 10.0;
  const progressPercent = Math.min(100, Math.round((currentLoad / maxCapacity) * 100));

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
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-slate-700">
              Depot: {user?.depot || "Loading..."}
            </span>
            <span className="text-xs text-slate-500">
              {user?.fullName || "..."}
            </span>
          </div>
          <div
            className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[#0f2744] font-medium text-sm cursor-pointer"
            onClick={handleLogout}
            data-testid="button-header-logout"
          >
            {user?.fullName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase() || ".."}
          </div>
        </div>
      </header>

      <main className="w-full max-w-4xl px-4 sm:px-6 py-6 space-y-6 flex-1 flex flex-col">
        <section
          className="bg-sky-50 rounded-xl p-4 sm:p-5 border border-sky-100 shadow-sm relative overflow-hidden"
          data-testid="section-tonnage-progress"
        >
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Current Load
              </p>
              <h3 className="text-lg sm:text-xl font-bold text-[#0f2744]">
                {currentLoad.toFixed(3)}t{" "}
                <span className="text-slate-500 text-sm sm:text-base font-normal">
                  / {maxCapacity}t
                </span>
              </h3>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-sky-700 bg-sky-100 px-2 py-1 rounded">
                {progressPercent}% Capacity
              </span>
            </div>
          </div>
          <div className="relative h-3 w-full bg-slate-200 rounded-full overflow-hidden mt-3">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#0ea5e9] to-[#10b981] rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
              style={{ left: "100%", marginLeft: "-2px" }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2 text-right">
            Threshold: {maxCapacity} tonnes
          </p>
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
                  {user?.depot || "..."} &mdash; {user?.fullName || "..."}
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Customer Name
              </label>
              <Input
                placeholder="e.g., Acme Logistics Ltd"
                className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Collection Point
              </label>
              <Input
                placeholder="e.g., Unit 4, Aston Industrial Estate"
                className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                value={collectionPoint}
                onChange={(e) => setCollectionPoint(e.target.value)}
                data-testid="input-collection-point"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b] flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                Collection Date
              </label>
              <Input
                type="date"
                className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                data-testid="input-collection-date"
              />
            </div>
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
            {batteries.map((battery, index) => (
              <div
                key={battery.id}
                className="p-5 bg-white hover:bg-slate-50/30 transition-colors"
                data-testid={`battery-row-${index}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Battery #{index + 1}
                  </span>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        className="pl-9 h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9]"
                        value={battery.batterySerial}
                        onChange={(e) => updateBattery(battery.id, "batterySerial", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Manufacture
                    </label>
                    <Popover
                      open={mfrPopoverOpen[battery.id] || false}
                      onOpenChange={(open) =>
                        setMfrPopoverOpen((prev) => ({ ...prev, [battery.id]: open }))
                      }
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-between w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-[#1e293b] hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9] focus:ring-offset-0"
                          data-testid={`select-manufacture-${index}`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Factory className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                            {battery.manufacture ? (
                              <span>{battery.manufacture}</span>
                            ) : (
                              <span className="text-slate-400">Select manufacturer...</span>
                            )}
                          </span>
                          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 ml-2" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search manufacturer..." />
                          <CommandList>
                            <CommandEmpty>No manufacturer found.</CommandEmpty>
                            <CommandGroup>
                              {manufacturers.map((m) => (
                                <CommandItem
                                  key={m}
                                  value={m}
                                  onSelect={() => {
                                    updateBattery(battery.id, "manufacture", m);
                                    if (m !== "Other") {
                                      setBatteries((prev) =>
                                        prev.map((b) =>
                                          b.id === battery.id ? { ...b, manufactureCustom: "" } : b
                                        )
                                      );
                                    }
                                    setMfrPopoverOpen((prev) => ({ ...prev, [battery.id]: false }));
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      battery.manufacture === m ? "opacity-100" : "opacity-0"
                                    }`}
                                  />
                                  {m}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {battery.manufacture === "Other" && (
                      <Input
                        placeholder="Enter manufacturer name..."
                        className="h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9] mt-1.5"
                        value={battery.manufactureCustom}
                        onChange={(e) =>
                          setBatteries((prev) =>
                            prev.map((b) =>
                              b.id === battery.id ? { ...b, manufactureCustom: e.target.value } : b
                            )
                          )
                        }
                        data-testid={`input-manufacture-custom-${index}`}
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Type of Cells
                    </label>
                    <Select
                      value={battery.cellType}
                      onValueChange={(val) => updateBattery(battery.id, "cellType", val)}
                    >
                      <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus:ring-[#0ea5e9]">
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          <SelectValue placeholder="Select type..." />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {CELL_TYPES.map((ct) => (
                          <SelectItem key={ct.value} value={ct.value}>
                            {ct.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {battery.cellType !== "Blocs" && battery.cellType !== "Other" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-600">
                          If Complete Battery &mdash; Voltage
                        </label>
                        <Select
                          value={battery.voltage}
                          onValueChange={(val) => {
                            updateBattery(battery.id, "voltage", val);
                            if (val !== "Other") {
                              updateBattery(battery.id, "customVoltage", "");
                            }
                          }}
                        >
                          <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus:ring-[#0ea5e9]">
                            <div className="flex items-center gap-2">
                              <Zap className="h-3.5 w-3.5 text-slate-400" />
                              <SelectValue placeholder="Select voltage..." />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {VOLTAGE_OPTIONS.map((v) => (
                              <SelectItem key={v.value} value={v.value}>
                                {v.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {battery.voltage === "Other" && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-600">
                            Custom Voltage
                          </label>
                          <Input
                            placeholder="e.g., 72V"
                            className="h-10 bg-slate-50 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9]"
                            value={battery.customVoltage}
                            onChange={(e) => updateBattery(battery.id, "customVoltage", e.target.value)}
                            data-testid={`input-custom-voltage-${index}`}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {battery.cellType === "Blocs" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        If Loose Cells &mdash; Qty
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

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Est. Weight (kg)
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="Auto or enter manually"
                      className={`h-10 border-slate-200 text-sm text-[#1e293b] focus-visible:ring-[#0ea5e9] ${
                        battery.estimatedWeightKg && !battery.weightManual
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-slate-50"
                      }`}
                      value={battery.estimatedWeightKg}
                      onChange={(e) => {
                        setBatteries((prev) =>
                          prev.map((b) =>
                            b.id === battery.id
                              ? { ...b, estimatedWeightKg: e.target.value, weightManual: true }
                              : b
                          )
                        );
                      }}
                    />
                    {battery.estimatedWeightKg && !battery.weightManual && (
                      <p className="text-[10px] text-emerald-600">Auto-populated from reference</p>
                    )}
                    {battery.weightManual && battery.cellType && (
                      <button
                        type="button"
                        className="text-[10px] text-[#0ea5e9] hover:underline"
                        onClick={() => {
                          setBatteries((prev) =>
                            prev.map((b) =>
                              b.id === battery.id
                                ? { ...b, weightManual: false, estimatedWeightKg: "" }
                                : b
                            )
                          );
                          computeAndSetAutoWeight({ ...battery, weightManual: false });
                        }}
                      >
                        Reset to default
                      </button>
                    )}
                  </div>

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
                </div>
              </div>
            ))}
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
          data-testid="section-photo-capture"
        >
          <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#0ea5e9]" />
            <h3 className="font-bold text-[#0f2744] text-lg">
              Photo Capture
            </h3>
          </div>
          <div className="p-5">
            <button
              type="button"
              onClick={handlePhotoUpload}
              className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-[#0ea5e9] transition-all group outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9] focus-visible:ring-offset-2"
              data-testid="button-upload-photo"
            >
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-[#0ea5e9]" />
              </div>
              <p className="text-[#0f2744] font-bold text-lg mb-1">
                Upload Photo
              </p>
              <p className="text-[#0ea5e9] text-sm font-medium mb-3 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> AI-assisted data extraction
              </p>
              <p className="text-slate-500 text-xs">
                Supports JPG, PNG up to 10MB
              </p>
            </button>

            {uploadedPhotos.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">
                  Attached Photos ({uploadedPhotos.length})
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {uploadedPhotos.map((src, index) => (
                    <div
                      key={index}
                      className="relative w-24 h-24 rounded-lg bg-slate-200 border border-slate-300 flex-shrink-0 group overflow-hidden"
                      data-testid={`photo-thumbnail-${index}`}
                    >
                      <img
                        src={src}
                        alt={`Uploaded photo ${index + 1}`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        data-testid={`button-remove-photo-${index}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handlePhotoUpload}
                    className="w-24 h-24 rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:text-[#0ea5e9] hover:bg-sky-50 hover:border-[#0ea5e9] transition-colors flex-shrink-0"
                    data-testid="button-add-more-photos"
                  >
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">Add</span>
                  </button>
                </div>
              </div>
            )}
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
            data-testid="button-save-draft"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Draft
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
    </div>
  );
}
