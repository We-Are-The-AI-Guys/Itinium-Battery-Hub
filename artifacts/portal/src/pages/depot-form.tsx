import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Package,
  Hash,
  Battery,
  Camera,
  Upload,
  Save,
  Send,
  Shield,
  FileText,
  Clipboard,
  Scale,
  Zap,
  X,
  Plus,
  AlertCircle,
  Clock,
  ChevronLeft,
  LogOut,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

const depotFormSchema = z.object({
  palletNumber: z.string().min(1, "Pallet number is required"),
  assetNumber: z.string().min(1, "Asset number is required"),
  batterySerial: z.string().min(1, "Battery serial number is required"),
  cellType: z.string().min(1, "Cell type is required"),
  voltage: z.string().min(1, "Voltage is required"),
  weight: z.string().min(1, "Weight is required"),
  condition: z.string().min(1, "Condition is required"),
  notes: z.string().optional(),
});

type DepotFormValues = z.infer<typeof depotFormSchema>;

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
}

export default function DepotFormPage() {
  const [user, setUser] = useState<User | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<DepotFormValues>({
    resolver: zodResolver(depotFormSchema),
    defaultValues: {
      palletNumber: "",
      assetNumber: "",
      batterySerial: "",
      cellType: "",
      voltage: "",
      weight: "",
      condition: "",
      notes: "",
    },
  });

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

  function onSubmit(data: DepotFormValues) {
    toast({
      title: "Collection submitted",
      description: `Job submitted with ${uploadedPhotos.length} photo(s) attached.`,
    });
    console.log("Form data:", data);
  }

  function onSaveDraft() {
    const values = form.getValues();
    toast({
      title: "Draft saved",
      description: "Your collection draft has been saved.",
    });
    console.log("Draft saved:", values);
  }

  const currentLoad = 7.2;
  const maxCapacity = 10.0;
  const progressPercent = Math.round((currentLoad / maxCapacity) * 100);
  const jobRef = `JOB-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

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
          <div className="w-8 h-8 bg-[#0f2744] rounded flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#0ea5e9]" />
          </div>
          <span className="font-bold tracking-widest text-[#0f2744] text-lg sm:text-xl">
            ITINIUM
          </span>
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
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase() || ".."}
          </div>
        </div>
      </header>

      <main className="w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6 flex-1 flex flex-col">
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
                {currentLoad}t{" "}
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
          className="bg-white rounded-xl p-5 border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-wrap gap-4 items-center justify-between"
          data-testid="section-job-reference"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
              <FileText className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">
                Job Reference
              </p>
              <p
                className="font-mono font-bold text-[#0f2744]"
                data-testid="text-job-reference"
              >
                {jobRef}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-slate-500 font-medium">Date</p>
              <p className="text-sm font-medium text-slate-700">
                {new Date().toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"
              data-testid="badge-status-draft"
            >
              <Clock className="w-3.5 h-3.5" />
              Draft
            </span>
          </div>
        </section>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <section
            className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden"
            data-testid="section-asset-details"
          >
            <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="font-bold text-[#0f2744] text-lg">
                Asset Details
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">
                  Pallet Number
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Hash className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                  </div>
                  <Input
                    placeholder="e.g., PLT-001"
                    className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                    data-testid="input-pallet-number"
                    {...form.register("palletNumber")}
                  />
                </div>
                {form.formState.errors.palletNumber && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.palletNumber.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">
                  Asset Number
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Clipboard className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                  </div>
                  <Input
                    placeholder="e.g., AST-2024-1234"
                    className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                    data-testid="input-asset-number"
                    {...form.register("assetNumber")}
                  />
                </div>
                {form.formState.errors.assetNumber && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.assetNumber.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">
                  Battery Serial Number
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Battery className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                  </div>
                  <Input
                    placeholder="e.g., BSN-ABCD-5678"
                    className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                    data-testid="input-battery-serial"
                    {...form.register("batterySerial")}
                  />
                </div>
                {form.formState.errors.batterySerial && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.batterySerial.message}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section
            className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden"
            data-testid="section-specifications"
          >
            <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="font-bold text-[#0f2744] text-lg">
                Specifications
              </h3>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">
                  Cell Type
                </label>
                <Select
                  onValueChange={(val) => form.setValue("cellType", val, { shouldValidate: true })}
                >
                  <SelectTrigger
                    className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus:ring-[#0ea5e9]"
                    data-testid="select-cell-type"
                  >
                    <div className="flex items-center gap-2">
                      <Battery className="h-4 w-4 text-slate-400" />
                      <SelectValue placeholder="Select cell type..." />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead_acid">Lead Acid</SelectItem>
                    <SelectItem value="lithium_ion">Lithium Ion</SelectItem>
                    <SelectItem value="nickel_cadmium">
                      Nickel Cadmium
                    </SelectItem>
                    <SelectItem value="nickel_metal_hydride">
                      Nickel Metal Hydride
                    </SelectItem>
                    <SelectItem value="alkaline">Alkaline</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.cellType && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.cellType.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">
                  Voltage
                </label>
                <Select
                  onValueChange={(val) => form.setValue("voltage", val, { shouldValidate: true })}
                >
                  <SelectTrigger
                    className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus:ring-[#0ea5e9]"
                    data-testid="select-voltage"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-slate-400" />
                      <SelectValue placeholder="Select voltage..." />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6v">6V</SelectItem>
                    <SelectItem value="12v">12V</SelectItem>
                    <SelectItem value="24v">24V</SelectItem>
                    <SelectItem value="36v">36V</SelectItem>
                    <SelectItem value="48v">48V</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.voltage && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.voltage.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">
                  Weight (kg)
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Scale className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                  </div>
                  <Input
                    type="number"
                    placeholder="e.g., 450"
                    className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                    data-testid="input-weight"
                    {...form.register("weight")}
                  />
                </div>
                {form.formState.errors.weight && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.weight.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#1e293b]">
                  Condition
                </label>
                <Select
                  onValueChange={(val) => form.setValue("condition", val, { shouldValidate: true })}
                >
                  <SelectTrigger
                    className="h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus:ring-[#0ea5e9]"
                    data-testid="select-condition"
                  >
                    <div className="flex items-center gap-2">
                      <Clipboard className="h-4 w-4 text-slate-400" />
                      <SelectValue placeholder="Select condition..." />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="leaking">Leaking</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.condition && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.condition.message}
                  </p>
                )}
              </div>
            </div>
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
                {...form.register("notes")}
              />
            </div>
          </section>

          <div className="h-6" />
        </form>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgb(0,0,0,0.05)] z-50 flex items-center justify-between gap-4">
        <div className="w-full max-w-3xl mx-auto flex items-center justify-between gap-4">
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
            onClick={form.handleSubmit(onSubmit)}
            data-testid="button-submit-collection"
          >
            <Send className="w-4 h-4 mr-2" />
            Submit Collection
          </Button>
        </div>
      </footer>
    </div>
  );
}