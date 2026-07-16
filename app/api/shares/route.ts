import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import {
  assertShareableVaultUser,
  getSharesForResource,
} from "@/lib/sharing";
import { adminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  resource_type: z.enum(["secret", "document"]),
  resource_id: z.string().uuid(),
  shared_with_id: z.string().uuid(),
  permission: z.enum(["view", "edit"]).default("view"),
});

async function loadOwnedResource(
  ownerId: string,
  resourceType: "secret" | "document",
  resourceId: string,
) {
  const table =
    resourceType === "secret" ? "vault_secrets" : "vault_documents";
  const { data, error } = await adminClient
    .from(table)
    .select("id, title, owner_id")
    .eq("id", resourceId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request: Request) {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  const url = new URL(request.url);
  const resourceType = url.searchParams.get("resource_type");
  const resourceId = url.searchParams.get("resource_id");
  const mine = url.searchParams.get("mine") === "1";

  if (resourceType && resourceId) {
    if (resourceType !== "secret" && resourceType !== "document") {
      return NextResponse.json({ error: "Invalid resource_type" }, { status: 422 });
    }
    const owned = await loadOwnedResource(user.id, resourceType, resourceId);
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const shares = await getSharesForResource(user.id, resourceType, resourceId);
    // Enrich with emails
    const enriched = await Promise.all(
      shares.map(async (s) => {
        const { data } = await adminClient.auth.admin.getUserById(
          s.shared_with_id,
        );
        return {
          ...s,
          shared_with_email: data.user?.email || null,
          shared_with_name:
            [
              data.user?.user_metadata?.first_name,
              data.user?.user_metadata?.last_name,
            ]
              .filter((x) => typeof x === "string")
              .join(" ")
              .trim() || null,
        };
      }),
    );
    return NextResponse.json({ data: enriched });
  }

  // Shares I received, or shares I created
  let query = adminClient
    .from("vault_shares")
    .select(
      "id, owner_id, shared_with_id, resource_type, resource_id, permission, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (mine) {
    query = query.eq("owner_id", user.id);
  } else {
    query = query.eq("shared_with_id", user.id);
  }

  const { data, error: dbError } = await query;
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

  const owned = await loadOwnedResource(
    user.id,
    parsed.data.resource_type,
    parsed.data.resource_id,
  );
  if (!owned) {
    return NextResponse.json(
      { error: "Only the owner can share this item" },
      { status: 403 },
    );
  }

  const target = await assertShareableVaultUser(
    parsed.data.shared_with_id,
    user.id,
  );
  if (!target.ok) {
    return NextResponse.json({ error: target.error }, { status: 422 });
  }

  const { data, error: dbError } = await adminClient
    .from("vault_shares")
    .upsert(
      {
        owner_id: user.id,
        shared_with_id: parsed.data.shared_with_id,
        resource_type: parsed.data.resource_type,
        resource_id: parsed.data.resource_id,
        permission: parsed.data.permission,
      },
      { onConflict: "resource_type,resource_id,shared_with_id" },
    )
    .select(
      "id, owner_id, shared_with_id, resource_type, resource_id, permission, created_at",
    )
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: "share",
    resourceType: parsed.data.resource_type,
    resourceId: parsed.data.resource_id,
    resourceTitle: owned.title,
    metadata: {
      shared_with_id: parsed.data.shared_with_id,
      shared_with_email: target.email,
      permission: parsed.data.permission,
    },
  });

  return NextResponse.json(
    {
      data: {
        ...data,
        shared_with_email: target.email,
      },
    },
    { status: 201 },
  );
}
