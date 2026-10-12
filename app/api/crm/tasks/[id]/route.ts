import { assertSameOrigin, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { removeTask } from "@/lib/server/crm-tasks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Kaldır" (2026-10-12) — elle eklenen açık görevi Görevlerim'den çıkarır. Yalnız görevi ekleyen, atanan kişi ya da
 * yönetici (403 TASK_NOT_REMOVER); kural görevi 404, tamamlanmış görev 409. İşlem kaydına TASK_REMOVED yazılır.
 */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  assertSameOrigin(request);
  await removeTask(requireUuid((await params).id), staff);
  return ok({ ok: true });
});
