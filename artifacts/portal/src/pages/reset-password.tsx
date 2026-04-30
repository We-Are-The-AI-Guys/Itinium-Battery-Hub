import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Eye, EyeOff, Shield, ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useSearch, useLocation } from "wouter";

const schema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetForm = z.infer<typeof schema>;

type PageState = "loading" | "ready" | "error";

export default function ResetPasswordPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";

  const [, navigate] = useLocation();
  const [pageState, setPageState] = useState<PageState>(token ? "loading" : "error");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setPageState("error");
      return;
    }
    fetch(`/api/auth/check-reset-token?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.ok) {
          setPageState("ready");
        } else {
          setPageState("error");
        }
      })
      .catch(() => setPageState("error"));
  }, [token]);

  const form = useForm<ResetForm>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(data: ResetForm) {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: data.newPassword }),
      });
      const body = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) {
        if (res.status === 400 || res.status === 410) {
          setPageState("error");
        } else {
          setErrorMsg(body.message || "Something went wrong. Please try again.");
        }
        return;
      }
      navigate("/login?reset=1");
    } catch {
      setErrorMsg("Unable to connect to the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-[#f8fafc] font-sans items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <img src={itiniumLogo} alt="Itinium Partnership" className="h-12" />
        </div>

        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10">
          {pageState === "error" && (
            <div className="text-center" data-testid="reset-password-expired">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-amber-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-[#1e293b] mb-2">Link expired</h2>
              <p className="text-sm text-[#64748b] mb-6">
                This password reset link has expired or has already been used. Reset links are valid for 1 hour.
              </p>
              <Link href="/forgot-password">
                <Button className="w-full h-12 bg-[#0f2744] hover:bg-[#132744] text-white font-medium" data-testid="button-request-new-link">
                  Request a New Link
                </Button>
              </Link>
            </div>
          )}

          {pageState === "loading" && (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#0ea5e9]" />
            </div>
          )}

          {pageState === "ready" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-[#1e293b] mb-2" data-testid="reset-password-heading">
                  Set new password
                </h2>
                <p className="text-sm text-[#64748b]">
                  Choose a strong password with at least 8 characters.
                </p>
              </div>

              <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-1.5">
                  <label htmlFor="newPassword" className="text-sm font-medium text-[#1e293b]">
                    New Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                    </div>
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-12 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                      data-testid="input-new-password"
                      {...form.register("newPassword")}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {form.formState.errors.newPassword && (
                    <p className="text-sm text-red-500">{form.formState.errors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-[#1e293b]">
                    Confirm Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                    </div>
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-12 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                      data-testid="input-confirm-password"
                      {...form.register("confirmPassword")}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                      onClick={() => setShowConfirm(!showConfirm)}
                    >
                      {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {form.formState.errors.confirmPassword && (
                    <p className="text-sm text-red-500">{form.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                {errorMsg && (
                  <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                    {errorMsg}
                  </p>
                )}

                <div className="pt-1">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-[#0f2744] hover:bg-[#132744] text-white text-base font-medium"
                    data-testid="button-set-password"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Shield className="mr-2 h-5 w-5 opacity-80" />
                    )}
                    {isLoading ? "Saving..." : "Set New Password"}
                  </Button>
                </div>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-[#0ea5e9] hover:text-[#0284c7] transition-colors font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
