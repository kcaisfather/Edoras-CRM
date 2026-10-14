import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { kcaContactCreateSchema } from "@/lib/domain/kca/types";
import { kcaCreateContact, kcaListContacts } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

/** Network: yalnız kişinin KENDİ networkü ve yalnız Edoras firmalı kişiler (KCA Panel'de network kişiye özeldir). */
export const GET = route(async () => {
  const staff = await requireStaff();
  return ok(await kcaListContacts(staff));
});

/** Kişi ekle (firma Edoras projelerinden). → kişi. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await kcaCreateContact(staff, await parseBody(request, kcaContactCreateSchema)), 201);
});
