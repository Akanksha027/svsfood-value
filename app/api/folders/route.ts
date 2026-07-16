import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).optional().nullable(),
});

export async function GET() {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  const { data, error: dbError } = await adminClient
    .from("vault_folders")
    .select("id, name, color, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
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

  const name = parsed.data.name.trim();
  const { data, error: dbError } = await adminClient
    .from("vault_folders")
    .insert({
      owner_id: user.id,
      name,
      color: parsed.data.color?.trim() || null,
    })
    .select("id, name, color, created_at, updated_at")
    .single();

  if (dbError) {
    if (dbError.code === "23505") {
      return NextResponse.json(
        { error: "A folder with that name already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    resourceType: "folder",
    resourceId: data.id,
    resourceTitle: data.name,
  });

  return NextResponse.json({ data }, { status: 201 });
}
