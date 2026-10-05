"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import {
  TICKET_SUBJECT_MAX,
  TICKET_TEXT_MAX,
  publicTicketSchema,
} from "@/lib/domain/tickets/types";
import { usePublicTicketPage, useSubmitPublicTicket } from "../public";

const TEXTAREA_CLASS =
  "flex min-h-[120px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

const statusOf = (err: unknown): number | null => (err instanceof ApiError ? err.status : null);

/** Kenar çubuğu / başlık olmadan ortalanmış kart — müşterinin gördüğü tek ekran. */
function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("tickets.public");
  return (
    <div className="min-h-screen w-full bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <p className="mb-4 text-center text-sm font-semibold tracking-wide text-primary">{t("brand")}</p>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">{children}</div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{t("privacy")}</p>
      </div>
    </div>
  );
}

function Message({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="text-primary [&_svg]:h-10 [&_svg]:w-10">{icon}</div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

type Field = "subject" | "description" | "name" | "email" | "phone";

/**
 * Herkese açık destek formu (/t/[token]) — oturum yok, panel kabuğu yok (lib/permissions.ts → CUSTOMER_PUBLIC_PATHS).
 * Veri yalnız /api/public/tickets/* uçlarından (çerezsiz). Kurum token'dan belirlenir; sayfa yalnız kurum adını gösterir.
 */
export function PublicTicketPage({ token }: { token: string }) {
  const t = useTranslations("tickets.public");
  const query = usePublicTicketPage(token);
  const submit = useSubmitPublicTicket(token);

  const [values, setValues] = useState({ subject: "", description: "", name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [number, setNumber] = useState<number | null>(null);

  if (query.isLoading) {
    return (
      <Shell>
        <div className="space-y-4 py-2" aria-busy="true" aria-label={t("loading")}>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </Shell>
    );
  }

  if (number !== null) {
    return (
      <Shell>
        <Message icon={<CheckCircle2 />} title={t("doneTitle", { number })} body={t("doneBody")} />
      </Shell>
    );
  }

  if (query.isError || !query.data) {
    const status = statusOf(query.error);
    return (
      <Shell>
        {status === 429 ? (
          <Message icon={<Clock />} title={t("invalidTitle")} body={t("rateLimitedBody")} />
        ) : (
          <Message icon={<LinkIcon />} title={t("invalidTitle")} body={status === 404 ? t("invalidBody") : t("errorBody")} />
        )}
      </Shell>
    );
  }

  const set = (key: Field) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return;
    const parsed = publicTicketSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    submit.mutate(parsed.data, { onSuccess: (res) => setNumber(res.number) });
  };

  const failedStatus = submit.isError ? statusOf(submit.error) : null;
  const failedMessage = !submit.isError ? null : failedStatus === 429 ? t("rateLimitedBody") : failedStatus === 400 || failedStatus === 422 ? t("fieldsError") : failedStatus === 404 ? t("invalidBody") : t("submitError");
  const busy = submit.isPending;

  return (
    <Shell>
      <div className="mb-6 space-y-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("title", { institution: query.data.institutionName })}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tk-subject">{t("subject")}</Label>
          <Input id="tk-subject" value={values.subject} onChange={(e) => set("subject")(e.target.value)} maxLength={TICKET_SUBJECT_MAX} disabled={busy} aria-invalid={!!errors.subject || undefined} />
          {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tk-description">{t("description")}</Label>
          <textarea
            id="tk-description"
            value={values.description}
            onChange={(e) => set("description")(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            maxLength={TICKET_TEXT_MAX}
            rows={5}
            disabled={busy}
            className={TEXTAREA_CLASS}
          />
          {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tk-name">{t("name")}</Label>
          <Input id="tk-name" value={values.name} onChange={(e) => set("name")(e.target.value)} maxLength={100} autoComplete="name" disabled={busy} aria-invalid={!!errors.name || undefined} />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tk-email">{t("email")}</Label>
            <Input id="tk-email" type="email" value={values.email} onChange={(e) => set("email")(e.target.value)} maxLength={254} autoComplete="email" disabled={busy} aria-invalid={!!errors.email || undefined} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-phone">{t("phone")}</Label>
            <Input id="tk-phone" type="tel" value={values.phone} onChange={(e) => set("phone")(e.target.value)} maxLength={30} autoComplete="tel" disabled={busy} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("contactHint")}</p>
        {failedMessage && (
          <p role="alert" className="text-sm text-destructive">
            {failedMessage}
          </p>
        )}
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("submit")}
        </Button>
      </form>
    </Shell>
  );
}
