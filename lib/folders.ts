import { adminClient } from "@/lib/supabase/admin";

/** Ensure folder exists and belongs to owner. Empty/null → null. */
export async function resolveOwnedFolderId(
  ownerId: string,
  folderId: string | null | undefined,
): Promise<{ folderId: string | null; error?: string }> {
  if (folderId == null || folderId === "") {
    return { folderId: null };
  }
  const { data, error } = await adminClient
    .from("vault_folders")
    .select("id")
    .eq("id", folderId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) return { folderId: null, error: error.message };
  if (!data) return { folderId: null, error: "Folder not found" };
  return { folderId: data.id };
}
