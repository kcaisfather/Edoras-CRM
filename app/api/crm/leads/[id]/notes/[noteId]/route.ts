import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { noteSchema } from "@/lib/domain/crm/schemas";
import { deleteNote, updateNote } from "@/lib/server/crm-notes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

/** Notu düzenle — yalnız yazan ya da ADMIN (403 NOTE_NOT_OWNER). */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const { id, noteId } = await params;
  const { content } = await parseBody(request, noteSchema);
  return ok(await updateNote(requireUuid(id), requireUuid(noteId), content, staff));
});

/** Notu sil — yalnız yazan ya da ADMIN. */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff();
  const { id, noteId } = await params;
  await deleteNote(requireUuid(id), requireUuid(noteId), staff);
  return ok({ ok: true });
});
