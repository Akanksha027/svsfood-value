import { NextResponse } from "next/server";
import { requireVaultApiUser, VAULT_STORAGE_BUCKET } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import {
  documentSizeErrorMessage,
  isDocumentTooLarge,
} from "@/lib/documents";
import { resolveOwnedFolderId } from "@/lib/folders";
import { getSharesForUser } from "@/lib/sharing";
import { adminClient } from "@/lib/supabase/admin";

const SELECT =
  "id, owner_id, folder_id, title, file_name, mime_type, size_bytes, notes, created_at, updated_at";

export async function GET(request: Request) {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  const folderFilter = new URL(request.url).searchParams.get("folder_id");
  const sharedOnly =
    folderFilter === "shared" ||
    new URL(request.url).searchParams.get("shared") === "1";

  const shares = await getSharesForUser(user.id, "document");
  const shareById = new Map(shares.map((s) => [s.resource_id, s]));

  if (sharedOnly) {
    const ids = shares.map((s) => s.resource_id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    const { data, error: dbError } = await adminClient
      .from("vault_documents")
      .select(SELECT)
      .in("id", ids)
      .order("updated_at", { ascending: false });
    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
    return NextResponse.json({
      data: (data || []).map((row) => ({
        ...row,
        access: "shared" as const,
        permission: shareById.get(row.id)?.permission || "view",
        can_edit: shareById.get(row.id)?.permission === "edit",
      })),
    });
  }

  let query = adminClient
    .from("vault_documents")
    .select(SELECT)
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (folderFilter === "null" || folderFilter === "unfiled") {
    query = query.is("folder_id", null);
  } else if (folderFilter) {
    query = query.eq("folder_id", folderFilter);
  }

  const { data: owned, error: dbError } = await query;
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const ownedRows = (owned || []).map((row) => ({
    ...row,
    access: "owner" as const,
    permission: "edit" as const,
    can_edit: true,
  }));

  if (!folderFilter) {
    const ids = shares
      .map((s) => s.resource_id)
      .filter((id) => !ownedRows.some((r) => r.id === id));
    if (ids.length > 0) {
      const { data: sharedRows } = await adminClient
        .from("vault_documents")
        .select(SELECT)
        .in("id", ids)
        .order("updated_at", { ascending: false });
      const merged = [
        ...ownedRows,
        ...(sharedRows || []).map((row) => ({
          ...row,
          access: "shared" as const,
          permission: shareById.get(row.id)?.permission || "view",
          can_edit: shareById.get(row.id)?.permission === "edit",
        })),
      ].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
      return NextResponse.json({ data: merged });
    }
  }

  return NextResponse.json({ data: ownedRows });
}

export async function POST(request: Request) {
  const { user, error, viewOnly } = await requireVaultApiUser();
  if (error || !user) return error!;
  if (viewOnly) {
    return NextResponse.json({ error: "View-only account" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 422 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 422 });
  }
  if (isDocumentTooLarge(file.size)) {
    return NextResponse.json(
      { error: documentSizeErrorMessage() },
      { status: 422 },
    );
  }

  const titleRaw = String(form.get("title") || file.name).trim();
  const title = titleRaw.slice(0, 200) || file.name;
  const notesRaw = String(form.get("notes") || "").trim();
  const notes = notesRaw ? notesRaw.slice(0, 4000) : null;
  const folderRaw = String(form.get("folder_id") || "").trim();
  const folder = await resolveOwnedFolderId(user.id, folderRaw || null);
  if (folder.error) {
    return NextResponse.json({ error: folder.error }, { status: 422 });
  }

  const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 180);
  const storagePath = `${user.id}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await adminClient.storage
    .from(VAULT_STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        error:
          uploadError.message ||
          `Upload failed — ensure storage bucket "${VAULT_STORAGE_BUCKET}" exists`,
      },
      { status: 500 },
    );
  }

  const { data, error: dbError } = await adminClient
    .from("vault_documents")
    .insert({
      owner_id: user.id,
      folder_id: folder.folderId,
      title,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      storage_path: storagePath,
      notes,
    })
    .select(SELECT)
    .single();

  if (dbError) {
    await adminClient.storage.from(VAULT_STORAGE_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    resourceType: "document",
    resourceId: data.id,
    resourceTitle: data.title,
    metadata: { file_name: data.file_name, size_bytes: data.size_bytes },
  });

  return NextResponse.json(
    {
      data: {
        ...data,
        access: "owner",
        permission: "edit",
        can_edit: true,
      },
    },
    { status: 201 },
  );
}
