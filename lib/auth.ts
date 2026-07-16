import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type VaultRole = "super_admin" | "vault";

export function getRole(user: { app_metadata?: Record<string, unknown> }): string {
  const role = user.app_metadata?.role;
  return typeof role === "string" ? role : "";
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireVaultUser() {
  const user = await requireUser();
  const role = getRole(user);
  if (role !== "vault" && role !== "super_admin") {
    redirect("/login?error=forbidden");
  }
  const viewOnly = user.app_metadata?.view_only === true;
  return { user, role: role as VaultRole, viewOnly };
}

export function displayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const meta = user.user_metadata || {};
  const first = typeof meta.first_name === "string" ? meta.first_name : "";
  const last = typeof meta.last_name === "string" ? meta.last_name : "";
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (user.email) return user.email.split("@")[0];
  return "Vault user";
}
