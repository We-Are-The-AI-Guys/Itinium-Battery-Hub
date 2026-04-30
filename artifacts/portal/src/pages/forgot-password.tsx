import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Shield, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotForm = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ForgotForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(data: ForgotForm) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { message?: string }).message || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Unable to connect to the server. Please try again.");
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
          {submitted ? (
            <div className="text-center" data-testid="forgot-password-success">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-[#1e293b] mb-2">Check your email</h2>
              <p className="text-sm text-[#64748b] mb-6">
                If that email address is registered, we've sent a password reset link. It expires in 1 hour.
              </p>
              <p className="text-xs text-[#94a3b8] mb-6">
                Didn't receive it? Check your spam folder, or request another link below.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSubmitted(false)}
              >
                Send another link
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-[#1e293b] mb-2" data-testid="forgot-password-heading">
                  Forgot your password?
                </h2>
                <p className="text-sm text-[#64748b]">
                  Enter your email address and we'll send you a reset link.
                </p>
              </div>

              <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-[#1e293b]">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-[#0ea5e9] transition-colors" />
                    </div>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      className="pl-10 h-12 bg-slate-50 border-slate-200 text-[#1e293b] focus-visible:ring-[#0ea5e9] focus-visible:border-[#0ea5e9]"
                      data-testid="input-forgot-email"
                      {...form.register("email")}
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                    {error}
                  </p>
                )}

                <div className="pt-1">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-[#0f2744] hover:bg-[#132744] text-white text-base font-medium"
                    data-testid="button-send-reset"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Shield className="mr-2 h-5 w-5 opacity-80" />
                    )}
                    {isLoading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </div>
              </form>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-[#0ea5e9] hover:text-[#0284c7] transition-colors font-medium"
              data-testid="link-back-to-login"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
