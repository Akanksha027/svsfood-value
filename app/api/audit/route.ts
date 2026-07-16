import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultApiUser } from "@/lib/api-auth";
import { writeAuditLog, type AuditAction, type AuditResourceType } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/admin";

const clientLogSchema = z.object({
  action: z.enum(["copy", "reveal"]),
  resource_type: z.enum(["secret", "document"]),
  resource_id: z.string().uuid(),
  resource_title: z.string().max(200).optional().nullable(),
});

/** List audit events visible to this user (own actions + activity on owned resources). */
export async function GET(request: Request) {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  const url = new URL(request.url);
  const limit = Math.min(
    Number(url.searchParams.get("limit") || 100) || 100,
    300,
  );
  const action = url.searchParams.get("action");
  const resourceType = url.searchParams.get("resource_type");

  // Resource IDs I own (for "activity on my items")
  const [{ data: mySecrets }, { data: myDocs }] = await Promise.all([
    adminClient.from("vault_secrets").select("id").eq("owner_id", user.id),
    adminClient.from("vault_documents").select("id").eq("owner_id", user.id),
  ]);
  const ownedIds = [
    ...(mySecrets || []).map((r) => r.id),
    ...(myDocs || []).map((r) => r.id),
  ];

  // Fetch recent actor logs + resource logs, merge in app (Supabase or-filter is limited)
  const actorQuery = adminClient
    .from("vault_audit_logs")
    .select(
      "id, actor_id, actor_email, action, resource_type, resource_id, resource_title, metadata, created_at",
    )
    .eq("actor_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: actorLogs, error: actorError } = await actorQuery;
  if (actorError) {
    return NextResponse.json({ error: actorError.message }, { status: 500 });
  }

  let resourceLogs: typeof actorLogs = [];
  if (ownedIds.length > 0) {
    const { data, error: resError } = await adminClient
      .from("vault_audit_logs")
      .select(
        "id, actor_id, actor_email, action, resource_type, resource_id, resource_title, metadata, created_at",
      )
      .in("resource_id", ownedIds.slice(0, 200))
      .neq("actor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (resError) {
      return NextResponse.json({ error: resError.message }, { status: 500 });
    }
    resourceLogs = data || [];
  }

  const byId = new Map<string, (typeof actorLogs)[number]>();
  for (const row of [...(actorLogs || []), ...resourceLogs]) {
    byId.set(row.id, row);
  }
  let rows = Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (action) rows = rows.filter((r) => r.action === action);
  if (resourceType) {
    rows = rows.filter((r) => r.resource_type === resourceType);
  }

  return NextResponse.json({ data: rows.slice(0, limit) });
}

/** Client-side events (copy password) that don't hit a dedicated mutation API. */
export async function POST(request: Request) {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  const body = await request.json().catch(() => null);
  const parsed = clientLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid body" },
      { status: 422 },
    );
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: parsed.data.action as AuditAction,
    resourceType: parsed.data.resource_type as AuditResourceType,
    resourceId: parsed.data.resource_id,
    resourceTitle: parsed.data.resource_title || null,
  });

  return NextResponse.json({ success: true });
}
