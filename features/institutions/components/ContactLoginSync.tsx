"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/auth";
import { isReservedLoginDomain } from "@/lib/domain/institutions/edoras-accounts";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import { normalizeEmail } from "@/lib/utils/phone";
import { useChangeAdminEmail } from "../admin-accounts";

/**
 * Yetkili bilgisi penceresi ↔ Edoras girişi (yalnız ADMIN). Demo açılırken yetkili e-postası kurum yöneticisinin
 * Edoras giriş adresi olur; yetkili e-postası sonradan değişince giriş adresi eskide kalıyordu. Eski yetkili e-postası
 * bir yöneticinin (e-postayla giren, süper olmayan) giriş adresiyse ve e-posta değiştiyse "Panel giriş e-postasını da
 * güncelle" çıkar (varsayılan işaretli). Yetkili kaydı başarılı olunca yönetici e-posta ucu çağrılır; o patlarsa yetkili
 * değişikliği kalır, hata ayrı bildirilir.
 */
export function useContactLoginSync(institution: InstitutionDetail, contactEmail: string | undefined) {
  const { isAdmin } = usePermissions();
  const [checked, setChecked] = useState(true);
  const mutation = useChangeAdminEmail(institution.id);

  const oldEmail = normalizeEmail(institution.crm?.contactEmail);
  const nextEmail = normalizeEmail(contactEmail);
  const admin =
    isAdmin && oldEmail
      ? (institution.admins.find((a) => a.loginKind === "email" && !a.isSuperAdmin && normalizeEmail(a.email) === oldEmail) ?? null)
      : null;
  const eligible = !!admin && !!nextEmail && nextEmail !== oldEmail && !isReservedLoginDomain(nextEmail);

  return {
    admin,
    eligible,
    checked,
    setChecked,
    /** Gönderim anındaki karar: giriş adresi taşınacak yöneticinin kimliği ya da null. */
    targetUserId: eligible && checked && admin ? admin.userId : null,
    isPending: mutation.isPending,
    reset: () => {
      setChecked(true);
      mutation.reset();
    },
    sync: (userId: string, email: string) => mutation.mutateAsync({ userId, input: { email } }),
  };
}

export type ContactLoginSync = ReturnType<typeof useContactLoginSync>;

export function ContactLoginSyncField({ sync }: { sync: ContactLoginSync }) {
  const t = useTranslations("institutions.adminAccounts");
  if (!sync.eligible || !sync.admin) return null;
  const id = "contact-login-sync";
  const others = sync.admin.otherMembershipCount;
  return (
    <div className="space-y-1.5 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={sync.checked} onCheckedChange={(v) => sync.setChecked(v === true)} />
        <Label htmlFor={id}>{t("contactSync.label")}</Label>
      </div>
      <p className="text-xs text-muted-foreground">{t("contactSync.hint", { name: sync.admin.fullName ?? sync.admin.email ?? "—" })}</p>
      {others > 0 ? <p className="text-xs text-warning">{t("otherMemberships", { count: others })}</p> : null}
    </div>
  );
}
