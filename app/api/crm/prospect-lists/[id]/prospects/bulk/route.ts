import { ok, parseBoundedBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { BULK_MAX_BYTES, bulkProspectsSchema } from "@/lib/import/bulk";
import { bulkAddProspects } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Listeye toplu kişi ekleme (her CRM kullanıcısı): istek başına en çok 2000 satır ve 2 MB. Sunucu telefonu /
 * e-postayı yeniden normalleştirir, mükerrerleri (dosya içi, aynı liste, CRM adayı, kurum yetkilisi) kendisi ayıklar.
 * → { created, skipped: [{ row, reason }], dryRun: false }
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  const { items } = await parseBoundedBody(request, bulkProspectsSchema, BULK_MAX_BYTES);
  return ok(await bulkAddProspects(id, items, staff));
});
