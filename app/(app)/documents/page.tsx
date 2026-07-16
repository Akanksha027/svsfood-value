import DocumentsClient from "./documents-client";
import { requireVaultUser } from "@/lib/auth";

export default async function DocumentsPage() {
  const { viewOnly } = await requireVaultUser();
  return <DocumentsClient viewOnly={viewOnly} />;
}
