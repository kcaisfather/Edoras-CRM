/** CRM rolü (public.crm_staff.role). ADMIN her şeyi yapar; CRM_AGENT tutar görmez, ücretliye geçiremez. */
export type PanelRole = "ADMIN" | "CRM_AGENT";

/** GET /api/auth/me yanıtı. */
export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: PanelRole;
  /** Süper admin (tek kurucu): ekip / rol yönetimi yalnız bunda. Her zaman ADMIN. */
  isSuper: boolean;
}
