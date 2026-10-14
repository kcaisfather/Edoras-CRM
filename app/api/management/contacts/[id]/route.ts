import { assertSameOrigin, ok, parseBody, requireIntId, requireStaff, route } from "@/lib/api/server";
import { kcaContactPatchSchema } from "@/lib/domain/kca/types";
import { kcaDeleteContact, kcaUpdateContact } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Kısmi güncelleme (yalnız kendi kişisi; firma Edoras projeleri arasında). → kişi. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireIntId((await params).id);
  return ok(await kcaUpdateContact(staff, id, await parseBody(request, kcaContactPatchSchema)));
});

export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  assertSameOrigin(request);
  return ok(await kcaDeleteContact(staff, requireIntId((await params).id)));
});
