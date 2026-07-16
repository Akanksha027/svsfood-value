import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { resolveOwnedFolderId } from "@/lib/folders";
import { getSharesForUser } from "@/lib/sharing";
import { adminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  username: z.string().max(200).optional().nullable(),
  url: z.string().max(500).optional().nullable(),
  password: z.string().min(1).max(2000),
  notes: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  folder_id: z.string().uuid().optional().nullable(),
});

const SELECT =
  "id, owner_id, folder_id, title, username, url, notes, tags, is_favorite, last_accessed_at, created_at, updated_at";

export async function GET(request: Request) {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  const folderFilter = new URL(request.url).searchParams.get("folder_id");
  const sharedOnly =
    folderFilter === "shared" ||
    new URL(request.url).searchParams.get("shared") === "1";

  const shares = await getSharesForUser(user.id, "secret");
  const shareById = new Map(shares.map((s) => [s.resource_id, s]));

  if (sharedOnly) {
    const ids = shares.map((s) => s.resource_id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    const { data, error: dbError } = await adminClient
      .from("vault_secrets")
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
    .from("vault_secrets")
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

  // On "all", also include shared items
  if (!folderFilter) {
    const ids = shares
      .map((s) => s.resource_id)
      .filter((id) => !ownedRows.some((r) => r.id === id));
    if (ids.length > 0) {
      const { data: sharedRows } = await adminClient
        .from("vault_secrets")
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

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid body" },
      { status: 422 },
    );
  }

  const folder = await resolveOwnedFolderId(user.id, parsed.data.folder_id);
  if (folder.error) {
    return NextResponse.json({ error: folder.error }, { status: 422 });
  }

  let ciphertext: string;
  try {
    ciphertext = encryptSecret(parsed.data.password);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Encryption not configured",
      },
      { status: 500 },
    );
  }

  const { data, error: dbError } = await adminClient
    .from("vault_secrets")
    .insert({
      owner_id: user.id,
      folder_id: folder.folderId,
      title: parsed.data.title.trim(),
      username: parsed.data.username?.trim() || null,
      url: parsed.data.url?.trim() || null,
      password_ciphertext: ciphertext,
      notes: parsed.data.notes?.trim() || null,
      tags: parsed.data.tags || [],
    })
    .select(SELECT)
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    resourceType: "secret",
    resourceId: data.id,
    resourceTitle: data.title,
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
