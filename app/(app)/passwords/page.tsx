import PasswordsClient from "./passwords-client";
import { requireVaultUser } from "@/lib/auth";

export default async function PasswordsPage() {
  const { viewOnly } = await requireVaultUser();
  return <PasswordsClient viewOnly={viewOnly} />;
}
