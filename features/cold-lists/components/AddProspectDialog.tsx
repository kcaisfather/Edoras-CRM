"use client";

/**
 * "Kişi ekle": seçili soğuk listeye TEK kişiyi elle ekler (içe aktarmanın tek satırlık karşılığı) — uç
 * POST /api/crm/prospect-lists/{id}/prospects. Kurallar şemada (lib/domain/cold-lists/schemas.ts → prospectCreateSchema):
 * en az bir kimlik alanı, geçerli telefon / e-posta; normalize değerleri sunucu hesaplar. Aynı listede aynı telefon /
 * e-posta → PROSPECT_DUPLICATE.
 */
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { IMPORT_FIELD_LIMITS } from "@/lib/import/bulk";
import { prospectCreateSchema, type ProspectCreateValues } from "@/lib/domain/cold-lists/schemas";
import type { ProspectList } from "@/lib/domain/cold-lists/types";
import { prospectTitle } from "@/lib/domain/cold-lists/utils";
import { useCreateProspect } from "../mutations";

type Field = keyof ProspectCreateValues;

const EMPTY: ProspectCreateValues = {
  firstName: "",
  lastName: "",
  organization: "",
  phoneRaw: "",
  emailRaw: "",
  city: "",
  district: "",
  branch: "",
  note: "",
};

const TEXTAREA_CLASS =
  "flex min-h-[72px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

/** Araç çubuğundaki "Kişi ekle" düğmesi + penceresi (liste seçili değilse çizilmez). */
export function AddProspectButton({ list }: { list: ProspectList | null }) {
  const t = useTranslations("growth.coldLists.add");
  const [open, setOpen] = useState(false);
  if (!list) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { list: list.name })}</DialogDescription>
          </DialogHeader>
          {open && <AddProspectForm listId={list.id} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddProspectForm({ listId, onDone }: { listId: string; onDone: () => void }) {
  const t = useTranslations("growth.coldLists.add");
  const errorText = useApiErrorMessage();
  const create = useCreateProspect();
  const [values, setValues] = useState<ProspectCreateValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const busy = create.isPending;

  const set = (field: Field, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    // Alanın kendi hatası ve kimlik uyarısı (herhangi bir kimlik alanı doldurulunca düzelebilir) temizlenir.
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      delete next.organization;
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = prospectCreateSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined;
        if (!field || next[field]) continue;
        next[field] =
          field === "phoneRaw" ? t("invalidPhone") : field === "emailRaw" ? t("invalidEmail") : field === "organization" ? t("identityHint") : issue.message;
      }
      setErrors(next);
      return;
    }
    try {
      const prospect = await create.mutateAsync({ listId, body: parsed.data });
      toast.success(t("success", { name: prospectTitle(prospect) }));
      onDone();
    } catch (err) {
      toast.error(t("failed", { error: errorText(err) }));
    }
  };

  const input = (field: Exclude<Field, "note">, opts: { type?: string; autoComplete?: string; inputMode?: "tel" | "email" } = {}) => {
    const id = `cold-add-${field}`;
    const labelKey = field === "phoneRaw" ? "phone" : field === "emailRaw" ? "email" : field;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t(`fields.${labelKey}`)}</Label>
        <Input
          id={id}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          autoComplete={opts.autoComplete ?? "off"}
          value={values[field]}
          maxLength={IMPORT_FIELD_LIMITS[field]}
          onChange={(e) => set(field, e.target.value)}
          disabled={busy}
          aria-invalid={!!errors[field]}
          aria-describedby={errors[field] ? `${id}-error` : undefined}
        />
        {errors[field] && (
          <p id={`${id}-error`} className="text-xs text-destructive">
            {errors[field]}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="min-w-0 space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {input("firstName")}
        {input("lastName")}
        <div className="sm:col-span-2">{input("organization")}</div>
        {input("phoneRaw", { type: "tel", inputMode: "tel" })}
        {input("emailRaw", { type: "email", inputMode: "email" })}
        {input("city")}
        {input("district")}
        <div className="sm:col-span-2">{input("branch")}</div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cold-add-note">{t("fields.note")}</Label>
          <textarea
            id="cold-add-note"
            className={TEXTAREA_CLASS}
            value={values.note}
            maxLength={IMPORT_FIELD_LIMITS.note}
            onChange={(e) => set("note", e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      {!errors.organization && <p className="text-xs text-muted-foreground">{t("identityHint")}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
