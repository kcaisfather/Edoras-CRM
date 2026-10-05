import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { leadSaleSchema } from "@/lib/domain/crm/sale";
import { recordLeadSale } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Satışı kaydet (her CRM kullanıcısı): satış tutarı + fatura profili zorunlu; aynı adımda hesap açılır (yeni Edoras
 * kurumu, DEMO'dan ücretliye geçiş ya da kayda alma) ve aday "Satış oldu"ya geçer. Yeni kurum açıldıysa geçici şifre
 * yalnız bu yanıtta döner.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await recordLeadSale(id, await parseBody(request, leadSaleSchema), staff));
});
