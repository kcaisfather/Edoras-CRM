import { ok, parseBoundedBody, requireStaff, route } from "@/lib/api/server";
import { BULK_MAX_BYTES, bulkLeadsSchema } from "@/lib/import/bulk";
import { importLeads } from "@/lib/server/crm-import";

export const dynamic = "force-dynamic";

/**
 * CRM adayı toplu içe aktarma (her CRM kullanıcısı — DeepSport'ta da CRM listesindeki "İçe aktar" herkese açıktı):
 * statü Aranacak, kaynak IMPORT, tutar yazılmaz. İstek başına en çok 2000 satır ve 2 MB. Sunucu telefonu / e-postayı
 * yeniden normalleştirir ve mükerrerleri (dosya içi, CRM adayı, kurum yetkilisi) kendisi ayıklar.
 * `dryRun: true` aynı raporu yazmadan döner. → { created, skipped: [{ row, reason }], dryRun }
 */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  const { items, dryRun } = await parseBoundedBody(request, bulkLeadsSchema, BULK_MAX_BYTES);
  return ok(await importLeads(items, dryRun, staff), dryRun ? 200 : 201);
});
