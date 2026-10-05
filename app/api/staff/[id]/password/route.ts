import { z } from "zod";
import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { resetStaffPassword } from "@/lib/server/staff";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Geçici şifre üret (yalnız süper admin, kendi hesabı değil). Şifre yanıtta bir kez döner. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const actor = await requireStaff({ role: "ADMIN", super: true });
  const id = requireUuid((await params).id);
  await parseBody(request, z.object({}).strict());
  return ok(await resetStaffPassword(id, actor));
});
