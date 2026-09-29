import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { newDemoSchema } from "@/lib/domain/institutions/schemas";
import { createDemoInstitution, listInstitutions } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireStaff();
  return ok(await listInstitutions());
});

/** Yeni demo kurum (her CRM kullanıcısı açabilir; kural: ad soyad + kurum adı + telefon + e-posta). */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  const input = await parseBody(request, newDemoSchema);
  return ok(await createDemoInstitution(input, staff), 201);
});
