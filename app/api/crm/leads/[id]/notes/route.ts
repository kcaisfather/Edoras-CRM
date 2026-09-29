import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { noteSchema } from "@/lib/domain/crm/schemas";
import { createNote, listNotes } from "@/lib/server/crm-notes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await listNotes(id));
});

/** Not ekle (her CRM kullanıcısı). Yazar oturumdan yazılır. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  const { content } = await parseBody(request, noteSchema);
  return ok(await createNote(id, content, staff), 201);
});
