"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FiHome, FiKey, FiFileText, FiActivity, FiLogOut } from "react-icons/fi";
import { createClient } from "@/lib/supabase/browser";

const NAV = [
  { href: "/", label: "Overview", icon: FiHome },
  { href: "/passwords", label: "Passwords", icon: FiKey },
  { href: "/documents", label: "Documents", icon: FiFileText },
  { href: "/audit", label: "Audit log", icon: FiActivity },
];

export default function VaultShell({
  children,
  email,
  displayName,
}: {
  children: React.ReactNode;
  email: string;
  displayName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="dash-root flex-1 flex flex-col">
      <aside
        className="dash-sidebar fixed top-0 left-0 z-50 hidden lg:flex flex-col h-screen"
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="h-14 px-4 flex items-center border-b border-slate-100 shrink-0">
          <span className="text-sm font-extrabold tracking-wide text-slate-800">
            SVS Vault
          </span>
        </div>
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dash-nav-link flex items-center gap-2.5 h-[34px] px-3 rounded-lg text-[13px] font-medium ${
                  active ? "is-active" : ""
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <div className="px-2 mb-2 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">
              {displayName}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <FiLogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="dash-content flex flex-col flex-1 min-h-0">
        <header className="dash-header sticky top-0 z-40 h-14 flex items-center px-4 sm:px-6 gap-3">
          <div className="lg:hidden font-extrabold text-sm text-slate-800">
            SVS Vault
          </div>
          <div className="lg:hidden flex items-center gap-1 ml-auto">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                    active
                      ? "bg-[#fff5ee] text-[#f16a34]"
                      : "text-slate-600 bg-white border border-slate-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </header>
        <main className="dash-main flex-1 p-4 sm:p-6 lg:p-8 w-full min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
