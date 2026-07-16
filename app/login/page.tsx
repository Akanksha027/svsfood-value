"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiEye, FiEyeOff, FiMail, FiLock } from "react-icons/fi";
import { createClient } from "@/lib/supabase/browser";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const role = data.user?.app_metadata?.role;
    if (role !== "vault" && role !== "super_admin") {
      await supabase.auth.signOut();
      setError("This account is not enabled for SVS Vault.");
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  const banner =
    error ||
    (queryError === "forbidden"
      ? "This account cannot access SVS Vault."
      : null);

  return (
    <main className="relative min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-[#f16a34]/8 to-transparent blur-[100px] pointer-events-none select-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[#f16a34]/12 to-transparent blur-[120px] pointer-events-none select-none" />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="w-full bg-white/90 backdrop-blur-xl rounded-[28px] p-8 space-y-5 border border-slate-100 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="h-12 w-auto flex items-center justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="SVS Logo"
                className="h-10 w-auto object-contain select-none"
              />
            </div>
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
              SVS Vault
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-[280px] leading-relaxed">
              Store passwords and documents securely. Sign in with credentials
              from the SVS Console.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#f16a34] transition-colors">
                  <FiMail className="w-4 h-4" />
                </div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@svsfood.com"
                  required
                  className="w-full pl-10 pr-4 h-12 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:border-[#f16a34] focus:ring-4 focus:ring-[#f16a34]/10 outline-none transition-all duration-200"
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#f16a34] transition-colors">
                  <FiLock className="w-4 h-4" />
                </div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 h-12 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:border-[#f16a34] focus:ring-4 focus:ring-[#f16a34]/10 outline-none transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#f16a34] focus:outline-none transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <FiEyeOff className="w-4 h-4" />
                  ) : (
                    <FiEye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {banner ? (
              <div className="bg-[#fff5ee] border border-[#ffbe9e]/50 text-[#c05429] text-xs rounded-xl p-3.5 text-center font-medium">
                {banner}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="w-full bg-[#f16a34] hover:bg-[#d95f2e] text-white font-bold rounded-xl active:scale-[0.99] transition-all duration-200 disabled:opacity-60 cursor-pointer h-12 flex items-center justify-center text-sm"
              type="submit"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Sign In to Vault"
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-slate-500 bg-slate-50">
          Loading…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
