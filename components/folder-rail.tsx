"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FiFolder, FiFolderPlus, FiTrash2 } from "react-icons/fi";

export type VaultFolder = {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
};

/** `all` | `unfiled` | `shared` | folder uuid */
export type FolderFilter = "all" | "unfiled" | "shared" | string;

export function useVaultFolders() {
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/folders");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load folders");
      setFolders(body.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { folders, loading, error, setError, reload };
}

export function FolderRail({
  folders,
  filter,
  onFilterChange,
  viewOnly,
  onChanged,
  onError,
}: {
  folders: VaultFolder[];
  filter: FolderFilter;
  onFilterChange: (f: FolderFilter) => void;
  viewOnly: boolean;
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function createFolder(e: FormEvent) {
    e.preventDefault();
    if (viewOnly || !name.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create folder");
      setName("");
      setCreating(false);
      onChanged();
      if (body.data?.id) onFilterChange(body.data.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(folder: VaultFolder) {
    if (viewOnly) return;
    if (
      !window.confirm(
        `Delete folder “${folder.name}”? Items inside become Unfiled.`,
      )
    ) {
      return;
    }
    onError(null);
    const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      onError(body.error || "Could not delete folder");
      return;
    }
    if (filter === folder.id) onFilterChange("all");
    onChanged();
  }

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
      active
        ? "bg-[#fff5ee] text-[#f16a34] border-[#ffdccc]"
        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip(filter === "all")}
          onClick={() => onFilterChange("all")}
        >
          All
        </button>
        <button
          type="button"
          className={chip(filter === "unfiled")}
          onClick={() => onFilterChange("unfiled")}
        >
          Unfiled
        </button>
        <button
          type="button"
          className={chip(filter === "shared")}
          onClick={() => onFilterChange("shared")}
        >
          Shared with me
        </button>
        {folders.map((f) => (
          <div key={f.id} className="inline-flex items-center gap-0.5">
            <button
              type="button"
              className={chip(filter === f.id)}
              onClick={() => onFilterChange(f.id)}
            >
              <FiFolder className="w-3.5 h-3.5" />
              {f.name}
            </button>
            {!viewOnly ? (
              <button
                type="button"
                title={`Delete ${f.name}`}
                className="h-8 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                onClick={() => void deleteFolder(f)}
              >
                <FiTrash2 className="w-3.5 h-3.5 mx-auto" />
              </button>
            ) : null}
          </div>
        ))}
        {!viewOnly ? (
          creating ? null : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-[#f16a34] border border-dashed border-[#ffdccc] hover:bg-[#fff5ee]"
              onClick={() => setCreating(true)}
            >
              <FiFolderPlus className="w-3.5 h-3.5" />
              New folder
            </button>
          )
        ) : null}
      </div>

      {creating && !viewOnly ? (
        <form
          onSubmit={createFolder}
          className="flex flex-wrap items-center gap-2 max-w-md"
        >
          <input
            className="admin-input flex-1 min-w-[160px]"
            placeholder="Folder name (e.g. Petpooja)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
          />
          <button
            type="submit"
            className="admin-btn-primary"
            disabled={busy || !name.trim()}
          >
            {busy ? "Saving…" : "Create"}
          </button>
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function FolderSelect({
  folders,
  value,
  onChange,
  disabled,
}: {
  folders: VaultFolder[];
  value: string;
  onChange: (folderId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="admin-label">Folder</label>
      <select
        className="admin-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Unfiled</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}
