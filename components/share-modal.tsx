"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FiShare2, FiTrash2, FiX } from "react-icons/fi";

type Peer = { id: string; email: string; display_name: string };
type ShareRow = {
  id: string;
  shared_with_id: string;
  permission: string;
  created_at: string;
  shared_with_email?: string | null;
  shared_with_name?: string | null;
};

export default function ShareModal({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  resourceType: "secret" | "document";
  resourceId: string;
  resourceTitle: string;
  onError: (msg: string | null) => void;
}) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [peerId, setPeerId] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const [usersRes, sharesRes] = await Promise.all([
        fetch("/api/vault-users"),
        fetch(
          `/api/shares?resource_type=${resourceType}&resource_id=${resourceId}`,
        ),
      ]);
      const usersBody = await usersRes.json().catch(() => ({}));
      const sharesBody = await sharesRes.json().catch(() => ({}));
      if (!usersRes.ok) {
        throw new Error(usersBody.error || "Failed to load users");
      }
      if (!sharesRes.ok) {
        throw new Error(sharesBody.error || "Failed to load shares");
      }
      setPeers(usersBody.data || []);
      setShares(sharesBody.data || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load shares");
    } finally {
      setLoading(false);
    }
  }, [onError, resourceId, resourceType]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  async function onShare(e: FormEvent) {
    e.preventDefault();
    if (!peerId) return;
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          shared_with_id: peerId,
          permission,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Share failed");
      setPeerId("");
      setPermission("view");
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Share failed");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(shareId: string) {
    onError(null);
    const res = await fetch(`/api/shares/${shareId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      onError(body.error || "Could not revoke share");
      return;
    }
    await reload();
  }

  if (!open) return null;

  const sharedIds = new Set(shares.map((s) => s.shared_with_id));
  const availablePeers = peers.filter((p) => !sharedIds.has(p.id));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="admin-card-title flex items-center gap-2">
              <FiShare2 className="w-4 h-4 text-[#f16a34]" />
              Share
            </h2>
            <p className="admin-card-subtitle truncate">{resourceTitle}</p>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onShare} className="space-y-3">
          <div>
            <label className="admin-label">Share with Vault user</label>
            <select
              className="admin-input"
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              required
              disabled={loading || availablePeers.length === 0}
            >
              <option value="">
                {availablePeers.length === 0
                  ? "No other Vault users available"
                  : "Select a user…"}
              </option>
              {availablePeers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="admin-label">Permission</label>
            <select
              className="admin-input"
              value={permission}
              onChange={(e) =>
                setPermission(e.target.value === "edit" ? "edit" : "view")
              }
            >
              <option value="view">View (reveal / download)</option>
              <option value="edit">Edit</option>
            </select>
          </div>
          <button
            type="submit"
            className="admin-btn-primary w-full"
            disabled={saving || !peerId}
          >
            {saving ? "Sharing…" : "Share"}
          </button>
        </form>

        <div>
          <p className="admin-label mb-2">Currently shared with</p>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-slate-500">Not shared with anyone yet.</p>
          ) : (
            <ul className="space-y-2">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {s.shared_with_name || s.shared_with_email || "User"}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {s.shared_with_email} · {s.permission}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-btn-danger h-8 px-2 shrink-0"
                    onClick={() => void revoke(s.id)}
                    title="Revoke"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
