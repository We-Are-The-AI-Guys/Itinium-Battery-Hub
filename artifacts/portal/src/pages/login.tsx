import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock, Eye, EyeOff, Shield, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearch } from "wouter";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const search = useSearch();
  const wasReset = new URLSearchParams(search).get("reset") === "1";
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  async function onSubmit(data: LoginForm) {
    setIsLoading(true);
    setRateLimitError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const body = await res.json();
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const fallback = retryAfterHeader
          ? `Too many failed login attempts — please try again in ${retryAfterHeader} minute${retryAfterHeader === "1" ? "" : "s"}.`
          : "Too many login attempts — please try again later.";
        setRateLimitError(body.message || fallback);
        return;
      }
      if (!res.ok) {
        toast({ title: "Login failed", description: body.message || "Invalid credentials", variant: "destructive" });
        return;
      }
      window.location.href = import.meta.env.BASE_URL;
    } catch {
      toast({ title: "Error", description: "Unable to connect to the server", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-[#f8fafc] font-sans">
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#132744] to-[#1a3a5c] text-white flex-col justify-between p-12 lg:p-16 xl:p-24">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full"
               style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
          <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full border border-white/10 blur-[2px]" />
          <div className="absolute top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full border border-white/5 blur-[1px]" />
          <div className="absolute bottom-[10%] right-[10%] w-64 h-64 border border-[#0ea5e9]/20 rounded-full mix-blend-overlay" />
          <svg className="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="diagonal-lines" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="40" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#diagonal-lines)" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <img
              src={itiniumLogo}
              alt="Itinium Partnership"
              className="h-16"
              style={{ filter: "brightness(0) invert(1)" }}
            />
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

      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 relative overflow-hidden">
        <div className="lg:hidden absolute top-8 left-8 flex items-center gap-2">
          <img
            src={itiniumLogo}
            alt="Itinium Partnership"
            className="h-10"
          />
        </div>

        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10">
          {wasReset && (
            <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3" data-testid="banner-password-reset">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-green-700 font-medium">Password updated — please sign in with your new password.</p>
            </div>
          )}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#1e293b] mb-2" data-testid="text-login-heading">Welcome Back</h2>
            <p className="text-[#64748b] text-sm">Sign in to your account to continue</p>
          </div>

          {rateLimitError && (
            <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3" data-testid="banner-rate-limit">
              <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 font-medium">{rateLimitError}</p>
            </div>
          )}

          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-[#1e293b]">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  className="pl-10 h-12 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                  data-testid="input-email"
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email && (
                <p className="text-sm text-red-500" data-testid="text-email-error">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-[#1e293b]">Password</label>
                <Link href="/forgot-password" className="text-sm font-medium text-[#0ea5e9] hover:text-[#0284c7] transition-colors" data-testid="link-forgot-password">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                </div>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-10 pr-10 h-12 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                  data-testid="input-password"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-sm text-red-500" data-testid="text-password-error">{form.formState.errors.password.message}</p>
              )}
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-[#0f2744] hover:bg-[#132744] text-white text-base font-medium transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                data-testid="button-login"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Shield className="mr-2 h-5 w-5 opacity-80" />
                )}
                {isLoading ? "Signing in..." : "Secure Login"}
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
              <a href="#" className="font-medium text-[#0ea5e9] hover:text-[#0284c7] inline-flex items-center transition-colors" data-testid="link-contact-admin">
                Contact your administrator
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </a>
            </p>
          </div>
        </div>

        <div className="absolute bottom-6 flex gap-6 text-sm text-[#64748b]">
          <a href="#" className="hover:text-[#1e293b] transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-[#1e293b] transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}