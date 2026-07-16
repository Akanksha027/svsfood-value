import { NextResponse } from "next/server";
import { requireVaultApiUser } from "@/lib/api-auth";
import { getSharesForUser } from "@/lib/sharing";
import { adminClient } from "@/lib/supabase/admin";

const SELECT =
  "id, owner_id, folder_id, title, username, url, notes, tags, is_favorite, last_accessed_at, created_at, updated_at";

type SecretRow = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  title: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  tags: string[];
  is_favorite: boolean;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Favorites + recently accessed passwords for the overview page. */
export async function GET() {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  const shares = await getSharesForUser(user.id, "secret");
  const sharedIds = shares.map((s) => s.resource_id);
  const shareById = new Map(shares.map((s) => [s.resource_id, s]));

  const { data: favorites, error: favError } = await adminClient
    .from("vault_secrets")
    .select(SELECT)
    .eq("owner_id", user.id)
    .eq("is_favorite", true)
    .order("title", { ascending: true })
    .limit(20);

  if (favError) {
    return NextResponse.json({ error: favError.message }, { status: 500 });
  }

  const { data: ownedRecent, error: recentError } = await adminClient
    .from("vault_secrets")
    .select(SELECT)
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(24);

  if (recentError) {
    return NextResponse.json({ error: recentError.message }, { status: 500 });
  }

  const owned = (ownedRecent || []) as SecretRow[];
  // Prefer last_accessed when present
  owned.sort((a, b) => {
    const ta = a.last_accessed_at || a.updated_at;
    const tb = b.last_accessed_at || b.updated_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  type Enriched = SecretRow & {
    access: "owner" | "shared";
    can_edit: boolean;
    permission?: string;
  };

  const recent: Enriched[] = owned.map((r) => ({
    ...r,
    access: "owner" as const,
    can_edit: true,
  }));

  if (sharedIds.length > 0) {
    const { data: sharedRows } = await adminClient
      .from("vault_secrets")
      .select(SELECT)
      .in("id", sharedIds)
      .limit(12);
    for (const row of (sharedRows || []) as SecretRow[]) {
      recent.push({
        ...row,
        access: "shared",
        permission: shareById.get(row.id)?.permission || "view",
        can_edit: shareById.get(row.id)?.permission === "edit",
      });
    }
  }

  recent.sort((a, b) => {
    const ta = a.last_accessed_at || a.updated_at;
    const tb = b.last_accessed_at || b.updated_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  const seen = new Set<string>();
  const recentDeduped: Enriched[] = [];
  for (const row of recent) {
    if (seen.has(row.id)) continue;
    // Skip never-accessed owned items that are only sorted by create/update
    // still include them so new vaults aren't empty — keep top 10
    seen.add(row.id);
    recentDeduped.push(row);
    if (recentDeduped.length >= 10) break;
  }

  return NextResponse.json({
    data: {
      favorites: ((favorites || []) as SecretRow[]).map((r) => ({
        ...r,
        access: "owner" as const,
        can_edit: true,
      })),
      recent: recentDeduped,
    },
  });
}
