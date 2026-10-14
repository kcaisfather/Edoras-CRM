import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { kcaMeetingCreateSchema } from "@/lib/domain/kca/types";
import { kcaCreateMeeting, kcaListMeetings } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

/**
 * Toplantı notları: Edoras firmalı ve kişinin gördüğü notlar (kendi notları + proje ekibiyle paylaşılanlar). KCA Panel'de,
 * WhatsApp'tan ya da Claude'a "#toplantı" ile yazılanlar da buraya düşer (firması Edoras ise).
 */
export const GET = route(async () => {
  const staff = await requireStaff();
  return ok(await kcaListMeetings(staff));
});

/** Yeni toplantı notu (sahibi oturumdaki kişinin KCA hesabı; firma Edoras projelerinden). → not ayrıntısı. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await kcaCreateMeeting(staff, await parseBody(request, kcaMeetingCreateSchema)), 201);
});
