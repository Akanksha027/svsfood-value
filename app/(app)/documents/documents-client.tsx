"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiDownload,
  FiFileText,
  FiPlus,
  FiSearch,
  FiShare2,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import {
  FolderRail,
  FolderSelect,
  type FolderFilter,
  useVaultFolders,
} from "@/components/folder-rail";
import ShareModal from "@/components/share-modal";
import {
  MAX_DOCUMENT_LABEL,
  documentSizeErrorMessage,
  isDocumentTooLarge,
} from "@/lib/documents";

type DocRow = {
  id: string;
  folder_id: string | null;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  access?: "owner" | "shared";
  permission?: string;
  can_edit?: boolean;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsClient({ viewOnly }: { viewOnly: boolean }) {
  const [items, setItems] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [folderId, setFolderId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareTarget, setShareTarget] = useState<DocRow | null>(null);
  const {
    folders,
    reload: reloadFolders,
    error: foldersError,
  } = useVaultFolders();

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
      const res = await fetch(`/api/documents${qs}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load documents");
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
        item.file_name,
        item.notes,
        item.mime_type,
        folderName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, folders]);

  function openUpload() {
    setTitle("");
    setNotes("");
    setFile(null);
    setFolderId(
      folderFilter !== "all" &&
        folderFilter !== "unfiled" &&
        folderFilter !== "shared"
        ? folderFilter
        : "",
    );
    setModalOpen(true);
  }

  function pickFile(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    if (isDocumentTooLarge(next.size)) {
      setFile(null);
      setError(documentSizeErrorMessage());
      return;
    }
    setError(null);
    setFile(next);
    if (!title.trim()) setTitle(next.name);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (viewOnly || !file) return;
    if (isDocumentTooLarge(file.size)) {
      setError(documentSizeErrorMessage());
      return;
    }
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("title", title.trim() || file.name);
    if (notes.trim()) form.set("notes", notes.trim());
    if (folderId) form.set("folder_id", folderId);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed");
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function download(id: string) {
    const res = await fetch(`/api/documents/${id}?download=1`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.data?.url) {
      setError(body.error || "Download failed");
      return;
    }
    window.open(body.data.url, "_blank", "noopener,noreferrer");
  }

  async function remove(id: string, titleLabel: string) {
    if (viewOnly) return;
    if (!window.confirm(`Delete “${titleLabel}”? This cannot be undone.`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Delete failed");
      return;
    }
    await load();
  }

  return (
    <div className="admin-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Documents
          </h1>
          <p className="admin-card-subtitle mt-0.5">
            Upload files into folders (up to {MAX_DOCUMENT_LABEL}).
          </p>
        </div>
        {!viewOnly ? (
          <button type="button" className="admin-btn-primary" onClick={openUpload}>
            <FiUpload className="w-4 h-4" />
            Upload file
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
            placeholder="Search title or file name…"
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
              ? "No documents in this folder yet."
              : "No matches for that search."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <li
                key={row.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[#fff5ee] text-[#f16a34] flex items-center justify-center shrink-0 border border-[#ffdccc]">
                    <FiFileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{row.title}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {row.access === "shared" ? (
                        <span className="text-violet-600 font-semibold">
                          Shared ·{" "}
                        </span>
                      ) : null}
                      {folders.find((f) => f.id === row.folder_id)?.name ||
                        (row.access === "shared" ? "—" : "Unfiled")}{" "}
                      · {row.file_name} · {formatBytes(row.size_bytes)}
                    </p>
                    {row.notes ? (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {row.notes}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  {row.access !== "shared" && !viewOnly ? (
                    <button
                      type="button"
                      className="admin-btn-secondary h-9 px-2.5"
                      onClick={() => setShareTarget(row)}
                      title="Share"
                    >
                      <FiShare2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="admin-btn-secondary h-9"
                    onClick={() => void download(row.id)}
                  >
                    <FiDownload className="w-3.5 h-3.5" />
                    Download
                  </button>
                  {row.access !== "shared" && !viewOnly ? (
                    <button
                      type="button"
                      className="admin-btn-danger h-9 px-2.5"
                      onClick={() => void remove(row.id, row.title)}
                      title="Delete"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="admin-card-title">Upload document</h2>
                <p className="admin-card-subtitle">
                  Max {MAX_DOCUMENT_LABEL} per file. Stored in Supabase Storage.
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
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional — defaults to file name"
                />
              </div>
              <FolderSelect
                folders={folders}
                value={folderId}
                onChange={setFolderId}
              />
              <div>
                <label className="admin-label">File</label>
                <input
                  type="file"
                  required
                  className="block w-full text-sm text-slate-600 file:mr-3 file:admin-btn-secondary file:border file:border-slate-200"
                  onChange={(e) => pickFile(e.target.files?.[0] || null)}
                />
                {file ? (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {file.name} · {formatBytes(file.size)} (max {MAX_DOCUMENT_LABEL})
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1.5">
                    Maximum file size: {MAX_DOCUMENT_LABEL}
                  </p>
                )}
              </div>
              <div>
                <label className="admin-label">Notes</label>
                <textarea
                  className="admin-input h-24 py-2 resize-y"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  disabled={saving || !file}
                >
                  <FiPlus className="w-4 h-4" />
                  {saving ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ShareModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        resourceType="document"
        resourceId={shareTarget?.id || ""}
        resourceTitle={shareTarget?.title || ""}
        onError={setError}
      />
    </div>
  );
}
