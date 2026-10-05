import { ok, requireStaff, route } from "@/lib/api/server";
import { listCommitments } from "@/lib/server/renewal-commitments";

export const dynamic = "force-dynamic";

/** Yenileme taahhütleri (her CRM kullanıcısı). Geçerlilik (bitiş günü eşleşmesi) istemcide satırla değerlenir. */
export const GET = route(async () => {
  await requireStaff();
  return ok(await listCommitments());
});
