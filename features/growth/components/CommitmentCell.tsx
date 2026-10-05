"use client";

/**
 * Yenileme Radarı hücresi: kurumun yenileme niyeti (Yenileyecek / Kararsız / Yenilemeyecek ya da taahhüt yok) seçicisi ve
 * kısa not. Taahhüt satırın bitiş gününe verilir (lisans yenilenip bitiş değişince geçersiz sayılır). Satır tıklaması
 * (kurum sayfası) tetiklenmesin diye olaylar durdurulur. Yazım: PUT/DELETE /api/crm/renewals/commitments/{id}.
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { formatRelativeTr } from "@/lib/utils/customer-signals";
import { cn } from "@/lib/utils";
import { COMMITMENT_NOTE_MAX, RENEWAL_COMMITMENTS, type RenewalCommitment, type RenewalCommitmentDto } from "@/lib/domain/growth/commitments";
import type { RenewalRow } from "@/lib/domain/growth/renewals";
import { useSetRenewalCommitment } from "../queries";

const NONE = "NONE";
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export const COMMITMENT_TONE: Record<RenewalCommitment, string> = {
  WILL_RENEW: "text-success",
  UNDECIDED: "text-warning",
  WILL_CHURN: "text-destructive",
};

export function CommitmentCell({ row, commitment }: { row: RenewalRow; commitment: RenewalCommitmentDto | null }) {
  const t = useTranslations("growth.renewals.radar");
  const locale = useLocale();
  const errorMessage = useApiErrorMessage();
  const set = useSetRenewalCommitment();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const name = row.customer.name;

  const change = async (value: string) => {
    try {
      await set.mutateAsync({
        institutionId: row.customer.id,
        input: value === NONE ? null : { cycleEnd: row.endsOn, status: value as RenewalCommitment, note: commitment?.note ?? null },
      });
      toast.success(t(value === NONE ? "cleared" : "saved"));
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  const saveNote = async () => {
    if (!commitment) return;
    try {
      await set.mutateAsync({ institutionId: row.customer.id, input: { cycleEnd: row.endsOn, status: commitment.status, note: note.trim() || null } });
      toast.success(t("saved"));
      setNoteOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  return (
    <span className="inline-flex items-center gap-1" onClick={stop} onKeyDown={stop}>
      <Select value={commitment?.status ?? NONE} onValueChange={change} disabled={set.isPending}>
        <SelectTrigger
          className={cn("h-8 w-40", commitment && COMMITMENT_TONE[commitment.status])}
          aria-label={t("select", { name })}
          title={commitment ? t("updatedBy", { name: commitment.updatedByName ?? "—", date: formatRelativeTr(new Date(commitment.updatedAt).toISOString(), new Date(), locale) }) : t("hint")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("none")}</SelectItem>
          {RENEWAL_COMMITMENTS.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`commitments.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {commitment && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`${t("edit")}: ${name}`}
          title={commitment.note ?? t("edit")}
          onClick={() => {
            setNote(commitment.note ?? "");
            setNoteOpen(true);
          }}
        >
          <StickyNote className={cn(commitment.note ? "text-primary" : "text-muted-foreground")} />
        </Button>
      )}
      <Dialog open={noteOpen} onOpenChange={(o) => !o && !set.isPending && setNoteOpen(false)}>
        <DialogContent onClick={stop}>
          <DialogHeader>
            <DialogTitle>{t("noteTitle")}</DialogTitle>
            <DialogDescription>{t("noteDescription", { name })}</DialogDescription>
          </DialogHeader>
          <textarea
            className="flex min-h-[88px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={COMMITMENT_NOTE_MAX}
            placeholder={t("notePlaceholder")}
            aria-label={t("noteTitle")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)} disabled={set.isPending}>
              {t("noteCancel")}
            </Button>
            <Button onClick={saveNote} disabled={set.isPending} aria-busy={set.isPending}>
              {set.isPending && <Loader2 className="animate-spin" />}
              {t("noteSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
