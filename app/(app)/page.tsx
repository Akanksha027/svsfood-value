import OverviewClient from "./overview-client";
import { requireVaultUser } from "@/lib/auth";

export default async function OverviewPage() {
  await requireVaultUser();
  return <OverviewClient />;
}
