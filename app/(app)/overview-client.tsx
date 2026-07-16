"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  FiClock,
  FiExternalLink,
  FiFileText,
  FiKey,
  FiStar,
} from "react-icons/fi";

type SecretCard = {
  id: string;
  title: string;
  username: string | null;
  url: string | null;
  is_favorite?: boolean;
  last_accessed_at?: string | null;
  updated_at: string;
  access?: string;
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "Never opened";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function SecretList({
  items,
  empty,
  showAccessed,
}: {
  items: SecretCard[];
  empty: string;
  showAccessed?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 py-4 text-center">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((row) => (
        <li key={row.id}>
          <Link
            href={`/passwords`}
            className="flex items-center gap-3 py-3 hover:bg-slate-50/80 -mx-1 px-1 rounded-lg transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-[#fff5ee] text-[#f16a34] flex items-center justify-center shrink-0 border border-[#ffdccc]">
              {row.is_favorite ? (
                <FiStar className="w-4 h-4 fill-current" />
              ) : (
                <FiKey className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-800 text-sm truncate">
                {row.title}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {row.access === "shared" ? "Shared · " : ""}
                {row.username || "—"}
                {showAccessed
                  ? ` · ${formatWhen(row.last_accessed_at || row.updated_at)}`
                  : ""}
              </p>
            </div>
            {row.url ? (
              <FiExternalLink className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function OverviewClient() {
  const [favorites, setFavorites] = useState<SecretCard[]>([]);
  const [recent, setRecent] = useState<SecretCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/overview");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load overview");
      setFavorites(body.data?.favorites || []);
      setRecent(body.data?.recent || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-page">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Overview
        </h1>
        <p className="admin-card-subtitle mt-0.5">
          Favorites and recently opened passwords.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Link
          href="/passwords"
          className="admin-card flex items-center gap-3 hover:border-[#ffdccc] transition-colors no-underline"
        >
          <div className="w-10 h-10 rounded-xl bg-[#fff5ee] text-[#f16a34] flex items-center justify-center border border-[#ffdccc]">
            <FiKey className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">Passwords</p>
            <p className="text-xs text-slate-500">Manage credentials</p>
          </div>
        </Link>
        <Link
          href="/documents"
          className="admin-card flex items-center gap-3 hover:border-[#ffdccc] transition-colors no-underline"
        >
          <div className="w-10 h-10 rounded-xl bg-[#fff5ee] text-[#f16a34] flex items-center justify-center border border-[#ffdccc]">
            <FiFileText className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">Documents</p>
            <p className="text-xs text-slate-500">Files & uploads</p>
          </div>
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="admin-card space-y-2">
            <div className="flex items-center gap-2">
              <FiStar className="w-4 h-4 text-[#f16a34]" />
              <h2 className="admin-card-title m-0">Favorites</h2>
            </div>
            <p className="admin-card-subtitle mt-0">
              Star passwords from the list to pin them here.
            </p>
            <SecretList
              items={favorites}
              empty="No favorites yet. Star a password to see it here."
            />
          </div>
          <div className="admin-card space-y-2">
            <div className="flex items-center gap-2">
              <FiClock className="w-4 h-4 text-[#f16a34]" />
              <h2 className="admin-card-title m-0">Recent</h2>
            </div>
            <p className="admin-card-subtitle mt-0">
              Last revealed or copied passwords.
            </p>
            <SecretList
              items={recent}
              empty="Nothing recent yet. Reveal or copy a password to populate this."
              showAccessed
            />
          </div>
        </div>
      )}
    </div>
  );
}
