import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { leadBatchSchema } from "@/lib/domain/crm/schemas";
import { batchLeads } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

/**
 * Toplu işlem (en çok 200 aday): durum değiştir (her CRM kullanıcısı; Aranacak / Ulaşılamadı), sorumlu ata ve sil
 * (yalnız ADMIN, aksi 403). Adaylar tek tek işlenir; hata verenler `failed` listesinde döner.
 * → { done, failed: [{ id, code }] }
 */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await batchLeads(await parseBody(request, leadBatchSchema), staff));
});
