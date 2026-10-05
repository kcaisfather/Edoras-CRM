import { ok, requireStaff, route } from "@/lib/api/server";
import { getNotifications } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/**
 * Bildirim zili (her CRM kullanıcısı): çağıranın gecikmiş görevleri, yaklaşan randevuları, yeni anket yanıtları ve
 * 7 gün içinde biten lisans / demolar. Saklanmaz, her istekte türetilir; tutar ve iletişim bilgisi taşımaz.
 */
export const GET = route(async () => {
  const staff = await requireStaff();
  return ok(await getNotifications(staff));
});
