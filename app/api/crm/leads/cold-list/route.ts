import { assertSameOrigin, ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { leadsToColdListSchema } from "@/lib/domain/cold-lists/schemas";
import { returnLeadsToColdList } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";
// En çok 200 aday sırayla işlenir (istemci 25'erli parçalarla gönderir; sınır yine de geniş tutulur).
export const maxDuration = 60;

/**
 * Toplu "Soğuk listeye taşı" (her CRM kullanıcısı; Adaylar toplu işlem çubuğu): seçili adaylar (en çok 200) tek listeye,
 * tek kayıp nedeniyle. Her aday tekil uçla (POST /api/crm/leads/{id}/cold-list) AYNI yoldan ayrı işlenir ve işlem
 * kaydına düşer; hata veren atlanır, kalanlar sürer (müşteri → LEAD_IS_CUSTOMER, listede başka adaya bağlı aynı
 * telefon / e-posta → PROSPECT_DUPLICATE). Liste yoksa 404.
 * → { moved, restored, skipped: [{ id, code }] }
 */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  assertSameOrigin(request);
  return ok(await returnLeadsToColdList(await parseBody(request, leadsToColdListSchema), staff));
});
