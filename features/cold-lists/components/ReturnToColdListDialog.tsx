"use client";

/**
 * "Soğuk listeye taşı" ("Sıcağa taşı"nın tersi). Aday SİLİNMEZ: "Satış olmadı" olur (kayıp nedeni zorunlu, aday statü
 * kuralı); kişi seçilen listeye "Aranmadı" olarak döner. Aday o listeden "Sıcağa taşı" ile geldiyse aynı satırın "CRM'e
 * taşındı" işareti kaldırılır, yoksa listeye yeni kişi eklenir. Satışı olmuş müşteri taşınmaz (sunucu 409
 * LEAD_IS_CUSTOMER; tekilde düğme / menü öğesi çizilmez, toplu işlemde atlanır).
 *  - Tek aday (aday paneli düğmesi, satırın İşlemler menüsü): POST /api/crm/leads/{id}/cold-list; liste varsayılanı
 *    adayın geldiği liste.
 *  - Toplu (Adaylar toplu işlem çubuğu, 2+ aday): POST /api/crm/leads/cold-list — tek liste, tek kayıp nedeni; 25'erli
 *    parçalarla sırayla, sonuç "N aday taşındı, M atlandı" (nedenleriyle).
 * crm → cold-lists bağımlılığı olmasın diye Adaylar ekranı bu parçaları yuvalarla alır (app/crm/_components/CrmScreen.tsx).
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
import { countSkipReasons } from "@/lib/domain/cold-lists/bulk-return";
import type { ProspectList } from "@/lib/domain/cold-lists/types";
import { LOST_REASONS, isLostReason, type CrmLead, type LostReason } from "@/lib/domain/crm/types";
import { getLeadTitle } from "@/lib/domain/crm/utils";
import { useReturnLeadToColdList, useReturnLeadsToColdList } from "../mutations";
import { useLeadOriginLists, useProspectLists } from "../queries";

/** Aday panelinin eylem satırı: tek aday (`renderSheetActions` yuvası). Müşteride çizilmez. */
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
      <ReturnToColdListDialog leads={[lead]} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Adaylar toplu işlem çubuğu: "Seçilenleri soğuk listeye taşı (N)" (`renderBulkActions` yuvası). `onDone` seçimi temizler. */
export function BulkReturnToColdListButton({ leads, onDone }: { leads: CrmLead[]; onDone: () => void }) {
  const t = useTranslations("growth.coldLists.returnToList");
  const [open, setOpen] = useState(false);
  if (leads.length === 0) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Snowflake />
        {t("bulkButton", { count: leads.length })}
      </Button>
      <ReturnToColdListDialog leads={leads} open={open} onOpenChange={setOpen} onDone={onDone} />
    </>
  );
}

/**
 * Pencere: tek aday → tekil uç (adayın geldiği liste önerilir); 2+ aday → toplu uç. İş sürerken kapanmaz. `onDone`
 * başarıdan (toplu işlemde kısmi başarıdan da) sonra çağrılır.
 */
export function ReturnToColdListDialog({
  leads,
  open,
  onOpenChange,
  onDone,
}: {
  leads: CrmLead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const t = useTranslations("growth.coldLists.returnToList");
  const [busy, setBusy] = useState(false);
  const bulk = leads.length > 1;
  const visible = open && leads.length > 0;
  const close = () => onOpenChange(false);
  const done = () => {
    close();
    onDone?.();
  };
  return (
    <Dialog open={visible} onOpenChange={(next) => (next || !busy) && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{bulk ? t("bulkTitle", { count: leads.length }) : t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {visible &&
          (bulk ? (
            <BulkForm leads={leads} onBusy={setBusy} onDone={done} onCancel={close} />
          ) : (
            <SingleForm lead={leads[0]} onBusy={setBusy} onDone={done} onCancel={close} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  onBusy: (busy: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}

/** Listeler en yeni üstte (Soğuk Listeler ekranındaki seçiciyle aynı). */
function useListsNewestFirst() {
  const lists = useProspectLists();
  return { ...lists, all: [...(lists.data ?? [])].reverse() };
}

function SingleForm({ lead, onBusy, onDone, onCancel }: FormProps & { lead: CrmLead }) {
  const t = useTranslations("growth.coldLists.returnToList");
  const errorText = useApiErrorMessage();
  const lists = useListsNewestFirst();
  const origin = useLeadOriginLists(lead.id);
  const send = useReturnLeadToColdList();
  const [pickedList, setPickedList] = useState<string | null>(null);
  const [reason, setReason] = useState<LostReason | "">(isLostReason(lead.lostReason) ? lead.lostReason : "");

  const originIds = new Set(origin.data?.listIds ?? []);
  // Varsayılan: adayın geldiği liste (varsa); kullanıcı seçince onunki.
  const listId = pickedList ?? lists.all.find((l) => originIds.has(l.id))?.id ?? "";
  const list = lists.all.find((l) => l.id === listId) ?? null;
  const busy = send.isPending;
  const loading = lists.isLoading || origin.isLoading;

  const submit = async () => {
    if (!list || !reason) return;
    onBusy(true);
    try {
      await send.mutateAsync({ leadId: lead.id, body: { listId: list.id, lostReason: reason } });
      toast.success(t("success", { name: getLeadTitle(lead).title, list: list.name }));
      onDone();
    } catch (e) {
      toast.error(t("failed", { error: errorText(e) }));
    } finally {
      onBusy(false);
    }
  };

  if (lists.isError) return <p className="text-sm text-destructive">{t("listsError")}</p>;
  if (!loading && lists.all.length === 0) return <p className="text-sm text-muted-foreground">{t("noLists")}</p>;

  return (
    <div className="min-w-0 space-y-4">
      <ReturnFields
        lists={lists.all}
        listId={listId}
        onList={setPickedList}
        originIds={originIds}
        reason={reason}
        onReason={setReason}
        disabled={busy}
        loading={loading}
        listHint={list ? (originIds.has(list.id) ? t("restoreNote") : t("newNote")) : null}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
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

function BulkForm({ leads, onBusy, onDone, onCancel }: FormProps & { leads: CrmLead[] }) {
  const t = useTranslations("growth.coldLists.returnToList");
  const errorText = useApiErrorMessage();
  const lists = useListsNewestFirst();
  const send = useReturnLeadsToColdList();
  const [listId, setListId] = useState("");
  // Seçimin hepsinde aynı kayıp nedeni varsa o önerilir.
  const [reason, setReason] = useState<LostReason | "">(() => {
    const first = leads[0]?.lostReason;
    return isLostReason(first) && leads.every((l) => l.lostReason === first) ? first : "";
  });

  const customers = leads.filter((l) => l.status === "SATIS_OLDU").length;
  const movable = leads.length - customers;
  const list = lists.all.find((l) => l.id === listId) ?? null;
  const busy = send.isPending;
  const progress = send.progress;

  const submit = async () => {
    if (!list || !reason || movable === 0) return;
    onBusy(true);
    try {
      const res = await send.mutateAsync({ leadIds: leads.map((l) => l.id), listId: list.id, lostReason: reason });
      if (res.skipped.length === 0) {
        toast.success(t("bulkSuccess", { count: res.moved, list: list.name }));
      } else {
        const detail = countSkipReasons(res.skipped)
          .map(({ reason: r, count }) => t(`skipReasons.${r}`, { count }))
          .join(" · ");
        toast.warning(t("bulkPartial", { moved: res.moved, skipped: res.skipped.length }), { description: detail });
      }
      onDone();
    } catch (e) {
      toast.error(t("failed", { error: errorText(e) }));
    } finally {
      onBusy(false);
    }
  };

  if (lists.isError) return <p className="text-sm text-destructive">{t("listsError")}</p>;
  if (!lists.isLoading && lists.all.length === 0) return <p className="text-sm text-muted-foreground">{t("noLists")}</p>;

  return (
    <div className="min-w-0 space-y-4">
      <ReturnFields
        lists={lists.all}
        listId={listId}
        onList={setListId}
        originIds={EMPTY_IDS}
        reason={reason}
        onReason={setReason}
        disabled={busy}
        loading={lists.isLoading}
        listHint={list ? t("bulkListNote") : null}
      />
      {customers > 0 && <p className="text-xs text-warning">{t("bulkCustomers", { count: customers })}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={busy || !list || !reason || movable === 0} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Snowflake />}
          {busy && progress ? t("bulkProgress", progress) : t("bulkConfirm", { count: movable })}
        </Button>
      </DialogFooter>
    </div>
  );
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** Liste + kayıp nedeni seçicileri (tekil ve toplu pencere ortak). */
function ReturnFields({
  lists,
  listId,
  onList,
  originIds,
  reason,
  onReason,
  disabled,
  loading,
  listHint,
}: {
  lists: ProspectList[];
  listId: string;
  onList: (id: string) => void;
  originIds: ReadonlySet<string>;
  reason: LostReason | "";
  onReason: (reason: LostReason | "") => void;
  disabled: boolean;
  loading: boolean;
  listHint: string | null;
}) {
  const t = useTranslations("growth.coldLists.returnToList");
  const tReasons = useTranslations("crm.offer.reasons");
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="return-cold-list">{t("list")}</Label>
        <Select value={listId} onValueChange={onList} disabled={disabled || loading}>
          <SelectTrigger id="return-cold-list" className="w-full">
            <SelectValue placeholder={t("listPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} ({l.prospectCount}){originIds.has(l.id) ? ` · ${t("origin")}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {listHint && <p className="text-xs text-muted-foreground">{listHint}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="return-lost-reason">{t("lostReason")}</Label>
        <Select value={reason} onValueChange={(v) => onReason(isLostReason(v) ? v : "")} disabled={disabled}>
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
    </>
  );
}
