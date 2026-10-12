"use client";

/**
 * "Soğuk listeye geri gönder" ("Sıcağa taşı"nın tersi; aday panelinin eylem satırı) — uç
 * POST /api/crm/leads/{id}/cold-list. Aday SİLİNMEZ: "Satış olmadı" olur (kayıp nedeni zorunlu, aday statü kuralı);
 * kişi seçilen listeye "Aranmadı" olarak döner. Aday o listeden "Sıcağa taşı" ile geldiyse aynı satırın "CRM'e taşındı"
 * işareti kaldırılır, yoksa listeye yeni kişi eklenir. Satışı olmuş müşteride düğme çizilmez (sunucu da 409 verir).
 * crm → cold-lists bağımlılığı olmasın diye panel bu parçayı `renderSheetActions` yuvasıyla alır
 * (app/crm/_components/CrmScreen.tsx).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { LOST_REASONS, isLostReason, type CrmLead, type LostReason } from "@/lib/domain/crm/types";
import { getLeadTitle } from "@/lib/domain/crm/utils";
import { useReturnLeadToColdList } from "../mutations";
import { useLeadOriginLists, useProspectLists } from "../queries";

export function ReturnToColdListAction({ lead }: { lead: CrmLead }) {
  const t = useTranslations("growth.coldLists.returnToList");
  const [open, setOpen] = useState(false);
  if (lead.status === "SATIS_OLDU") return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Snowflake />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          {open && <ReturnForm lead={lead} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReturnForm({ lead, onDone }: { lead: CrmLead; onDone: () => void }) {
  const t = useTranslations("growth.coldLists.returnToList");
  const tReasons = useTranslations("crm.offer.reasons");
  const errorText = useApiErrorMessage();
  const lists = useProspectLists();
  const origin = useLeadOriginLists(lead.id);
  const send = useReturnLeadToColdList();
  const [pickedList, setPickedList] = useState<string | null>(null);
  const [reason, setReason] = useState<LostReason | "">(isLostReason(lead.lostReason) ? lead.lostReason : "");

  const allLists = [...(lists.data ?? [])].reverse(); // en yeni üstte (Soğuk Listeler ekranındaki seçiciyle aynı)
  const originIds = new Set(origin.data?.listIds ?? []);
  // Varsayılan: adayın geldiği liste (varsa); kullanıcı seçince onunki.
  const listId = pickedList ?? allLists.find((l) => originIds.has(l.id))?.id ?? "";
  const list = allLists.find((l) => l.id === listId) ?? null;
  const busy = send.isPending;
  const loading = lists.isLoading || origin.isLoading;

  const submit = async () => {
    if (!list || !reason) return;
    try {
      await send.mutateAsync({ leadId: lead.id, body: { listId: list.id, lostReason: reason } });
      toast.success(t("success", { name: getLeadTitle(lead).title, list: list.name }));
      onDone();
    } catch (e) {
      toast.error(t("failed", { error: errorText(e) }));
    }
  };

  if (lists.isError) return <p className="text-sm text-destructive">{t("listsError")}</p>;
  if (!loading && allLists.length === 0) return <p className="text-sm text-muted-foreground">{t("noLists")}</p>;

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="return-cold-list">{t("list")}</Label>
        <Select value={listId} onValueChange={setPickedList} disabled={busy || loading}>
          <SelectTrigger id="return-cold-list" className="w-full">
            <SelectValue placeholder={t("listPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {allLists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} ({l.prospectCount}){originIds.has(l.id) ? ` · ${t("origin")}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {list && <p className="text-xs text-muted-foreground">{originIds.has(list.id) ? t("restoreNote") : t("newNote")}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="return-lost-reason">{t("lostReason")}</Label>
        <Select value={reason} onValueChange={(v) => setReason(isLostReason(v) ? v : "")} disabled={busy}>
          <SelectTrigger id="return-lost-reason" className="w-full">
            <SelectValue placeholder={t("lostReasonPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {LOST_REASONS.map((r) => (
              <SelectItem key={r} value={r}>
                {tReasons(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={busy || !list || !reason} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Snowflake />}
          {t("confirm")}
        </Button>
      </DialogFooter>
    </div>
  );
}
