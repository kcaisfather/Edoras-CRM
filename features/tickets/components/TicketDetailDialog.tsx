"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssignees } from "@/features/tasks";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TEXT_MAX, type TicketPatchInput, type TicketPriority, type TicketStatus } from "@/lib/domain/tickets/types";
import { useAddTicketNote, usePatchTicket } from "../mutations";
import { useTicket } from "../queries";

export const TEXTAREA_CLASS =
  "flex min-h-[72px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

const NONE = "__none__";

/** Talep ayrıntısı: durum / öncelik / sorumlu anında kaydedilir; ekip notları yalnız ekibe görünür. */
export function TicketDetailDialog({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const t = useTranslations("tickets");
  const errorMessage = useApiErrorMessage();
  const query = useTicket(ticketId);
  const patch = usePatchTicket(ticketId ?? "");
  const addNote = useAddTicketNote(ticketId ?? "");
  const { data: members = [] } = useAssignees(!!ticketId);
  const [note, setNote] = useState("");
  const ticket = query.data;

  const save = async (body: TicketPatchInput) => {
    try {
      await patch.mutateAsync(body);
      toast.success(t("detail.updated"));
    } catch (err) {
      toast.error(errorMessage(err, t("detail.error")));
    }
  };

  const submitNote = async () => {
    const body = note.trim();
    if (!body || addNote.isPending) return;
    try {
      await addNote.mutateAsync(body);
      setNote("");
      toast.success(t("detail.noteAdded"));
    } catch (err) {
      toast.error(errorMessage(err, t("detail.error")));
    }
  };

  const requester = ticket ? [ticket.requesterName, ticket.requesterEmail, ticket.requesterPhone].filter(Boolean).join(" · ") : "";

  return (
    <Dialog open={!!ticketId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        {query.isLoading && <Skeleton className="h-48 w-full rounded-lg" />}
        {query.isError && <p className="text-sm text-destructive">{t("detail.loadError")}</p>}
        {ticket && (
          <>
            <DialogHeader>
              <DialogTitle>{t("detail.title", { number: ticket.number })}</DialogTitle>
              <DialogDescription>
                <span className="block font-medium text-foreground">{ticket.subject}</span>
                {ticket.institutionName} · {t("detail.createdAt", { date: formatCrmDate(ticket.createdAt) })} · {t(`source.${ticket.source}`)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">{t("detail.status")}</span>
                <Select value={ticket.status} onValueChange={(v) => void save({ status: v as TicketStatus })} disabled={patch.isPending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">{t("detail.priority")}</span>
                <Select value={ticket.priority} onValueChange={(v) => void save({ priority: v as TicketPriority })} disabled={patch.isPending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{t(`priority.${p}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">{t("detail.assignee")}</span>
                <Select
                  value={ticket.assigneeId ?? NONE}
                  onValueChange={(v) => void save({ assigneeId: v === NONE ? null : v })}
                  disabled={patch.isPending}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("page.unassigned")}</SelectItem>
                    {ticket.assigneeId && !members.some((m) => m.id === ticket.assigneeId) && (
                      <SelectItem value={ticket.assigneeId}>{ticket.assigneeName ?? ticket.assigneeId}</SelectItem>
                    )}
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-medium">{t("detail.requester")}</p>
              <p className="text-muted-foreground">{requester || t("detail.noRequester")}</p>
            </div>

            <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
              {ticket.description || <span className="text-muted-foreground">{t("detail.descriptionEmpty")}</span>}
            </p>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("detail.notesTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("detail.notesHint")}</p>
              {ticket.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("detail.noteEmpty")}</p>
              ) : (
                <ul className="space-y-2">
                  {ticket.notes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-border p-2.5 text-sm">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {n.authorName ?? "-"} · {formatCrmDate(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("detail.notePlaceholder")}
                maxLength={TICKET_TEXT_MAX}
                rows={3}
                disabled={addNote.isPending}
                className={TEXTAREA_CLASS}
              />
              <Button size="sm" onClick={() => void submitNote()} disabled={!note.trim() || addNote.isPending}>
                {addNote.isPending && <Loader2 className="animate-spin" />}
                {t("detail.addNote")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
