import { adminClient } from "@/lib/supabase/admin";

export type ResourceType = "secret" | "document";
export type SharePermission = "view" | "edit";

export type AccessResult =
  | { ok: true; owned: true; permission: "edit" }
  | { ok: true; owned: false; permission: SharePermission; shareId: string }
  | { ok: false };

export async function getSharesForUser(
  userId: string,
  resourceType: ResourceType,
) {
  const { data, error } = await adminClient
    .from("vault_shares")
    .select("id, resource_id, permission, owner_id")
    .eq("shared_with_id", userId)
    .eq("resource_type", resourceType);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSharesForResource(
  ownerId: string,
  resourceType: ResourceType,
  resourceId: string,
) {
  const { data, error } = await adminClient
    .from("vault_shares")
    .select("id, shared_with_id, permission, created_at")
    .eq("owner_id", ownerId)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function resolveResourceAccess(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
): Promise<AccessResult> {
  const table = resourceType === "secret" ? "vault_secrets" : "vault_documents";
  const { data: row, error } = await adminClient
    .from(table)
    .select("id, owner_id")
    .eq("id", resourceId)
    .maybeSingle();
  if (error || !row) return { ok: false };
  if (row.owner_id === userId) {
    return { ok: true, owned: true, permission: "edit" };
  }

  const { data: share } = await adminClient
    .from("vault_shares")
    .select("id, permission")
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .eq("shared_with_id", userId)
    .maybeSingle();

  if (!share) return { ok: false };
  const permission: SharePermission =
    share.permission === "edit" ? "edit" : "view";
  return {
    ok: true,
    owned: false,
    permission,
    shareId: share.id,
  };
}

/** True if target is a vault or super_admin user (and not self). */
export async function assertShareableVaultUser(
  targetUserId: string,
  actorId: string,
): Promise<{ ok: true; email: string | null } | { ok: false; error: string }> {
  if (targetUserId === actorId) {
    return { ok: false, error: "Cannot share with yourself" };
  }
  const { data, error } = await adminClient.auth.admin.getUserById(targetUserId);
  if (error || !data.user) {
    return { ok: false, error: "User not found" };
  }
  const role = data.user.app_metadata?.role;
  if (role !== "vault" && role !== "super_admin") {
    return { ok: false, error: "Can only share with Vault users" };
  }
  return { ok: true, email: data.user.email || null };
}

export async function listVaultPeerUsers(actorId: string) {
  const peers: {
    id: string;
    email: string;
    display_name: string;
  }[] = [];

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(error.message);
    const users = data.users || [];
    for (const u of users) {
      const role = u.app_metadata?.role;
      if (u.id === actorId) continue;
      if (role !== "vault" && role !== "super_admin") continue;
      const meta = u.user_metadata || {};
      const first = typeof meta.first_name === "string" ? meta.first_name : "";
      const last = typeof meta.last_name === "string" ? meta.last_name : "";
      const full = `${first} ${last}`.trim();
      peers.push({
        id: u.id,
        email: u.email || "",
        display_name: full || (u.email || "Vault user").split("@")[0],
      });
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 20) break;
  }

  peers.sort((a, b) => a.email.localeCompare(b.email));
  return peers;
}
