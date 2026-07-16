import { adminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reveal"
  | "copy"
  | "download"
  | "share"
  | "unshare"
  | "login";

export type AuditResourceType = "secret" | "document" | "folder" | "share";

export async function writeAuditLog(input: {
  actorId: string;
  actorEmail?: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  resourceTitle?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await adminClient.from("vault_audit_logs").insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail || null,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId || null,
      resource_title: input.resourceTitle || null,
      metadata: input.metadata || null,
    });
  } catch (err) {
    console.error("[vault audit]", err);
  }
}
