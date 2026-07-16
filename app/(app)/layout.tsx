import VaultShell from "@/components/vault-shell";
import {
  displayNameFromUser,
  requireVaultUser,
} from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireVaultUser();
  return (
    <VaultShell
      email={user.email || ""}
      displayName={displayNameFromUser(user)}
    >
      {children}
    </VaultShell>
  );
}
