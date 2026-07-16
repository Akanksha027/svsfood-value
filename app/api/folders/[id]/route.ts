import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(20).optional().nullable(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  const { user, error, viewOnly } = await requireVaultApiUser();
  if (error || !user) return error!;
  if (viewOnly) {
    return NextResponse.json({ error: "View-only account" }, { status: 403 });
  }
  const { id } = await ctx.params;
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
  if (parsed.data.name != null) patch.name = parsed.data.name.trim();
  if (parsed.data.color !== undefined) {
    patch.color = parsed.data.color?.trim() || null;
  }

  const { data, error: dbError } = await adminClient
    .from("vault_folders")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, name, color, created_at, updated_at")
    .maybeSingle();

  if (dbError) {
    if (dbError.code === "23505") {
      return NextResponse.json(
        { error: "A folder with that name already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    resourceType: "folder",
    resourceId: data.id,
    resourceTitle: data.name,
  });

  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { user, error, viewOnly } = await requireVaultApiUser();
  if (error || !user) return error!;
  if (viewOnly) {
    return NextResponse.json({ error: "View-only account" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const { data: existing } = await adminClient
    .from("vault_folders")
    .select("id, name")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  const { error: dbError, count } = await adminClient
    .from("vault_folders")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    resourceType: "folder",
    resourceId: id,
    resourceTitle: existing?.name || null,
  });

  return NextResponse.json({ success: true });
}
