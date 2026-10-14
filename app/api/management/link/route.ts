import { assertSameOrigin, ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { kcaLinkSchema } from "@/lib/domain/kca/types";
import { linkKcaAccount, unlinkKcaAccount } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

/**
 * KCA Panel hesabını bağla: e-posta + KCA Panel şifresi (Turso'da doğrulanır, şifre saklanmaz). Hatalı denemeler KCA
 * Panel'in giriş kilidine sayılır (15 dakikada 8). → güncel oturum.
 */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await linkKcaAccount(staff, await parseBody(request, kcaLinkSchema)));
});

/** Bağı kaldır (yalnız kendi bağı). */
export const DELETE = route(async (request: Request) => {
  const staff = await requireStaff();
  assertSameOrigin(request);
  return ok(await unlinkKcaAccount(staff));
});
