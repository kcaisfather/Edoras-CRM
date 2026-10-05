import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError } from "@/lib/api/server";
import { isSurveyToken } from "@/lib/domain/surveys/schemas";
import type { PublicTicketPage, PublicTicketValues } from "@/lib/domain/tickets/types";

/**
 * Herkese açık destek formu (/t/[token] sayfası ve /api/public/tickets/* uçları) — OTURUM YOK. Anketlerle aynı model
 * (lib/server/public-surveys.ts): asla 401 dönmez; geçersiz token 404, oran sınırı 429 (IP + token ve IP başına; oran
 * sınırı public-surveys.publicRateLimit ile paylaşılır), kurum başına 24 saatte en çok 20 talep veritabanında 429.
 * service_role YALNIZ sunucuda ve yalnız crm_ticket_portal_open / _create için kullanılır. Yanıt yalnız kurum adını
 * (açılışta) ve talep numarasını (oluşturmada) taşır; talep eden bilgisi hiçbir yerde geri dönmez ve işlem kaydına
 * yazılmaz (personel işlemi değildir ve kişisel veri taşır). Hata logunda token yazılmaz.
 */

const requireToken = (token: string): string => {
  if (!isSurveyToken(token)) throw new HttpError(404, "NOT_FOUND");
  return token;
};

export async function openPublicTicketPage(token: string): Promise<PublicTicketPage> {
  const { data, error } = await getSupabaseAdminClient().rpc("crm_ticket_portal_open", { p_token: requireToken(token) });
  if (error) throw dbError(error);
  const res = data as { state: string; institution_name?: string };
  if (res.state !== "OPEN" || !res.institution_name) throw new HttpError(404, "NOT_FOUND");
  return { institutionName: res.institution_name };
}

/** Talep oluşturur; yalnız numarayı döndürür. */
export async function submitPublicTicket(token: string, values: PublicTicketValues): Promise<{ number: number }> {
  const { data, error } = await getSupabaseAdminClient().rpc("crm_ticket_portal_create", {
    p_token: requireToken(token),
    p_subject: values.subject,
    p_description: values.description || null,
    p_name: values.name,
    p_email: values.email || null,
    p_phone: values.phone || null,
  });
  if (error) throw dbError(error);
  return { number: Number((data as { number: number | string }).number) };
}
