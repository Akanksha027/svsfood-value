import AuditClient from "./audit-client";
import { requireVaultUser } from "@/lib/auth";

export default async function AuditPage() {
  await requireVaultUser();
  return <AuditClient />;
}
