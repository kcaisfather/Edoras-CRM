"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { apiErrorCode } from "@/lib/api/errors";
import { normalizeTrPhone } from "@/lib/utils/phone";
import { demoEndDate, todayIso } from "@/lib/domain/institutions/rules";
import { newDemoSchema, type NewDemoInput } from "@/lib/domain/institutions/schemas";
import type { DemoCredentials } from "@/lib/domain/institutions/types";
import { useCreateDemo } from "../mutations";
import { formatDate, formatPhone, PROGRAM_LABEL } from "../format";
import { ChoiceField, ContactFields, TextField, applyServerFieldErrors } from "./fields";
import { CredentialsPanel } from "./CredentialsPanel";

const EMPTY: NewDemoInput = { institutionName: "", program: "yks", contactName: "", contactPhone: "", contactEmail: "" };

type Step = "form" | "review" | "done";

/**
 * Yeni demo kurum: form → özet onayı → giriş bilgisi. Onayla birlikte canlı Edoras'ta kurum ve kurum
 * yöneticisi hesabı açılır; bu yüzden ayrı bir onay adımı var. Kural: yetkili ad soyad, kurum adı,
 * telefon ve e-posta olmadan demo açılmaz (form + sunucu + veritabanı).
 *
 * CRM adayından açılırken (`features/crm`): `initial` formu adayın bilgileriyle doldurur, `submitRequest` isteği
 * adayın demo ucuna yollar (aday aynı işlemde yeni kuruma bağlanır), `onCreated` başarıdan sonra çağrılır.
 */
export function NewDemoDialog({
  open,
  onOpenChange,
  initial,
  submitRequest,
  onCreated,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<NewDemoInput>;
  submitRequest?: (input: NewDemoInput) => Promise<DemoCredentials>;
  onCreated?: (credentials: DemoCredentials) => void;
  /** Form adımındaki açıklamanın yerine (ör. "Aday bu kuruma bağlanacak"). */
  description?: string;
}) {
  const t = useTranslations("institutions.newDemo");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const create = useCreateDemo(submitRequest);
  const [step, setStep] = useState<Step>("form");
  const [credentials, setCredentials] = useState<DemoCredentials | null>(null);

  const form = useForm<NewDemoInput>({ resolver: zodResolver(newDemoSchema), defaultValues: { ...EMPTY, ...initial } });

  // Önceden doldurulmuş açılış (CRM adayı): her açılışta formu adayın güncel bilgisiyle başlat.
  const initialKey = open && initial ? JSON.stringify(initial) : null;
  useEffect(() => {
    if (initialKey) form.reset({ ...EMPTY, ...(JSON.parse(initialKey) as Partial<NewDemoInput>) });
  }, [initialKey, form]);

  const close = (next: boolean) => {
    if (!next && create.isPending) return;
    onOpenChange(next);
    if (!next) {
      // Kapanış animasyonu bitince temizle.
      setTimeout(() => {
        form.reset(EMPTY);
        create.reset();
        setStep("form");
        setCredentials(null);
      }, 200);
    }
  };

  const submit = () => {
    create.mutate(form.getValues(), {
      onSuccess: (data) => {
        setCredentials(data);
        setStep("done");
        onCreated?.(data);
      },
      onError: (err) => {
        const code = apiErrorCode(err);
        if (code === "EMAIL_TAKEN") form.setError("contactEmail", { message: t("emailTaken") });
        if (code === "INSTITUTION_NAME_TAKEN") form.setError("institutionName", { message: t("nameTaken") });
        if (applyServerFieldErrors(form, err) || code === "EMAIL_TAKEN" || code === "INSTITUTION_NAME_TAKEN") {
          setStep("form");
        }
      },
    });
  };

  const values = { ...EMPTY, ...useWatch({ control: form.control }) };
  const demoEnd = formatDate(demoEndDate(todayIso()));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            {step === "done" ? t("doneTitle") : t("title")}
          </DialogTitle>
          <DialogDescription>
            {step === "done" ? t("doneDescription") : (description ?? t("description"))}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <Form {...form}>
            <form id="new-demo-form" className="space-y-4" noValidate onSubmit={form.handleSubmit(() => setStep("review"))}>
              <TextField name="institutionName" label={t("institutionName")} placeholder={t("institutionNamePlaceholder")} />
              <ChoiceField<"yks" | "lgs">
                name="program"
                label={t("program")}
                options={[
                  { value: "yks", label: PROGRAM_LABEL.yks },
                  { value: "lgs", label: PROGRAM_LABEL.lgs },
                ]}
              />
              <ContactFields />
              <p className="text-xs text-muted-foreground">{t("rulesHint")}</p>
            </form>
          </Form>
        ) : null}

        {step === "review" ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <dt className="text-muted-foreground">{t("institutionName")}</dt>
              <dd className="font-medium">
                {values.institutionName.trim()} · {PROGRAM_LABEL[values.program]}
              </dd>
              <dt className="text-muted-foreground">{t("contact")}</dt>
              <dd>{values.contactName.trim()}</dd>
              <dt className="text-muted-foreground">{t("phone")}</dt>
              <dd>{formatPhone(normalizeTrPhone(values.contactPhone))}</dd>
              <dt className="text-muted-foreground">{t("login")}</dt>
              <dd className="font-medium">{values.contactEmail.trim().toLowerCase()}</dd>
              <dt className="text-muted-foreground">{t("demoEnds")}</dt>
              <dd>{demoEnd}</dd>
            </dl>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• {t("willCreateInstitution")}</li>
              <li>• {t("willCreateAdmin")}</li>
              <li>• {t("willNotDeactivate")}</li>
            </ul>
            {create.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage(create.error)}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {step === "done" && credentials ? <CredentialsPanel credentials={credentials} /> : null}

        <DialogFooter className="gap-2">
          {step === "form" ? (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" form="new-demo-form">
                {t("continue")}
              </Button>
            </>
          ) : null}
          {step === "review" ? (
            <>
              <Button variant="outline" onClick={() => setStep("form")} disabled={create.isPending}>
                <ArrowLeft />
                {tCommon("back")}
              </Button>
              <Button onClick={submit} disabled={create.isPending} aria-busy={create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                {create.isPending ? t("creating") : t("confirm")}
              </Button>
            </>
          ) : null}
          {step === "done" && credentials ? (
            <>
              <Link
                href={`/institutions/${credentials.institutionId}`}
                onClick={() => close(false)}
                className={buttonVariants({ variant: "outline" })}
              >
                <ExternalLink />
                {t("openInstitution")}
              </Link>
              <Button onClick={() => close(false)}>{tCommon("close")}</Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
