import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import type { CommitmentValues, RenewalCommitmentDto } from "@/lib/domain/growth/commitments";
import { recordAudit } from "./audit";
import { staffNameMap } from "./staff";

/**
 * Yenileme Radarı taahhütleri (crm_renewal_commitments) — yalnız CRM projesi. Aktör oturumdan yazılır. Her yazma işlem
 * kaydına düşer; `details`'e not (serbest metin) YAZILMAZ — yalnız durum ve bitiş günü.
 */

const COLUMNS = "institution_id, cycle_end, status, note, updated_by, updated_at";

interface Row {
  institution_id: string;
  cycle_end: string;
  status: RenewalCommitmentDto["status"];
  note: string | null;
  updated_by: string | null;
  updated_at: string;
}

const toDto = (r: Row, names: Map<string, string>): RenewalCommitmentDto => ({
  institutionId: r.institution_id,
  cycleEnd: r.cycle_end,
  status: r.status,
  note: r.note,
  updatedByName: r.updated_by ? (names.get(r.updated_by) ?? null) : null,
  updatedAt: Date.parse(r.updated_at),
});

/** Tüm taahhütler (kurum sayısı kadar; küçük). Geçerlilik (bitiş günü eşleşmesi) istemcide, satırla birlikte değerlenir. */
export async function listCommitments(): Promise<RenewalCommitmentDto[]> {
  const [{ data, error }, names] = await Promise.all([
    getSupabaseAdminClient().from("crm_renewal_commitments").select(COLUMNS).order("updated_at", { ascending: false }).limit(5000),
    staffNameMap(),
  ]);
  if (error) throw dbError(error);
  return ((data ?? []) as Row[]).map((r) => toDto(r, names));
}

async function institutionLabel(institutionId: string): Promise<string> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_institutions")
    .select("institution_name")
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data.institution_name as string;
}

/** Taahhüdü yazar (varsa değiştirir). Kurum CRM'de kayıtlı olmalı (404). */
export async function setCommitment(institutionId: string, values: CommitmentValues, staff: StaffContext): Promise<RenewalCommitmentDto> {
  const label = await institutionLabel(institutionId);
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_renewal_commitments")
    .upsert(
      { institution_id: institutionId, cycle_end: values.cycleEnd, status: values.status, note: values.note, updated_by: staff.userId },
      { onConflict: "institution_id" }
    )
    .select(COLUMNS)
    .single();
  if (error) throw dbError(error);
  await recordAudit(staff, {
    action: "RENEWAL_COMMITMENT_SET",
    entityType: "institution",
    entityId: institutionId,
    entityLabel: label,
    details: { status: values.status, cycleEnd: values.cycleEnd },
  });
  return toDto(data as Row, await staffNameMap());
}

/** Taahhüdü siler (kurum "taahhüt yok"a döner). Taahhüt yoksa sessizce geçer. */
export async function clearCommitment(institutionId: string, staff: StaffContext): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().from("crm_renewal_commitments").delete().eq("institution_id", institutionId).select("institution_id");
  if (error) throw dbError(error);
  if (!data?.length) return;
  await recordAudit(staff, {
    action: "RENEWAL_COMMITMENT_CLEARED",
    entityType: "institution",
    entityId: institutionId,
    entityLabel: await institutionLabel(institutionId).catch(() => null),
  });
}
