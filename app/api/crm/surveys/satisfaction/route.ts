import { HttpError, ok, requireStaff, route } from "@/lib/api/server";
import { satisfactionQuerySchema } from "@/lib/domain/surveys/schemas";
import { satisfactionIndex, subjectSatisfaction } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

/**
 * Memnuniyet rozeti. `?leadId=` ya da `?institutionId=` → tek aday / kurum özeti (son yanıt, yanıt sayısı, bekleyen
 * davet); parametresiz → { byLead, byInstitution } (liste rozetleri tek istekle). Yalnız müşterinin kendi puanı.
 */
export const GET = route(async (request: Request) => {
  await requireStaff();
  const sp = new URL(request.url).searchParams;
  const query = satisfactionQuerySchema.safeParse({
    leadId: sp.get("leadId") || undefined,
    institutionId: sp.get("institutionId") || undefined,
  });
  if (!query.success) throw new HttpError(400, "VALIDATION");
  const { leadId, institutionId } = query.data;
  return ok(leadId || institutionId ? await subjectSatisfaction({ leadId, institutionId }) : await satisfactionIndex());
});
