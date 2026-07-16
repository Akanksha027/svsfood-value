import { NextResponse } from "next/server";
import { requireVaultApiUser, VAULT_STORAGE_BUCKET } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { resolveResourceAccess } from "@/lib/sharing";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;
  const { id } = await ctx.params;
  const wantDownload =
    new URL(request.url).searchParams.get("download") === "1";

  const access = await resolveResourceAccess(user.id, "document", id);
  if (!access.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error: dbError } = await adminClient
    .from("vault_documents")
    .select(
      "id, owner_id, folder_id, title, file_name, mime_type, size_bytes, notes, storage_path, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!wantDownload) {
    const { storage_path: _, ...rest } = data;
    return NextResponse.json({
      data: {
        ...rest,
        access: access.owned ? "owner" : "shared",
        permission: access.permission,
        can_edit: access.permission === "edit",
      },
    });
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from(VAULT_STORAGE_BUCKET)
    .createSignedUrl(data.storage_path, 60);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message || "Could not create download URL" },
      { status: 500 },
    );
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "download",
    resourceType: "document",
    resourceId: data.id,
    resourceTitle: data.title,
    metadata: {
      file_name: data.file_name,
      access: access.owned ? "owner" : "shared",
    },
  });

  return NextResponse.json({
    data: {
      id: data.id,
      file_name: data.file_name,
      url: signed.signedUrl,
    },
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { user, error, viewOnly } = await requireVaultApiUser();
  if (error || !user) return error!;
  if (viewOnly) {
    return NextResponse.json({ error: "View-only account" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const access = await resolveResourceAccess(user.id, "document", id);
  if (!access.ok || !access.owned) {
    return NextResponse.json(
      { error: "Only the owner can delete" },
      { status: 403 },
    );
  }

  const { data, error: fetchError } = await adminClient
    .from("vault_documents")
    .select("id, title, storage_path")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await adminClient.storage
    .from(VAULT_STORAGE_BUCKET)
    .remove([data.storage_path]);

  const { error: dbError } = await adminClient
    .from("vault_documents")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await adminClient
    .from("vault_shares")
    .delete()
    .eq("resource_type", "document")
    .eq("resource_id", id);

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    resourceType: "document",
    resourceId: id,
    resourceTitle: data.title,
  });

  return NextResponse.json({ success: true });
}
