import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function requireVaultApiUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null as null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const role = user.app_metadata?.role;
  if (role !== "vault" && role !== "super_admin") {
    return {
      user: null as null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  const viewOnly = user.app_metadata?.view_only === true;
  return { user, error: null as null, viewOnly };
}

export const VAULT_STORAGE_BUCKET = "vault-documents";
