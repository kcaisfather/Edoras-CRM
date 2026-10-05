import { apiRequest } from "@/lib/api/client";
import type { NotificationsDto } from "@/lib/domain/notifications/logic";

export const notificationsApi = {
  get: (signal?: AbortSignal) => apiRequest<NotificationsDto>("/api/crm/notifications", { signal }),
};
