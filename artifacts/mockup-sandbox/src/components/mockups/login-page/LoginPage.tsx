import React, { useState } from "react"
import { Mail, Lock, Eye, EyeOff, Shield, ChevronRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="min-h-screen w-full flex bg-[#f8fafc] font-sans">
      {/* Left Panel - Hero Branding (Hidden on mobile, ~55% width on desktop) */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#132744] to-[#1a3a5c] text-white flex-col justify-between p-12 lg:p-16 xl:p-24">
        
        {/* Abstract Background Patterns */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full" 
               style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '32px 32px' }}>
          </div>
          <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full border-[1px] border-white/10 blur-[2px]"></div>
          <div className="absolute top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full border-[1px] border-white/5 blur-[1px]"></div>
          <div className="absolute bottom-[10%] right-[10%] w-64 h-64 border border-[#0ea5e9]/20 rounded-full mix-blend-overlay"></div>
          
          {/* Diagonal lines */}
          <svg className="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="diagonal-lines" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="40" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#diagonal-lines)" />
          </svg>
        </div>

        {/* Top Header / Logo Area */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-gradient-to-br from-[#0ea5e9] to-[#0284c7] rounded-md flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold tracking-[0.2em] text-white">
              ITINIUM
            </h1>
          </div>
          
          <div className="space-y-6 max-w-xl">
            <h2 className="text-4xl xl:text-5xl font-semibold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">
              Battery Collection Portal
            </h2>
            <p className="text-lg text-slate-300 font-light leading-relaxed">
              Securely manage your corporate battery recycling operations, track logistics, and generate compliance reports from a centralized dashboard.
            </p>
          </div>
          
          <div className="mt-12 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-slate-300">
              <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
              <span>Real-time logistics tracking</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
              <span>Automated compliance documentation</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
              <span>Secure role-based access control</span>
            </div>
          </div>
        </div>

        {/* Bottom Trust Indicators */}
        <div className="relative z-10 mt-auto pt-16 border-t border-white/10">
          <p className="text-sm text-slate-400 uppercase tracking-wider font-semibold mb-6">
            Trusted by leading UK recycling operations
          </p>
          <div className="flex gap-8 opacity-60 grayscale">
            {/* Placeholder logos using basic shapes */}
            <div className="flex items-center gap-2 font-bold text-xl"><div className="w-6 h-6 rounded-full bg-white"></div>EcoRecycle</div>
            <div className="flex items-center gap-2 font-bold text-xl"><div className="w-6 h-6 rounded bg-white"></div>BritBatt</div>
            <div className="flex items-center gap-2 font-bold text-xl"><div className="w-0 h-0 border-l-[12px] border-r-[12px] border-b-[20px] border-l-transparent border-r-transparent border-b-white"></div>EnviroLogix</div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form (~45% width on desktop, 100% on mobile) */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 relative overflow-hidden">
        
        {/* Mobile Header (Hidden on desktop) */}
        <div className="lg:hidden absolute top-8 left-8 flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0f2744] rounded flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#0ea5e9]" />
          </div>
          <span className="font-bold tracking-widest text-[#0f2744] text-xl">ITINIUM</span>
        </div>

        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#1e293b] mb-2">Welcome Back</h2>
            <p className="text-[#64748b] text-sm">Sign in to your account to continue</p>
          </div>

          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#1e293b]">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input 
                  type="email" 
                  placeholder="name@company.com" 
                  className="pl-10 h-12 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#1e293b]">Password</label>
                <a href="#" className="text-sm font-medium text-[#0ea5e9] hover:text-[#0284c7] transition-colors">
                  Forgot Password?
                </a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="pl-10 pr-10 h-12 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                />
                <button 
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button 
                className="w-full h-12 bg-[#0f2744] hover:bg-[#132744] text-white text-base font-medium transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                <Shield className="mr-2 h-5 w-5 opacity-80" />
                Secure Login
              </Button>
            </div>
            
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#64748b] bg-slate-50 py-3 rounded-lg border border-slate-100">
              <Shield className="h-3.5 w-3.5 text-[#10b981]" />
              <span>Optional 2FA verification via email enabled</span>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-[#64748b]">
              Need an account?{' '}
              <a href="#" className="font-medium text-[#0ea5e9] hover:text-[#0284c7] inline-flex items-center transition-colors">
                Contact your administrator
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </a>
            </p>
          </div>
        </div>
        
        {/* Simple Footer Links */}
        <div className="absolute bottom-6 flex gap-6 text-sm text-[#64748b]">
          <a href="#" className="hover:text-[#1e293b] transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-[#1e293b] transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  )
}
