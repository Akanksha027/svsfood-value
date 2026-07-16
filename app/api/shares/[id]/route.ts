import { NextResponse } from "next/server";
import { requireVaultApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const { user, error, viewOnly } = await requireVaultApiUser();
  if (error || !user) return error!;
  if (viewOnly) {
    return NextResponse.json({ error: "View-only account" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const { data: share, error: fetchError } = await adminClient
    .from("vault_shares")
    .select(
      "id, owner_id, shared_with_id, resource_type, resource_id, permission",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Owner can revoke; recipient can leave
  if (share.owner_id !== user.id && share.shared_with_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const table =
    share.resource_type === "secret" ? "vault_secrets" : "vault_documents";
  const { data: resource } = await adminClient
    .from(table)
    .select("title")
    .eq("id", share.resource_id)
    .maybeSingle();

  const { error: dbError } = await adminClient
    .from("vault_shares")
    .delete()
    .eq("id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "unshare",
    resourceType:
      share.resource_type === "secret" ? "secret" : "document",
    resourceId: share.resource_id,
    resourceTitle: resource?.title || null,
    metadata: {
      share_id: share.id,
      shared_with_id: share.shared_with_id,
      revoked_by:
        share.owner_id === user.id ? "owner" : "recipient",
    },
  });

  return NextResponse.json({ success: true });
}
