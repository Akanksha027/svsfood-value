import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { resolveOwnedFolderId } from "@/lib/folders";
import { resolveResourceAccess } from "@/lib/sharing";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

const SELECT =
  "id, owner_id, folder_id, title, username, url, notes, tags, is_favorite, last_accessed_at, created_at, updated_at";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  username: z.string().max(200).optional().nullable(),
  url: z.string().max(500).optional().nullable(),
  password: z.string().min(1).max(2000).optional(),
  notes: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  folder_id: z.string().uuid().optional().nullable(),
  is_favorite: z.boolean().optional(),
});

export async function GET(request: Request, ctx: Ctx) {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;
  const { id } = await ctx.params;
  const intentParam = new URL(request.url).searchParams.get("intent");
  const intent =
    intentParam === "copy" || intentParam === "edit" || intentParam === "reveal"
      ? intentParam
      : "reveal";

  const access = await resolveResourceAccess(user.id, "secret", id);
  if (!access.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error: dbError } = await adminClient
    .from("vault_secrets")
    .select(
      "id, owner_id, folder_id, title, username, url, notes, tags, password_ciphertext, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let password = "";
  try {
    password = decryptSecret(data.password_ciphertext);
  } catch {
    return NextResponse.json({ error: "Decrypt failed" }, { status: 500 });
  }

  if (intent === "reveal" || intent === "copy") {
    await writeAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: intent === "copy" ? "copy" : "reveal",
      resourceType: "secret",
      resourceId: data.id,
      resourceTitle: data.title,
      metadata: {
        access: access.owned ? "owner" : "shared",
        without_reveal: intent === "copy",
      },
    });
    await adminClient
      .from("vault_secrets")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", id);
  }

  const { password_ciphertext: _, ...rest } = data;
  return NextResponse.json({
    data: {
      ...rest,
      password,
      access: access.owned ? "owner" : "shared",
      permission: access.permission,
      can_edit: access.permission === "edit",
    },
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { user, error, viewOnly } = await requireVaultApiUser();
  if (error || !user) return error!;
  if (viewOnly) {
    return NextResponse.json({ error: "View-only account" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const access = await resolveResourceAccess(user.id, "secret", id);
  if (!access.ok || access.permission !== "edit") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid body" },
      { status: 422 },
    );
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.title != null) patch.title = parsed.data.title.trim();
  if (parsed.data.username !== undefined) {
    patch.username = parsed.data.username?.trim() || null;
  }
  if (parsed.data.url !== undefined) {
    patch.url = parsed.data.url?.trim() || null;
  }
  if (parsed.data.notes !== undefined) {
    patch.notes = parsed.data.notes?.trim() || null;
  }
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags;
  if (parsed.data.is_favorite !== undefined) {
    if (!access.owned) {
      return NextResponse.json(
        { error: "Only the owner can favorite" },
        { status: 403 },
      );
    }
    patch.is_favorite = parsed.data.is_favorite;
  }
  if (parsed.data.folder_id !== undefined) {
    if (!access.owned) {
      return NextResponse.json(
        { error: "Only the owner can move folders" },
        { status: 403 },
      );
    }
    const folder = await resolveOwnedFolderId(user.id, parsed.data.folder_id);
    if (folder.error) {
      return NextResponse.json({ error: folder.error }, { status: 422 });
    }
    patch.folder_id = folder.folderId;
  }
  if (parsed.data.password) {
    try {
      patch.password_ciphertext = encryptSecret(parsed.data.password);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Encryption not configured",
        },
        { status: 500 },
      );
    }
  }

  const { data, error: dbError } = await adminClient
    .from("vault_secrets")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    resourceType: "secret",
    resourceId: data.id,
    resourceTitle: data.title,
  });

  return NextResponse.json({
    data: {
      ...data,
      access: access.owned ? "owner" : "shared",
      permission: access.permission,
      can_edit: true,
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

  const access = await resolveResourceAccess(user.id, "secret", id);
  if (!access.ok || !access.owned) {
    return NextResponse.json(
      { error: "Only the owner can delete" },
      { status: 403 },
    );
  }

  const { data: existing } = await adminClient
    .from("vault_secrets")
    .select("id, title")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  const { error: dbError, count } = await adminClient
    .from("vault_secrets")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await adminClient
    .from("vault_shares")
    .delete()
    .eq("resource_type", "secret")
    .eq("resource_id", id);

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    resourceType: "secret",
    resourceId: id,
    resourceTitle: existing?.title || null,
  });

  return NextResponse.json({ success: true });
}
