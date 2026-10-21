"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Info, MessagesSquare, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBox } from "@/components/list";
import { QueryErrorState } from "@/components/query-error-state";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { foldTr } from "@/lib/domain/institutions/search";
import {
  MESSAGING_SCOPES,
  type MessagingScope,
  type TeacherMessagingRow,
} from "@/lib/domain/institutions/messaging-permissions";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import { useSetMessagingSetting, useSetTeacherMessagingScope } from "../mutations";
import { useInstitutionMessaging, useInstitutionPanelModules } from "../queries";
import { SectionCard } from "./detail-cards";

/**
 * Edoras mesajlaşma yetkileri — yalnız kurumda Mesajlaşma modülü AÇIKKEN çizilir (Edoras paneli de modül kapalıyken
 * bu ayarları göstermez). Üç sohbet türü + yeni mesaj bildirimi kurum anahtarı; öğretmenlerin "Velilerle mesajlaşma"
 * kapsamı pencerede. Edoras panelindeki ayar ekranı ve Yetkiler ile AYNI satırları yazar (kurum yöneticisi de
 * değiştirebilir; son yazan geçerli). Yalnız ADMIN değiştirir; diğer personel görür.
 */
export function MessagingPermissionsCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.messaging");
  const { isAdmin } = usePermissions();
  const errorText = useApiErrorMessage();
  const inEdoras = !institution.missingInEdoras;
  const modules = useInstitutionPanelModules(institution.id, inEdoras);
  const moduleOn = !!modules.data?.some((module) => module.key === "messaging" && module.enabled);
  const query = useInstitutionMessaging(institution.id, inEdoras && moduleOn);
  const settingMutation = useSetMessagingSetting(institution.id);
  const [teachersOpen, setTeachersOpen] = useState(false);

  if (!inEdoras || !moduleOn) return null;
  // Modül anahtarı az önce kapandıysa uç boş döner; kart da kaybolur.
  if (query.data && !query.data.moduleEnabled) return null;

  const teacherParentOn = query.data?.settings.find((setting) => setting.key === "messaging_teacher_parent")?.enabled ?? true;

  return (
    <SectionCard icon={MessagesSquare} title={t("title")}>
      {query.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : query.isError ? (
        <QueryErrorState onRetry={() => query.refetch()} />
      ) : query.data ? (
        <div className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("settingsTitle")}</h3>
            <ul className="space-y-3">
              {query.data.settings.map((setting) => {
                const pending = settingMutation.isPending && settingMutation.variables?.key === setting.key;
                const inputId = `messaging-setting-${setting.key}`;
                return (
                  <li key={setting.key} className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <Checkbox
                      id={inputId}
                      className="mt-0.5"
                      checked={setting.enabled}
                      disabled={!isAdmin || settingMutation.isPending}
                      onCheckedChange={(checked) =>
                        settingMutation.mutate(
                          { key: setting.key, enabled: checked === true },
                          {
                            onSuccess: () =>
                              toast.success(
                                t(checked === true ? "settingOnToast" : "settingOffToast", { name: t(`settings.${setting.key}.label`) })
                              ),
                            onError: (e) => toast.error(errorText(e)),
                          }
                        )
                      }
                    />
                    <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {t(`settings.${setting.key}.label`)}
                        <StateBadge on={setting.enabled} label={pending ? t("saving") : setting.enabled ? t("on") : t("off")} />
                      </span>
                      <span className="block text-xs text-muted-foreground">{t(`settings.${setting.key}.description`)}</span>
                      {setting.isDefault ? <span className="block text-[11px] text-muted-foreground">{t("defaultOn")}</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("teachersTitle")}</h3>
            <TeacherSummary teachers={query.data.teachers} />
            {!teacherParentOn ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                {t("teacherParentOff")}
              </p>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setTeachersOpen(true)} disabled={!query.data.teachers.length}>
              <UsersRound />
              {isAdmin ? t("editTeachers") : t("viewTeachers")}
            </Button>
          </div>
        </div>
      ) : null}
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {isAdmin ? t("note") : t("adminOnly")}
      </p>
      {query.data ? (
        <TeachersDialog
          institutionId={institution.id}
          teachers={query.data.teachers}
          canEdit={isAdmin}
          open={teachersOpen}
          onOpenChange={setTeachersOpen}
        />
      ) : null}
    </SectionCard>
  );
}

function StateBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={
        on
          ? "rounded bg-primary/10 px-1.5 text-[11px] font-semibold text-primary"
          : "rounded border border-border px-1.5 text-[11px] font-semibold text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}

/** Kapsam dağılımı (Kapalı / Atanan / Kurum) + rolden farklı ayarlanmış öğretmen sayısı. */
function TeacherSummary({ teachers }: { teachers: TeacherMessagingRow[] }) {
  const t = useTranslations("institutions.detail.messaging");
  if (!teachers.length) return <p className="text-xs text-muted-foreground">{t("noTeachers")}</p>;
  const counts = Object.fromEntries(MESSAGING_SCOPES.map((scope) => [scope, 0])) as Record<MessagingScope, number>;
  let overridden = 0;
  for (const teacher of teachers) {
    counts[teacher.scope] += 1;
    if (teacher.overridden) overridden += 1;
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {MESSAGING_SCOPES.map((scope) => (
          <span key={scope} className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs">
            <span className="text-muted-foreground">{t(`scopes.${scope}`)}:</span>{" "}
            <span className="font-semibold tabular-nums">{counts[scope]}</span>
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("teacherCount", { count: teachers.length })}
        {overridden ? ` · ${t("overriddenCount", { count: overridden })}` : ""}
      </p>
    </div>
  );
}

/**
 * Öğretmen başına "Velilerle mesajlaşma" kapsamı. Rolün verdiği değere dönülürse Edoras'ta özel ayar silinir (öğretmen
 * yeniden rolünü izler) — "Rol varsayılanı" / "Özel" rozeti bunu gösterir.
 */
function TeachersDialog({
  institutionId,
  teachers,
  canEdit,
  open,
  onOpenChange,
}: {
  institutionId: string;
  teachers: TeacherMessagingRow[];
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("institutions.detail.messaging");
  const errorText = useApiErrorMessage();
  const mutation = useSetTeacherMessagingScope(institutionId);
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const needle = foldTr(q.trim());
    if (!needle) return teachers;
    return teachers.filter((teacher) => foldTr(`${teacher.fullName} ${teacher.branch ?? ""}`).includes(needle));
  }, [teachers, q]);

  const scopeOptions = MESSAGING_SCOPES.map((scope) => ({ value: scope, label: t(`scopes.${scope}`), disabled: !canEdit }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <SearchBox value={q} onChange={setQ} placeholder={t("search")} />
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {visible.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">{t("noMatch")}</li>
          ) : (
            visible.map((teacher) => {
              const pending = mutation.isPending && mutation.variables?.institutionUserId === teacher.institutionUserId;
              return (
                <li
                  key={teacher.institutionUserId}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold">{teacher.fullName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[
                        teacher.branch,
                        t("presetLine", { preset: teacher.presetName ?? t("noPreset"), scope: t(`scopes.${teacher.presetScope}`) }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      {pending ? t("saving") : teacher.overridden ? t("overridden") : t("followsPreset")}
                    </span>
                  </div>
                  <SegmentedControl
                    aria-label={t("scopeAria", { name: teacher.fullName })}
                    value={teacher.scope}
                    options={scopeOptions.map((option) => ({ ...option, disabled: option.disabled || mutation.isPending }))}
                    onValueChange={(scope) => {
                      if (scope === teacher.scope) return;
                      mutation.mutate(
                        { institutionUserId: teacher.institutionUserId, scope },
                        {
                          onSuccess: () => toast.success(t("scopeToast", { name: teacher.fullName, scope: t(`scopes.${scope}`) })),
                          onError: (e) => toast.error(errorText(e)),
                        }
                      );
                    }}
                    className="shrink-0 self-start sm:self-auto"
                  />
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
