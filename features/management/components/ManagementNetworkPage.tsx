"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DesktopTable, MobileCard, MobileCardList, SearchBox } from "@/components/list";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import {
  KCA_CONTACT_STATUSES,
  KCA_LIMITS,
  kcaContactCreateSchema,
  kcaContactPatchSchema,
  type KcaContactDto,
  type KcaContactPatchInput,
  type KcaContactStatus,
} from "@/lib/domain/kca/types";
import { cn } from "@/lib/utils";
import { useCreateKcaContact, useDeleteKcaContact, usePatchKcaContact } from "../mutations";
import { useKcaContacts } from "../queries";
import { ManagementGate } from "./ManagementGate";
import { Field, Pill, ProjectBadge, ProjectSelect, ProjectTabs, TEXTAREA_CLASS, formatDay, matchesQuery, useReadySession } from "./shared";

const ALL = "__all__";
type StatusFilter = KcaContactStatus | "late" | typeof ALL;

const STATUS_TONE: Record<KcaContactStatus, "amber" | "sky" | "emerald"> = { todo: "amber", followup: "sky", done: "emerald" };

type FormValues = {
  name: string;
  organization: string;
  referral: string;
  projectId: number | null;
  action: string;
  nextDate: string;
  status: KcaContactStatus;
  phone: string;
  email: string;
  notes: string;
};

function valuesOf(c: KcaContactDto | null, defaultProject: number | null): FormValues {
  return {
    name: c?.name ?? "",
    organization: c?.organization ?? "",
    referral: c?.referral ?? "",
    projectId: c?.projectId ?? defaultProject,
    action: c?.action ?? "",
    nextDate: c?.nextDate ?? "",
    status: c?.status ?? "todo",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    notes: c?.notes ?? "",
  };
}

/** Kişi formu (yeni / düzenle). Kişi KCA Panel'deki networküne yazılır; yalnız sahibi görür. */
function ContactPanel({ contact, open, onOpenChange }: { contact: KcaContactDto | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("management.network.form");
  const tc = useTranslations("management.common");
  const ts = useTranslations("management.contactStatus");
  const errorMessage = useApiErrorMessage();
  const session = useReadySession();
  const create = useCreateKcaContact();
  const patch = usePatchKcaContact();
  const remove = useDeleteKcaContact();
  const projects = session.projects.filter((p) => !p.archived || p.id === contact?.projectId);
  const root = projects.find((p) => p.parentId === null) ?? projects[0];
  const [v, setV] = useState<FormValues>(() => valuesOf(contact, root?.id ?? null));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = create.isPending || patch.isPending || remove.isPending;
  const set = <K extends keyof FormValues>(key: K) => (value: FormValues[K]) => setV((x) => ({ ...x, [key]: value }));
  // Kişinin firması kişinin görmediği bir Edoras projesiyse (KCA Panel'de üyelik kalkmış) seçenek listesine eklenir.
  const options = contact && !projects.some((p) => p.id === contact.projectId)
    ? [...projects, { id: contact.projectId, name: contact.projectName, color: contact.projectColor, parentId: null, archived: false, canCreateTasks: false, canEditDueDates: false }]
    : projects;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    try {
      if (contact) {
        const before = valuesOf(contact, null);
        const raw: KcaContactPatchInput = {};
        for (const k of Object.keys(v) as (keyof FormValues)[]) {
          if (v[k] !== before[k]) (raw as Record<string, unknown>)[k] = v[k];
        }
        if (!Object.keys(raw).length) {
          onOpenChange(false);
          return;
        }
        const parsed = kcaContactPatchSchema.safeParse(raw);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? tc("error"));
          return;
        }
        setError(null);
        await patch.mutateAsync({ id: contact.id, body: parsed.data });
        toast.success(t("updated"));
      } else {
        const parsed = kcaContactCreateSchema.safeParse(v);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? tc("error"));
          return;
        }
        setError(null);
        await create.mutateAsync(parsed.data);
        toast.success(t("created"));
      }
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, tc("error")));
    }
  };

  const doDelete = async () => {
    if (!contact) return;
    try {
      await remove.mutateAsync(contact.id);
      setConfirmDelete(false);
      onOpenChange(false);
      toast.success(tc("deleted"));
    } catch (err) {
      toast.error(errorMessage(err, tc("error")));
    }
  };

  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent size="lg">
        <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
          <SidePanelHeader>
            <SidePanelTitle>{contact ? t("editTitle") : t("newTitle")}</SidePanelTitle>
            <SidePanelDescription>{t("description")}</SidePanelDescription>
          </SidePanelHeader>
          <div className="flex-1 space-y-3">
            <Field label={t("name")} htmlFor="nc-name">
              <Input id="nc-name" value={v.name} onChange={(e) => set("name")(e.target.value)} maxLength={KCA_LIMITS.contactName} disabled={busy} autoFocus={!contact} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("organization")} htmlFor="nc-org">
                <Input id="nc-org" value={v.organization} onChange={(e) => set("organization")(e.target.value)} maxLength={KCA_LIMITS.contactOrganization} disabled={busy} />
              </Field>
              <Field label={t("referral")} htmlFor="nc-ref">
                <Input id="nc-ref" value={v.referral} onChange={(e) => set("referral")(e.target.value)} maxLength={KCA_LIMITS.contactReferral} disabled={busy} />
              </Field>
              <Field label={t("project")} htmlFor="nc-project">
                <ProjectSelect id="nc-project" projects={options} value={v.projectId} onChange={set("projectId")} disabled={busy} />
              </Field>
              <Field label={t("status")} htmlFor="nc-status">
                <Select value={v.status} onValueChange={(x) => set("status")(x as KcaContactStatus)} disabled={busy}>
                  <SelectTrigger id="nc-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KCA_CONTACT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ts(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label={t("action")} htmlFor="nc-action">
              <Input id="nc-action" value={v.action} onChange={(e) => set("action")(e.target.value)} maxLength={KCA_LIMITS.contactAction} disabled={busy} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("nextDate")} htmlFor="nc-next">
                <Input id="nc-next" type="date" value={v.nextDate} onChange={(e) => set("nextDate")(e.target.value)} disabled={busy} />
              </Field>
              <Field label={t("phone")} htmlFor="nc-phone">
                <Input id="nc-phone" type="tel" value={v.phone} onChange={(e) => set("phone")(e.target.value)} maxLength={KCA_LIMITS.contactPhone} disabled={busy} />
              </Field>
              <Field label={t("email")} htmlFor="nc-email">
                <Input id="nc-email" type="email" value={v.email} onChange={(e) => set("email")(e.target.value)} maxLength={KCA_LIMITS.contactEmail} disabled={busy} />
              </Field>
            </div>
            <Field label={t("notes")} htmlFor="nc-notes">
              <textarea id="nc-notes" className={TEXTAREA_CLASS} rows={4} value={v.notes} onChange={(e) => set("notes")(e.target.value)} maxLength={KCA_LIMITS.contactNotes} disabled={busy} />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <SidePanelFooter>
            {contact && (
              <Button type="button" variant="destructive-outline" className="sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 />
                {tc("delete")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !v.name.trim() || !v.projectId} aria-busy={busy}>
              {(create.isPending || patch.isPending) && <Loader2 className="animate-spin" />}
              {t("submit")}
            </Button>
          </SidePanelFooter>
        </form>
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{tc("deleteTitle")}</DialogTitle>
              <DialogDescription>{tc("deleteContactBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                {tc("cancel")}
              </Button>
              <Button variant="destructive" onClick={doDelete} disabled={remove.isPending}>
                {remove.isPending && <Loader2 className="animate-spin" />}
                {tc("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidePanelContent>
    </SidePanel>
  );
}

/** Satırdaki hızlı durum seçimi. */
function StatusCell({ contact }: { contact: KcaContactDto }) {
  const ts = useTranslations("management.contactStatus");
  const tc = useTranslations("management.common");
  const tn = useTranslations("management.network");
  const errorMessage = useApiErrorMessage();
  const patch = usePatchKcaContact();
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={contact.status}
        onValueChange={(v) =>
          patch.mutate({ id: contact.id, body: { status: v as KcaContactStatus } }, { onError: (err) => toast.error(errorMessage(err, tc("error"))) })
        }
        disabled={patch.isPending}
      >
        <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={tn("col.status")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KCA_CONTACT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {ts(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NetworkBoard({ onEdit }: { onEdit: (c: KcaContactDto) => void }) {
  const t = useTranslations("management.network");
  const ts = useTranslations("management.contactStatus");
  const tg = useTranslations("management.gate");
  const session = useReadySession();
  const query = useKcaContacts();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const today = session.today;
  const contacts = useMemo(() => query.data ?? [], [query.data]);
  const isLate = (c: KcaContactDto) => c.status !== "done" && !!c.nextDate && c.nextDate < today;

  const tabs = useMemo(() => {
    const out = [...session.projects];
    for (const c of contacts) {
      if (!out.some((p) => p.id === c.projectId)) out.push({ id: c.projectId, name: c.projectName, color: c.projectColor, parentId: null, archived: false, canCreateTasks: false, canEditDueDates: false });
    }
    return out;
  }, [session.projects, contacts]);
  const projectById = useMemo(() => new Map(tabs.map((p) => [p.id, p])), [tabs]);

  const filtered = contacts.filter((c) => {
    if (status === "late" && !isLate(c)) return false;
    if (status !== "late" && status !== ALL && c.status !== status) return false;
    return matchesQuery(q, c.name, c.organization, c.referral, c.action, c.notes, c.projectName, c.phone, c.email);
  });
  const counts = new Map<number, number>();
  for (const c of filtered) counts.set(c.projectId, (counts.get(c.projectId) ?? 0) + 1);
  const rows = projectId === null ? filtered : filtered.filter((c) => c.projectId === projectId || projectById.get(c.projectId)?.parentId === projectId);
  const open = contacts.filter((c) => c.status !== "done").length;

  return (
    <div className="space-y-3">
      <ProjectTabs projects={tabs} counts={counts} value={projectId} onChange={setProjectId} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t("searchPlaceholder")} />
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
            {KCA_CONTACT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ts(s)}
              </SelectItem>
            ))}
            <SelectItem value="late">{t("late")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{t("count", { count: contacts.length, open })}</span>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : query.isError ? (
        <div className="space-y-2 rounded-2xl border border-border p-6 text-sm">
          <p className="text-destructive">{tg("error")}</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            {tg("retry")}
          </Button>
        </div>
      ) : (
        <>
          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.name")}</TableHead>
                  <TableHead>{t("col.organization")}</TableHead>
                  <TableHead>{t("col.referral")}</TableHead>
                  <TableHead>{t("col.project")}</TableHead>
                  <TableHead className="min-w-[200px]">{t("col.action")}</TableHead>
                  <TableHead className="w-[100px]">{t("col.next")}</TableHead>
                  <TableHead className="w-[140px]">{t("col.status")}</TableHead>
                  <TableHead>{t("col.contact")}</TableHead>
                  <TableHead>{t("col.source")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((c) => (
                    <TableRow key={c.id} className={cn("cursor-pointer", c.status === "done" && "opacity-60")} onClick={() => onEdit(c)}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm">{c.organization ?? ""}</TableCell>
                      <TableCell className="text-sm">{c.referral ?? ""}</TableCell>
                      <TableCell>
                        <ProjectBadge name={c.projectName} color={c.projectColor} />
                      </TableCell>
                      <TableCell className="max-w-[280px] text-sm">
                        <span className="line-clamp-2" title={c.notes ?? c.action ?? ""}>
                          {c.action ?? ""}
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-sm tabular-nums", isLate(c) && "font-medium text-destructive")}>{formatDay(c.nextDate)}</TableCell>
                      <TableCell>
                        <StatusCell contact={c} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[c.phone, c.email].filter(Boolean).map((x) => (
                          <div key={x}>{x}</div>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.source ?? ""}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DesktopTable>
          <MobileCardList empty={rows.length === 0}>
            {rows.map((c) => (
              <button key={c.id} type="button" className="block w-full text-left" onClick={() => onEdit(c)}>
                <MobileCard className={cn(c.status === "done" && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Pill tone={STATUS_TONE[c.status]}>{ts(c.status)}</Pill>
                  </div>
                  {c.action && <p className="text-sm">{c.action}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {c.organization && <span>{c.organization}</span>}
                    <ProjectBadge name={c.projectName} color={c.projectColor} className="text-xs" />
                    <span className={cn(isLate(c) && "font-medium text-destructive")}>{formatDay(c.nextDate)}</span>
                  </div>
                </MobileCard>
              </button>
            ))}
          </MobileCardList>
        </>
      )}
    </div>
  );
}

function NetworkContent({ creating, setCreating }: { creating: boolean; setCreating: (open: boolean) => void }) {
  const [editing, setEditing] = useState<KcaContactDto | null>(null);
  return (
    <>
      <NetworkBoard onEdit={setEditing} />
      {editing && <ContactPanel key={editing.id} contact={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
      {creating && <ContactPanel contact={null} open onOpenChange={setCreating} />}
    </>
  );
}

function NewContactButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("management.network");
  const session = useReadySession();
  if (!session.projects.some((p) => !p.archived)) return null;
  return (
    <Button onClick={onClick}>
      <Plus />
      {t("new")}
    </Button>
  );
}

/** Network (/management/network): kişinin KENDİ networkündeki Edoras firmalı kişiler (KCA Panel'deki gibi kişiye özel). */
export function ManagementNetworkPage() {
  const t = useTranslations("management.network");
  const [creating, setCreating] = useState(false);
  return (
    <ManagementGate title={t("title")} description={t("description")} actions={<NewContactButton onClick={() => setCreating(true)} />}>
      <NetworkContent creating={creating} setCreating={setCreating} />
    </ManagementGate>
  );
}
