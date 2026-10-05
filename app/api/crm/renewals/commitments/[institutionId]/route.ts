import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { commitmentSchema } from "@/lib/domain/growth/commitments";
import { clearCommitment, setCommitment } from "@/lib/server/renewal-commitments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ institutionId: string }> };

/** Kurumun yenileme taahhüdünü yaz / değiştir (her CRM kullanıcısı). Kurum CRM'de kayıtlı olmalı (404). */
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).institutionId);
  return ok(await setCommitment(id, await parseBody(request, commitmentSchema), staff));
});

/** Taahhüdü sil (kurum "taahhüt yok"a döner). */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff();
  const id = requireUuid((await params).institutionId);
  await clearCommitment(id, staff);
  return ok({ ok: true });
});
