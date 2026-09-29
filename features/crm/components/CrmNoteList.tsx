"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser, usePermissions } from "@/features/auth";
import { useDeleteCrmNote, useUpdateCrmNote } from "@/features/crm-notes";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { CrmNote } from "@/lib/domain/crm-notes/types";
import {
  PROGRAM_TAGS,
  buildNoteContent,
  isComplaintTag,
  latestDissatisfaction,
  parseNoteContent,
  type ProgramTag,
} from "@/lib/domain/crm-notes/utils";
import { formatCrmDate } from "@/lib/domain/crm/utils";

export const TEXTAREA_CLASS =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y";

/** Notun yapılandırılmış önekinin okunur özeti ("Şikâyet kaydı · Ödeme · Yüksek · Açık" gibi). */
function useTagLine() {
  const tNotes = useTranslations("crm.notes");
  const tDis = useTranslations("crm.dissatisfied");
  const tHand = useTranslations("crm.handoff");
  const tProg = useTranslations("crm.program");
  return (note: CrmNote): string | null => {
    const parsed = parseNoteContent(note.content);
    if (!parsed.tag) return null;
    let line = tNotes(`tag.${parsed.tag}`);
    const dis = isComplaintTag(parsed.tag) ? latestDissatisfaction([note]) : null;
    if (dis) line += ` · ${tDis(`category.${dis.category}`)} · ${tDis(`severity.${dis.severity}`)} · ${tDis(`status.${dis.status}`)}`;
    if (parsed.tag === "DEVIR" && parsed.args[0]) line += ` · ${tHand("followUp")}: ${formatCrmDate(parsed.args[0])}`;
    if (parsed.tag === "ILETISIM" && parsed.args[0]) line += ` · ${parsed.args.filter(Boolean).join(" / ")}`;
    if (parsed.tag === "PROGRAM") {
      const tags = parsed.args.filter((a): a is ProgramTag => (PROGRAM_TAGS as readonly string[]).includes(a));
      if (tags.length) line += ` · ${tags.map((a) => tProg(a)).join(" · ")}`;
    }
    return line;
  };
}

/**
 * Aday notları listesi (yeniden eskiye). Düzenle / sil yalnız notu yazana ve yöneticiye görünür (sunucu da
 * denetler: NOTE_NOT_OWNER). Düzenlemede önek korunur, yalnız gövde değişir.
 */
export function CrmNoteList({ leadId, notes, onChanged }: { leadId: string; notes: CrmNote[]; onChanged?: (note: CrmNote) => void }) {
  const tNotes = useTranslations("crm.notes");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const tagLine = useTagLine();
  const { data: me } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const updateNote = useUpdateCrmNote();
  const deleteNote = useDeleteCrmNote();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canModify = (note: CrmNote) => isAdmin || (!!me?.id && note.authorId === me.id);

  const saveEdit = (note: CrmNote) => {
    const parsed = parseNoteContent(note.content);
    const next = parsed.tag ? buildNoteContent(parsed.tag, parsed.args, editText) : editText.trim();
    if (!next) return;
    updateNote.mutate(
      { leadId, noteId: note.id, content: next },
      {
        onSuccess: () => {
          setEditingId(null);
          onChanged?.(note);
        },
        onError: (err) => toast.error(errorMessage(err, tNotes("error"))),
      }
    );
  };

  const removeNote = (note: CrmNote) => {
    deleteNote.mutate(
      { leadId, noteId: note.id },
      {
        onSuccess: () => {
          setConfirmDeleteId(null);
          onChanged?.(note);
        },
        onError: (err) => toast.error(errorMessage(err, tNotes("deleteError"))),
      }
    );
  };

  return (
    <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
      {notes.map((note) => {
        const parsed = parseNoteContent(note.content);
        const line = tagLine(note);
        const editing = editingId === note.id;
        const edited = note.updatedAt != null && note.createdAt != null && note.updatedAt - note.createdAt > 1000;
        return (
          <li key={note.id} className="group border-b border-border pb-2 text-sm last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {formatCrmDate(note.createdAt)} · {note.authorName ?? tNotes("unknownAuthor")}
                {edited ? ` · ${tNotes("edited")}` : ""}
              </span>
              {!editing && canModify(note) && (
                <span className="flex gap-0.5">
                  {confirmDeleteId === note.id ? (
                    <>
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        className="h-6 px-2"
                        disabled={deleteNote.isPending}
                        onClick={() => removeNote(note)}
                      >
                        {tCommon("delete")}
                      </Button>
                      <Button variant="ghost" size="icon-xs" className="h-6 w-6" aria-label={tCommon("cancel")} onClick={() => setConfirmDeleteId(null)}>
                        <X />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="h-6 w-6"
                        aria-label={tCommon("edit")}
                        title={tCommon("edit")}
                        onClick={() => {
                          setEditingId(note.id);
                          setEditText(parsed.body);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="h-6 w-6"
                        aria-label={tCommon("delete")}
                        title={tCommon("delete")}
                        onClick={() => setConfirmDeleteId(note.id)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </span>
              )}
            </div>
            {line && <span className="mt-1 inline-block text-[11px] font-medium text-muted-foreground">{line}</span>}
            {editing ? (
              <div className="mt-1 space-y-1.5">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className={TEXTAREA_CLASS}
                  aria-label={tCommon("edit")}
                />
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button size="sm" disabled={updateNote.isPending} aria-busy={updateNote.isPending} onClick={() => saveEdit(note)}>
                    {updateNote.isPending ? (
                      <>
                        <Loader2 className="animate-spin" />
                        {tCommon("saving")}
                      </>
                    ) : (
                      tCommon("save")
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              parsed.body && <p className="mt-1 whitespace-pre-wrap break-words">{parsed.body}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
