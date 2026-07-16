import { NextResponse } from "next/server";
import { requireVaultApiUser } from "@/lib/api-auth";
import { listVaultPeerUsers } from "@/lib/sharing";

/** Other Vault / super_admin users you can share with. */
export async function GET() {
  const { user, error } = await requireVaultApiUser();
  if (error || !user) return error!;

  try {
    const peers = await listVaultPeerUsers(user.id);
    return NextResponse.json({ data: peers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list users" },
      { status: 500 },
    );
  }
}
