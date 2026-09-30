import { ok, requireStaff, route } from "@/lib/api/server";
import { auditLogsQuerySchema } from "@/lib/domain/activity/audit-logs";
import { listAuditLogs } from "@/lib/server/activity";

export const dynamic = "force-dynamic";

/**
 * Aktivite geçmişi → CRM işlem kaydı (crm_audit_logs, yalnız eklenir). Süzgeç: actorId, action, entityType, from, to
 * (YYYY-MM-DD), page, size. Yalnız ADMIN: CRM_AGENT 403.
 */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listAuditLogs(auditLogsQuerySchema.parse(params)));
});
