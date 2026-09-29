import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { newDemoSchema } from "@/lib/domain/institutions/schemas";
import { openLeadDemo } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Adaydan demo aç (her CRM kullanıcısı): yeni demo kurum + adayın o kuruma bağlanması + statü
 * "Demo tanımlandı", tek geri alma zincirinde. Geçici şifre yalnız bu yanıtta döner.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await openLeadDemo(id, await parseBody(request, newDemoSchema), staff), 201);
});
