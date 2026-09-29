import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { recordAudit } from "./audit";
import { getEdorasInstitution } from "./edoras";

/**
 * İç / sunum kurumları (crm_internal_institutions). Metriklerden hariç tutulur; listede "İç" etiketiyle
 * kalır. DeepSportAdmin'deki "dahili / test hesapları" (G61) karşılığı — burada ekipçe paylaşılır.
 */
export interface InternalInstitution {
  institutionId: string;
  note: string | null;
  createdAt: string;
}

export async function listInternalInstitutions(): Promise<InternalInstitution[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_internal_institutions")
    .select("institution_id, note, created_at")
    .order("created_at");
  if (error) throw dbError(error);
  return (data ?? []).map((r) => ({
    institutionId: r.institution_id as string,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function internalInstitutionIds(): Promise<Set<string>> {
  return new Set((await listInternalInstitutions()).map((r) => r.institutionId));
}

export async function markInternal(institutionId: string, note: string | null, actor: StaffContext): Promise<void> {
  const inst = await getEdorasInstitution(institutionId);
  if (!inst) throw new HttpError(404, "NOT_FOUND");
  const { error } = await getSupabaseAdminClient()
    .from("crm_internal_institutions")
    .upsert({ institution_id: institutionId, note: note?.trim() || null, created_by: actor.userId }, { onConflict: "institution_id" });
  if (error) throw dbError(error);
  await recordAudit(actor, { action: "INTERNAL_MARKED", entityType: "institution", entityId: institutionId, entityLabel: inst.name });
}

export async function unmarkInternal(institutionId: string, actor: StaffContext): Promise<void> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_internal_institutions")
    .delete()
    .eq("institution_id", institutionId)
    .select("institution_id");
  if (error) throw dbError(error);
  if (!data?.length) return;
  const inst = await getEdorasInstitution(institutionId);
  await recordAudit(actor, {
    action: "INTERNAL_UNMARKED",
    entityType: "institution",
    entityId: institutionId,
    entityLabel: inst?.name ?? null,
  });
}
