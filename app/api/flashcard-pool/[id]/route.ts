import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { flashcardDecisionSchema } from "@/lib/domain/flashcard-pool/schemas";
import { decideDeck } from "@/lib/server/flashcard-pool";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Desteyi onayla (isteğe bağlı çıkarılan kartlarla; en az 4 kart kalmalı) ya da reddet. Yalnız ADMIN. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await decideDeck(id, await parseBody(request, flashcardDecisionSchema), staff));
});
