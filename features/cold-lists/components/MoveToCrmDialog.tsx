"use client";

/**
 * "Sıcağa taşı" (DeepSport MoveToCrmDialog): soğuk liste kişisinden CRM adayı oluşturur — tek uç
 * POST /api/crm/prospects/{id}/convert (aday + isteğe bağlı not + kişinin taşındı işareti tek transaction; DeepSport'ta
 * bayrak kapalıyken aday, not ve işaret ayrı isteklerdi). Aynı telefon / e-posta CRM'de varsa açık onay ister.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Flame, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhone } from "@/features/institutions";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { isCrmStatus } from "@/lib/domain/crm/types";
import type { ExistingContact } from "@/lib/import/duplicates";
import { MOVE_STATUSES, type MoveStatus, type Prospect } from "@/lib/domain/cold-lists/types";
import { convertNoteText, hasLeadIdentity, prospectName, prospectTitle } from "@/lib/domain/cold-lists/utils";
import { useConvertProspect } from "../mutations";

export function MoveToCrmDialog({
  prospect,
  crmMatches,
  onOpenChange,
}: {
  prospect: Prospect | null;
  crmMatches: ExistingContact[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("growth.coldLists.move");
  return (
    <Dialog open={!!prospect} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {prospect && <MoveForm key={prospect.id} prospect={prospect} crmMatches={crmMatches} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({ prospect: p, crmMatches, onDone }: { prospect: Prospect; crmMatches: ExistingContact[]; onDone: () => void }) {
  const t = useTranslations("growth.coldLists.move");
  const tStatus = useTranslations("crm.status");
  const errorText = useApiErrorMessage();
  const convert = useConvertProspect();
  const [status, setStatus] = useState<MoveStatus>(p.outcome === "TALKED" ? "TAKIPTE" : "ARANACAK");
  const [ackDuplicate, setAckDuplicate] = useState(false);
  const noteText = convertNoteText(p);
  const [addNote, setAddNote] = useState(!!noteText);
  const identity = hasLeadIdentity(p);
  const blocked = !identity || (crmMatches.length > 0 && !ackDuplicate);

  const submit = async () => {
    try {
      await convert.mutateAsync({ id: p.id, body: { status, addNote: addNote && !!noteText } });
      toast.success(t("success", { name: prospectTitle(p) }));
      onDone();
    } catch (e) {
      toast.error(t("failed", { error: errorText(e) }));
    }
  };

  const rows: [string, string][] = [
    [t("fields.name"), prospectName(p) || "—"],
    [t("fields.organization"), p.organization || "—"],
    [t("fields.phone"), p.phone ? formatPhone(p.phone) : p.phoneRaw || "—"],
    [t("fields.email"), p.email ?? (p.emailRaw || "—")],
    [t("fields.location"), [p.city, p.district].filter(Boolean).join(" / ") || "—"],
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor="move-status">{t("status")}</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as MoveStatus)} disabled={convert.isPending}>
          <SelectTrigger id="move-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOVE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {tStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {noteText && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={addNote} onCheckedChange={(v) => setAddNote(v === true)} className="mt-0.5" />
          <span>
            {t("addNote")}
            <span className="block text-xs text-muted-foreground">{noteText}</span>
          </span>
        </label>
      )}

      {!identity && <p className="text-sm text-destructive">{t("noIdentity")}</p>}
      {p.phoneRaw && !p.phone && <p className="text-xs text-warning">{t("invalidPhone")}</p>}

      {crmMatches.length > 0 && (
        <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t("duplicate", { count: crmMatches.length })}
          </p>
          <ul className="text-xs">
            {crmMatches.slice(0, 5).map((m) => (
              <li key={`${m.source}:${m.id}`}>
                {m.name}
                {m.organization && m.organization !== m.name ? ` (${m.organization})` : ""}
                {m.context && isCrmStatus(m.context) ? ` · ${tStatus(m.context)}` : ""}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={ackDuplicate} onCheckedChange={(v) => setAckDuplicate(v === true)} />
            {t("ackDuplicate")}
          </label>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("writeNote")}</p>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={convert.isPending}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={convert.isPending || blocked} aria-busy={convert.isPending}>
          {convert.isPending ? <Loader2 className="animate-spin" /> : <Flame />}
          {t("confirm")}
        </Button>
      </DialogFooter>
    </div>
  );
}
