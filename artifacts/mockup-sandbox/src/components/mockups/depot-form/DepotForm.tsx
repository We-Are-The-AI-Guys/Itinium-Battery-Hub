import React, { useState } from "react"
import { 
  Package, 
  Hash, 
  Battery, 
  Camera, 
  Upload, 
  ChevronDown, 
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
  Clock 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function DepotForm() {
  const [uploadedPhotos, setUploadedPhotos] = useState<number[]>([1, 2]);

  const removePhoto = (id: number) => {
    setUploadedPhotos(uploadedPhotos.filter(p => p !== id));
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-24 pt-16 flex flex-col items-center">
      
      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 flex items-center justify-between px-4 sm:px-6 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0f2744] rounded flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#0ea5e9]" />
          </div>
          <span className="font-bold tracking-widest text-[#0f2744] text-lg sm:text-xl">ITINIUM</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-slate-700">Depot: Birmingham Central</span>
            <span className="text-xs text-slate-500">Alex J.</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[#0f2744] font-medium text-sm">
            AJ
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6 flex-1 flex flex-col">
        
        {/* Progress/Tonnage Bar */}
        <section className="bg-sky-50 rounded-xl p-4 sm:p-5 border border-sky-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wider mb-1">Current Load</p>
              <h3 className="text-lg sm:text-xl font-bold text-[#0f2744]">7.2t <span className="text-slate-500 text-sm sm:text-base font-normal">/ 10.0t</span></h3>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-sky-700 bg-sky-100 px-2 py-1 rounded">72% Capacity</span>
            </div>
          </div>
          
          <div className="relative h-3 w-full bg-slate-200 rounded-full overflow-hidden mt-3">
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#0ea5e9] to-[#10b981] rounded-full" style={{ width: '72%' }}></div>
            {/* Threshold Marker */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10" style={{ left: '100%', marginLeft: '-2px' }}></div>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-right">Threshold: 10 tonnes</p>
        </section>

        {/* Job Reference Section */}
        <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
              <FileText className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Job Reference</p>
              <p className="font-mono font-bold text-[#0f2744]">JOB-2024-00847</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-slate-500 font-medium">Date</p>
              <p className="text-sm font-medium text-slate-700">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
              <Clock className="w-3.5 h-3.5" />
              Draft
            </span>
          </div>
        </section>

        {/* Section: Asset Details */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden">
          <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-[#0ea5e9]" />
            <h3 className="font-bold text-[#0f2744] text-lg">Asset Details</h3>
          </div>
          
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Pallet Number</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Hash className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input 
                  placeholder="e.g., PLT-001" 
                  className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Asset Number</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clipboard className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input 
                  placeholder="e.g., AST-2024-1234" 
                  className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Battery Serial Number</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Battery className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input 
                  placeholder="e.g., BSN-ABCD-5678" 
                  className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section: Specifications */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden">
          <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[#0ea5e9]" />
            <h3 className="font-bold text-[#0f2744] text-lg">Specifications</h3>
          </div>
          
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Cell Type</label>
              <div className="relative cursor-pointer">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Battery className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex items-center justify-between w-full h-11 px-3 pl-10 py-2 border border-slate-200 rounded-md bg-slate-50 text-slate-500 text-sm hover:border-[#0ea5e9] transition-colors">
                  <span>Select cell type...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Voltage</label>
              <div className="relative cursor-pointer">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Zap className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex items-center justify-between w-full h-11 px-3 pl-10 py-2 border border-slate-200 rounded-md bg-slate-50 text-slate-500 text-sm hover:border-[#0ea5e9] transition-colors">
                  <span>Select voltage...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Weight (kg)</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Scale className="h-4 w-4 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input 
                  type="number"
                  placeholder="e.g., 450" 
                  className="pl-10 h-11 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Condition</label>
              <div className="relative cursor-pointer">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clipboard className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex items-center justify-between w-full h-11 px-3 pl-10 py-2 border border-slate-200 rounded-md bg-slate-50 text-slate-500 text-sm hover:border-[#0ea5e9] transition-colors">
                  <span>Select condition...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Photo Capture */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden">
          <div className="border-l-4 border-[#0ea5e9] bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#0ea5e9]" />
            <h3 className="font-bold text-[#0f2744] text-lg">Photo Capture</h3>
          </div>
          
          <div className="p-5">
            <button type="button" className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-[#0ea5e9] transition-all group outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9] focus-visible:ring-offset-2">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-[#0ea5e9]" />
              </div>
              <p className="text-[#0f2744] font-bold text-lg mb-1">Upload Photo</p>
              <p className="text-[#0ea5e9] text-sm font-medium mb-3 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> AI-assisted data extraction
              </p>
              <p className="text-slate-500 text-xs">Supports JPG, PNG up to 10MB</p>
            </button>

            {/* Thumbnail Row */}
            {uploadedPhotos.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Attached Photos ({uploadedPhotos.length})</p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {uploadedPhotos.map(id => (
                    <div key={id} className="relative w-24 h-24 rounded-lg bg-slate-200 border border-slate-300 flex-shrink-0 group overflow-hidden">
                      <div className="absolute inset-0 bg-slate-300 flex items-center justify-center">
                        <Camera className="w-8 h-8 text-slate-400 opacity-50" />
                      </div>
                      <button 
                        onClick={() => removePhoto(id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button className="w-24 h-24 rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:text-[#0ea5e9] hover:bg-sky-50 hover:border-[#0ea5e9] transition-colors flex-shrink-0">
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">Add</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section: Notes */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden">
          <div className="border-l-4 border-slate-300 bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            <h3 className="font-bold text-[#0f2744] text-lg">Notes <span className="text-slate-400 font-normal text-sm ml-1">(Optional)</span></h3>
          </div>
          
          <div className="p-5">
            <Textarea 
              placeholder="Add any additional notes about this collection..." 
              className="min-h-[120px] bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9] resize-y"
            />
          </div>
        </section>
        
        {/* Spacer for bottom bar */}
        <div className="h-6"></div>
      </main>

      {/* Fixed Footer Bar */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgb(0,0,0,0.05)] z-50 flex items-center justify-between gap-4">
        <div className="w-full max-w-3xl mx-auto flex items-center justify-between gap-4">
          <Button variant="outline" className="flex-1 sm:flex-none border-slate-300 text-slate-600 hover:bg-slate-50 h-12 font-medium">
            <Save className="w-4 h-4 mr-2" />
            Save Draft
          </Button>
          <Button className="flex-1 sm:w-auto h-12 bg-[#0f2744] hover:bg-[#132744] text-white font-medium px-8 shadow-md">
            <Send className="w-4 h-4 mr-2" />
            Submit Collection
          </Button>
        </div>
      </footer>
    </div>
  )
}
