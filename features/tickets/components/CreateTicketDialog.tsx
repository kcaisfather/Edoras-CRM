"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInstitutions } from "@/features/institutions";
import { useAssignees } from "@/features/tasks";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { TICKET_PRIORITIES, TICKET_SUBJECT_MAX, TICKET_TEXT_MAX, ticketCreateSchema, type TicketPriority } from "@/lib/domain/tickets/types";
import { useCreateTicket } from "../mutations";
import { TEXTAREA_CLASS } from "./TicketDetailDialog";

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Verilirse kurum sabittir (kurum sayfasından açılış). */
  institutionId?: string;
  onCreated?: (ticketId: string) => void;
}

/** "Yeni talep": ekip adına talep açar. Kayıt yalnız "Talebi aç" düğmesiyle yapılır. */
export function CreateTicketDialog({ open, onOpenChange, institutionId, onCreated }: Props) {
  const t = useTranslations("tickets.create");
  const tRoot = useTranslations("tickets");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const create = useCreateTicket();
  const institutions = useInstitutions();
  const { data: members = [] } = useAssignees(open);

  const [institution, setInstitution] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("NORMAL");
  const [assigneeId, setAssigneeId] = useState(NONE);
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Her açılışta formu sıfırla.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setInstitution(institutionId ?? "");
      setSubject("");
      setDescription("");
      setPriority("NORMAL");
      setAssigneeId(NONE);
      setRequesterName("");
      setRequesterEmail("");
      setRequesterPhone("");
      setError(null);
    }
  }

  const busy = create.isPending;
  const options = (institutions.data ?? []).map((i) => ({ value: i.id, label: i.name }));

  const submit = async () => {
    if (busy) return;
    const parsed = ticketCreateSchema.safeParse({
      institutionId: institution,
      subject,
      description,
      priority,
      assigneeId: assigneeId === NONE ? null : assigneeId,
      requesterName,
      requesterEmail,
      requesterPhone,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("error"));
      return;
    }
    setError(null);
    try {
      const ticket = await create.mutateAsync(parsed.data);
      toast.success(t("success"));
      onOpenChange(false);
      onCreated?.(ticket.id);
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!institutionId && (
            <div className="space-y-1.5">
              <Label htmlFor="tk-inst">{t("institution")}</Label>
              <Combobox id="tk-inst" value={institution} onChange={setInstitution} options={options} placeholder={t("institutionPlaceholder")} disabled={busy} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tk-subject">{t("subject")}</Label>
            <Input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={TICKET_SUBJECT_MAX} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-desc">{t("descriptionLabel")}</Label>
            <textarea id="tk-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={TICKET_TEXT_MAX} rows={4} disabled={busy} className={TEXTAREA_CLASS} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tk-prio">{t("priority")}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)} disabled={busy}>
                <SelectTrigger id="tk-prio"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{tRoot(`priority.${p}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-assignee">{t("assignee")}</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={busy}>
                <SelectTrigger id="tk-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{tRoot("page.unassigned")}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tk-rname">{t("requesterName")}</Label>
              <Input id="tk-rname" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} maxLength={100} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-remail">{t("requesterEmail")}</Label>
              <Input id="tk-remail" type="email" value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} maxLength={254} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-rphone">{t("requesterPhone")}</Label>
              <Input id="tk-rphone" type="tel" value={requesterPhone} onChange={(e) => setRequesterPhone(e.target.value)} maxLength={30} disabled={busy} />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{tCommon("cancel")}</Button>
          <Button onClick={() => void submit()} disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
