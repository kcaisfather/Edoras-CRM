"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";

/**
 * Kurum işlemlerinin ortak form penceresi: başlık, alanlar, sunucu hatası kutusu, İptal / Gönder.
 * İşlem sürerken pencere kapanmaz (yarım kalan istek sanılmasın).
 */
export function FormDialog<T extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  form,
  onSubmit,
  submitLabel,
  pending,
  error,
  wide,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  form: UseFormReturn<T>;
  onSubmit: (values: T) => void;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const formId = useId();

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className={wide ? "max-h-[90vh] overflow-y-auto sm:max-w-2xl" : "max-h-[90vh] overflow-y-auto sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Form {...form}>
          <form id={formId} className="space-y-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
            {children}
          </form>
        </Form>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={pending} aria-busy={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
