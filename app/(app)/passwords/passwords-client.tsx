"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiCopy,
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiPlus,
  FiSearch,
  FiShare2,
  FiStar,
  FiTrash2,
  FiExternalLink,
} from "react-icons/fi";
import {
  FolderRail,
  FolderSelect,
  type FolderFilter,
  useVaultFolders,
} from "@/components/folder-rail";
import ShareModal from "@/components/share-modal";
import PasswordGenerator from "@/components/password-generator";
import { PASSWORD_REVEAL_SECONDS } from "@/lib/reveal";

type SecretRow = {
  id: string;
  folder_id: string | null;
  title: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  tags: string[];
  is_favorite?: boolean;
  last_accessed_at?: string | null;
  created_at: string;
  updated_at: string;
  access?: "owner" | "shared";
  permission?: string;
  can_edit?: boolean;
};

type FormState = {
  title: string;
  username: string;
  url: string;
  password: string;
  notes: string;
  tags: string;
  folder_id: string;
};

const emptyForm: FormState = {
  title: "",
  username: "",
  url: "",
  password: "",
  notes: "",
  tags: "",
  folder_id: "",
};

export default function PasswordsClient({ viewOnly }: { viewOnly: boolean }) {
  const [items, setItems] = useState<SecretRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealCountdown, setRevealCountdown] = useState<Record<string, number>>(
    {},
  );
  const [copiedFlash, setCopiedFlash] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [shareTarget, setShareTarget] = useState<SecretRow | null>(null);
  const hideTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const tickTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );
  const {
    folders,
    reload: reloadFolders,
    error: foldersError,
  } = useVaultFolders();

  const clearRevealTimers = useCallback((id: string) => {
    const hide = hideTimers.current.get(id);
    if (hide) {
      clearTimeout(hide);
      hideTimers.current.delete(id);
    }
    const tick = tickTimers.current.get(id);
    if (tick) {
      clearInterval(tick);
      tickTimers.current.delete(id);
    }
  }, []);

  const hidePassword = useCallback(
    (id: string) => {
      clearRevealTimers(id);
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRevealCountdown((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [clearRevealTimers],
  );

  const startAutoHide = useCallback(
    (id: string) => {
      clearRevealTimers(id);
      setRevealCountdown((prev) => ({
        ...prev,
        [id]: PASSWORD_REVEAL_SECONDS,
      }));
      const tick = setInterval(() => {
        setRevealCountdown((prev) => {
          const left = (prev[id] ?? 1) - 1;
          if (left <= 0) {
            return prev;
          }
          return { ...prev, [id]: left };
        });
      }, 1000);
      tickTimers.current.set(id, tick);
      const hide = setTimeout(() => {
        hidePassword(id);
      }, PASSWORD_REVEAL_SECONDS * 1000);
      hideTimers.current.set(id, hide);
    },
    [clearRevealTimers, hidePassword],
  );

  useEffect(() => {
    return () => {
      hideTimers.current.forEach((t) => clearTimeout(t));
      tickTimers.current.forEach((t) => clearInterval(t));
      hideTimers.current.clear();
      tickTimers.current.clear();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        folderFilter === "all"
          ? ""
          : folderFilter === "unfiled"
            ? "?folder_id=unfiled"
            : folderFilter === "shared"
              ? "?folder_id=shared"
              : `?folder_id=${encodeURIComponent(folderFilter)}`;
      const res = await fetch(`/api/passwords${qs}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load passwords");
      setItems(body.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [folderFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const folderName =
        folders.find((f) => f.id === item.folder_id)?.name || "";
      const hay = [
        item.title,
        item.username,
        item.url,
        item.notes,
        folderName,
        ...(item.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, folders]);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      folder_id:
        folderFilter !== "all" &&
        folderFilter !== "unfiled" &&
        folderFilter !== "shared"
          ? folderFilter
          : "",
    });
    setShowPw(false);
    setModalOpen(true);
  }

  async function openEdit(row: SecretRow) {
    setEditingId(row.id);
    setShowPw(false);
    setForm({
      title: row.title,
      username: row.username || "",
      url: row.url || "",
      password: "",
      notes: row.notes || "",
      tags: (row.tags || []).join(", "),
      folder_id: row.folder_id || "",
    });
    setModalOpen(true);
    try {
      const res = await fetch(`/api/passwords/${row.id}?intent=edit`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.data?.password) {
        setForm((prev) => ({
          ...prev,
          password: body.data.password,
          folder_id: body.data.folder_id || "",
        }));
      }
    } catch {
      /* keep empty password field */
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (viewOnly) return;
    setSaving(true);
    setError(null);
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      title: form.title.trim(),
      username: form.username.trim() || null,
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
      tags,
      folder_id: form.folder_id || null,
      ...(form.password ? { password: form.password } : {}),
    };

    try {
      const res = await fetch(
        editingId ? `/api/passwords/${editingId}` : "/api/passwords",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingId
              ? payload
              : { ...payload, password: form.password || "" },
          ),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");
      setModalOpen(false);
      setRevealed({});
      setRevealCountdown({});
      hideTimers.current.forEach((t) => clearTimeout(t));
      tickTimers.current.forEach((t) => clearInterval(t));
      hideTimers.current.clear();
      tickTimers.current.clear();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function reveal(id: string) {
    if (revealed[id]) {
      hidePassword(id);
      return;
    }
    const res = await fetch(`/api/passwords/${id}?intent=reveal`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Could not reveal password");
      return;
    }
    setRevealed((prev) => ({ ...prev, [id]: body.data.password }));
    startAutoHide(id);
  }

  async function copyUsername(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Clipboard not available");
    }
  }

  async function copyPassword(row: SecretRow, source: "revealed" | "blind") {
    try {
      let password = revealed[row.id];
      if (source === "blind" || !password) {
        const res = await fetch(`/api/passwords/${row.id}?intent=copy`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || "Could not copy password");
          return;
        }
        password = body.data.password;
      } else {
        void fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "copy",
            resource_type: "secret",
            resource_id: row.id,
            resource_title: row.title,
          }),
        });
      }
      await navigator.clipboard.writeText(password);
      setCopiedFlash(row.id);
      window.setTimeout(() => {
        setCopiedFlash((cur) => (cur === row.id ? null : cur));
      }, 1500);
    } catch {
      setError("Clipboard not available");
    }
  }

  async function toggleFavorite(row: SecretRow) {
    if (viewOnly || row.access === "shared") return;
    const next = !row.is_favorite;
    setItems((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_favorite: next } : r)),
    );
    const res = await fetch(`/api/passwords/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: next }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setItems((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, is_favorite: row.is_favorite } : r,
        ),
      );
      setError(body.error || "Could not update favorite");
    }
  }

  async function remove(id: string, title: string) {
    if (viewOnly) return;
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    const res = await fetch(`/api/passwords/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Delete failed");
      return;
    }
    hidePassword(id);
    await load();
  }

  return (
    <div className="admin-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Passwords
          </h1>
          <p className="admin-card-subtitle mt-0.5">
            Reveal auto-hides after {PASSWORD_REVEAL_SECONDS}s. Use copy to
            clipboard without showing the password.
          </p>
        </div>
        {!viewOnly ? (
          <button type="button" className="admin-btn-primary" onClick={openCreate}>
            <FiPlus className="w-4 h-4" />
            Add password
          </button>
        ) : null}
      </div>

      <div className="admin-card space-y-4">
        <FolderRail
          folders={folders}
          filter={folderFilter}
          onFilterChange={setFolderFilter}
          viewOnly={viewOnly}
          onChanged={() => void reloadFolders()}
          onError={setError}
        />

        <div className="admin-search">
          <FiSearch className="admin-search-icon" aria-hidden />
          <input
            className="admin-input"
            placeholder="Search title, username, URL, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error || foldersError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">
            {error || foldersError}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            {items.length === 0
              ? "No passwords yet. Add your first credential."
              : "No matches for that search."}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-3 font-bold">Title</th>
                  <th className="pb-2 pr-3 font-bold">Username</th>
                  <th className="pb-2 pr-3 font-bold">Password</th>
                  <th className="pb-2 pr-3 font-bold">URL</th>
                  <th className="pb-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 last:border-0 align-middle"
                  >
                    <td className="py-3 pr-3">
                      <div className="flex items-start gap-2">
                        {row.access !== "shared" ? (
                          <button
                            type="button"
                            className={`mt-0.5 shrink-0 ${
                              row.is_favorite
                                ? "text-[#f16a34]"
                                : "text-slate-300 hover:text-[#f16a34]"
                            }`}
                            onClick={() => void toggleFavorite(row)}
                            title={
                              row.is_favorite
                                ? "Remove favorite"
                                : "Add to favorites"
                            }
                            disabled={viewOnly}
                          >
                            <FiStar
                              className={`w-4 h-4 ${row.is_favorite ? "fill-current" : ""}`}
                            />
                          </button>
                        ) : null}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800">{row.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {row.access === "shared" ? (
                              <span className="text-violet-600 font-semibold">
                                Shared ·{" "}
                              </span>
                            ) : null}
                            {folders.find((f) => f.id === row.folder_id)?.name ||
                              (row.access === "shared" ? "—" : "Unfiled")}
                            {row.tags?.length
                              ? ` · ${row.tags.join(" · ")}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[140px]">
                          {row.username || "—"}
                        </span>
                        {row.username ? (
                          <button
                            type="button"
                            className="text-slate-400 hover:text-[#f16a34]"
                            onClick={() => void copyUsername(row.username!)}
                            title="Copy username"
                          >
                            <FiCopy className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="text-slate-700 min-w-[5.5rem]">
                          {revealed[row.id] || "••••••••"}
                          {revealed[row.id] && revealCountdown[row.id] != null ? (
                            <span className="ml-1.5 text-[10px] font-sans font-bold text-amber-600">
                              {revealCountdown[row.id]}s
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-[#f16a34]"
                          onClick={() => void reveal(row.id)}
                          title={
                            revealed[row.id]
                              ? "Hide now"
                              : `Reveal (${PASSWORD_REVEAL_SECONDS}s)`
                          }
                        >
                          {revealed[row.id] ? (
                            <FiEyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <FiEye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            copiedFlash === row.id
                              ? "text-emerald-600"
                              : "text-slate-400 hover:text-[#f16a34]"
                          }`}
                          onClick={() =>
                            void copyPassword(
                              row,
                              revealed[row.id] ? "revealed" : "blind",
                            )
                          }
                          title={
                            revealed[row.id]
                              ? "Copy password"
                              : "Copy without revealing"
                          }
                        >
                          {copiedFlash === row.id ? (
                            <span>Copied</span>
                          ) : (
                            <FiCopy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      {row.url ? (
                        <a
                          href={row.url.startsWith("http") ? row.url : `https://${row.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#f16a34] hover:underline truncate max-w-[160px]"
                        >
                          <span className="truncate">{row.url}</span>
                          <FiExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {row.access !== "shared" && !viewOnly ? (
                          <button
                            type="button"
                            className="admin-btn-secondary h-8 px-2"
                            onClick={() => setShareTarget(row)}
                            title="Share"
                          >
                            <FiShare2 className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                        {row.can_edit !== false && !viewOnly ? (
                          <button
                            type="button"
                            className="admin-btn-secondary h-8 px-2"
                            onClick={() => void openEdit(row)}
                            title="Edit"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                        {row.access !== "shared" && !viewOnly ? (
                          <button
                            type="button"
                            className="admin-btn-danger h-8 px-2"
                            onClick={() => void remove(row.id, row.title)}
                            title="Delete"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="admin-card-title">
                  {editingId ? "Edit password" : "Add password"}
                </h2>
                <p className="admin-card-subtitle">
                  Passwords are encrypted at rest on the server.
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 text-sm font-semibold"
                onClick={() => setModalOpen(false)}
              >
                Close
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="admin-label">Title</label>
                <input
                  className="admin-input"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="e.g. Petpooja admin"
                />
              </div>
              <FolderSelect
                folders={folders}
                value={form.folder_id}
                onChange={(folder_id) =>
                  setForm((p) => ({ ...p, folder_id }))
                }
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="admin-label">Username</label>
                  <input
                    className="admin-input"
                    value={form.username}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, username: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="admin-label">URL</label>
                  <input
                    className="admin-input"
                    value={form.url}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, url: e.target.value }))
                    }
                    placeholder="https://"
                  />
                </div>
              </div>
              <div>
                <label className="admin-label">
                  Password{editingId ? " (leave blank to keep)" : ""}
                </label>
                <div className="relative">
                  <input
                    className="admin-input pr-10"
                    type={showPw ? "text" : "password"}
                    required={!editingId}
                    value={form.password}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? (
                      <FiEyeOff className="w-4 h-4" />
                    ) : (
                      <FiEye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div>
                  <PasswordGenerator
                    onUse={(password) => {
                      setForm((p) => ({ ...p, password }));
                      setShowPw(true);
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="admin-label">Tags (comma-separated)</label>
                <input
                  className="admin-input"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, tags: e.target.value }))
                  }
                  placeholder="finance, vendor"
                />
              </div>
              <div>
                <label className="admin-label">Notes</label>
                <textarea
                  className="admin-input h-24 py-2 resize-y"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, notes: e.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn-primary"
                  disabled={saving}
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ShareModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        resourceType="secret"
        resourceId={shareTarget?.id || ""}
        resourceTitle={shareTarget?.title || ""}
        onError={setError}
      />
    </div>
  );
}
