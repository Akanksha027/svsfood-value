"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";

type AuditRow = {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_title: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    reveal: "Revealed password",
    copy: "Copied",
    download: "Downloaded",
    share: "Shared",
    unshare: "Unshared",
    login: "Signed in",
  };
  return map[action] || action;
}

function actionTone(action: string) {
  if (action === "delete" || action === "unshare") {
    return "bg-rose-50 text-rose-700 border-rose-100";
  }
  if (action === "reveal" || action === "copy" || action === "download") {
    return "bg-amber-50 text-amber-800 border-amber-100";
  }
  if (action === "share") {
    return "bg-violet-50 text-violet-700 border-violet-100";
  }
  return "bg-slate-50 text-slate-700 border-slate-100";
}

export default function AuditClient() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (actionFilter) params.set("action", actionFilter);
      if (typeFilter) params.set("resource_type", typeFilter);
      const res = await fetch(`/api/audit?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load audit log");
      setRows(body.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle = useMemo(
    () =>
      "Your actions plus activity on items you own (reveals, downloads, shares).",
    [],
  );

  return (
    <div className="admin-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Audit log
          </h1>
          <p className="admin-card-subtitle mt-0.5">{subtitle}</p>
        </div>
        <button
          type="button"
          className="admin-btn-secondary"
          onClick={() => void load()}
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="admin-card space-y-4">
        <div className="flex flex-wrap gap-2">
          <select
            className="admin-input w-auto min-w-[140px]"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="reveal">Reveal</option>
            <option value="copy">Copy</option>
            <option value="download">Download</option>
            <option value="share">Share</option>
            <option value="unshare">Unshare</option>
          </select>
          <select
            className="admin-input w-auto min-w-[140px]"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            <option value="secret">Passwords</option>
            <option value="document">Documents</option>
            <option value="folder">Folders</option>
          </select>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            No audit events yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const meta = row.metadata || {};
              const sharedWith =
                typeof meta.shared_with_email === "string"
                  ? meta.shared_with_email
                  : null;
              return (
                <li key={row.id} className="py-3 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold border ${actionTone(row.action)}`}
                    >
                      {actionLabel(row.action)}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {row.resource_type}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {formatWhen(row.created_at)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    {row.resource_title || row.resource_id || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    By {row.actor_email || row.actor_id}
                    {sharedWith ? ` → ${sharedWith}` : ""}
                    {typeof meta.permission === "string"
                      ? ` (${meta.permission})`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
