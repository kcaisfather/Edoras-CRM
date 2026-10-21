import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { teacherMessagingScopeSchema } from "@/lib/domain/institutions/messaging-permissions";
import { setTeacherMessagingScope } from "@/lib/server/messaging-permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Tek öğretmenin "Velilerle mesajlaşma" kapsamı — yalnız ADMIN. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await setTeacherMessagingScope(id, await parseBody(request, teacherMessagingScopeSchema), staff));
});
