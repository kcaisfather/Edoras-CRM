"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyRound, Loader2, Power, UserPlus, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CoverageNote } from "@/components/ui/coverage-note";
import { InfoTip } from "@/components/ui/info-tip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PanelRole } from "@/lib/domain/auth/types";
import { useCurrentUser } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { formatRelativeTr } from "@/lib/utils/customer-signals";
import { cn } from "@/lib/utils";
import { PANEL_ROLES, displayName, staffChangeBlock, type StaffMember, type StaffStatus } from "@/lib/domain/staff/logic";
import { useResetStaffPassword, useUpdateStaff } from "../team/mutations";
import { useStaff } from "../team/queries";
import { CredentialsDialog, InviteDialog } from "./TeamDialogs";

type Pending =
  | { kind: "role"; user: StaffMember; next: PanelRole }
  | { kind: "status"; user: StaffMember; next: StaffStatus }
  | { kind: "reset"; user: StaffMember };

/**
 * Ayarlar → Ekip (DeepSportAdmin TeamPanel'den): CRM kullanıcıları, hesap açma, rol değiştirme, kapatma
 * ve şifre sıfırlama. Her yazma onay diyaloğundan geçer; kendi hesabı ve son aktif yönetici korunur
 * (arayüz + sunucu + veritabanı). E-posta gönderimi yok: geçici şifre bir kez gösterilir.
 */
export function TeamPanel() {
  const t = useTranslations("settingsx.team");
  const locale = useLocale();
  const errorMessage = useApiErrorMessage();
  const { data: me } = useCurrentUser();
  const users = useStaff();
  const list = users.data ?? [];

  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string | null } | null>(null);
  const update = useUpdateStaff();
  const reset = useResetStaffPassword();
  const busy = update.isPending || reset.isPending;

  const ask = (next: Pending) => {
    if (next.kind !== "reset") {
      const block = staffChangeBlock(
        next.user,
        next.kind === "role" ? { role: next.next } : { status: next.next },
        me?.id,
        list
      );
      if (block === "same") return;
      if (block) {
        toast.error(t(`blocks.${block}`));
        return;
      }
    }
    setPending(next);
  };

  const confirm = async () => {
    if (!pending) return;
    const name = displayName(pending.user);
    try {
      if (pending.kind === "role") {
        await update.mutateAsync({ id: pending.user.id, role: pending.next });
        toast.success(t("roleChanged", { name }));
      } else if (pending.kind === "status") {
        await update.mutateAsync({ id: pending.user.id, status: pending.next });
        toast.success(t(pending.next === "ACTIVE" ? "enabled" : "disabled", { name }));
      } else {
        const res = await reset.mutateAsync(pending.user.id);
        setCredentials({ email: pending.user.email, password: res.temporaryPassword });
      }
      setPending(null);
    } catch (err) {
      const fallback = pending.kind === "role" ? t("roleChangeError") : pending.kind === "status" ? t("statusError") : t("resetError");
      toast.error(errorMessage(err, fallback));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel rounded-2xl overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h2 className="min-w-0 text-lg font-bold">{t("title")}</h2>
            </div>
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus />
              {t("invite")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {users.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : users.isError ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{t("loadError")}</p>
              <Button variant="destructive-outline" size="sm" onClick={() => users.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("cols.name")}</TableHead>
                    <TableHead>{t("cols.email")}</TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        {t("cols.role")}
                        <InfoTip label={t("cols.role")}>
                          <span className="block space-y-1.5">
                            {PANEL_ROLES.map((r) => (
                              <span key={r} className="block">
                                <span className="font-medium">{t(`roles.${r}`)}:</span> {t(`roleHelp.${r}`)}
                              </span>
                            ))}
                          </span>
                        </InfoTip>
                      </span>
                    </TableHead>
                    <TableHead>{t("cols.status")}</TableHead>
                    <TableHead>{t("cols.lastLogin")}</TableHead>
                    <TableHead className="text-right">{t("cols.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((u) => {
                    const isMe = me?.id === u.id;
                    return (
                      <TableRow key={u.id} className={cn(u.status === "DISABLED" && "opacity-60")}>
                        <TableCell className="font-medium">
                          {displayName(u)}
                          {isMe && <span className="ml-2 text-xs text-muted-foreground">{t("you")}</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(v) => ask({ kind: "role", user: u, next: v as PanelRole })}
                            disabled={isMe}
                          >
                            <SelectTrigger className="h-8 w-48" aria-label={`${t("cols.role")}: ${displayName(u)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PANEL_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {t(`roles.${r}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{t(`status.${u.status}`)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.lastLoginAt ? formatRelativeTr(u.lastLoginAt, new Date(), locale) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {isMe ? null : (
                            <span className="inline-flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => ask({ kind: "reset", user: u })}
                                aria-label={`${t("resetPassword")}: ${displayName(u)}`}
                              >
                                <KeyRound />
                                {t("resetPassword")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => ask({ kind: "status", user: u, next: u.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })}
                                aria-label={`${u.status === "ACTIVE" ? t("disable") : t("enable")}: ${displayName(u)}`}
                              >
                                <Power />
                                {u.status === "ACTIVE" ? t("disable") : t("enable")}
                              </Button>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <CoverageNote>{t("securityNote")}</CoverageNote>
        </CardContent>
      </Card>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        existing={list}
        onCreated={(email, password) => setCredentials({ email, password })}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />

      <Dialog open={pending != null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "role"
                ? t("confirmRole.title")
                : pending?.kind === "status" && pending.next === "DISABLED"
                  ? t("confirmDisable.title")
                  : pending?.kind === "reset"
                    ? t("confirmReset.title")
                    : t("confirmEnable.title")}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "role" &&
                t("confirmRole.body", {
                  name: displayName(pending.user),
                  from: t(`roles.${pending.user.role}`),
                  to: t(`roles.${pending.next}`),
                })}
              {pending?.kind === "status" && pending.next === "DISABLED" && t("confirmDisable.body", { name: displayName(pending.user) })}
              {pending?.kind === "status" && pending.next === "ACTIVE" && t("confirmEnable.body", { name: displayName(pending.user) })}
              {pending?.kind === "reset" && t("confirmReset.body", { name: displayName(pending.user) })}
            </DialogDescription>
          </DialogHeader>
          {pending?.kind === "role" && pending.next === "CRM_AGENT" && (
            <p className="text-xs text-muted-foreground">{t("roleHelp.CRM_AGENT")}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              variant={pending?.kind === "status" && pending.next === "DISABLED" ? "destructive" : "default"}
              onClick={confirm}
              disabled={busy}
              aria-busy={busy}
            >
              {busy && <Loader2 className="animate-spin" />}
              {pending?.kind === "role"
                ? t("confirmRole.confirm")
                : pending?.kind === "reset"
                  ? t("confirmReset.confirm")
                  : pending?.kind === "status" && pending.next === "DISABLED"
                    ? t("confirmDisable.confirm")
                    : t("enable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
