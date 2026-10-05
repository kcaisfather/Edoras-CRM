"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Save, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { licenseListPriceSchema, type LicenseListPriceInput } from "@/lib/domain/institutions/schemas";
import { formatTry } from "@/lib/utils/money";
import { useUpdateLicensePricing } from "../mutations";
import { useLicensePricing } from "../queries";
import { formatDateTime } from "../format";
import { TextField, applyServerFieldErrors } from "./fields";

/**
 * Ayarlar → Lisans fiyatı (yalnız ADMIN): tek liste fiyatı. Satışta (ücretliye geçiş, kayda alma, yenileme) yalnız
 * indirim yüzdesi seçilir; bedel buradan hesaplanır. Değişiklik eski lisansları etkilemez (her lisans kendi satış
 * anındaki liste fiyatını saklar).
 */
export function LicensePricingPanel() {
  const t = useTranslations("institutions.pricing");
  const errorText = useApiErrorMessage();
  const query = useLicensePricing();
  const mutation = useUpdateLicensePricing();
  const form = useForm<LicenseListPriceInput>({ resolver: zodResolver(licenseListPriceSchema), defaultValues: { listPrice: "" } });
  const current = query.data?.listPrice ?? null;

  useEffect(() => {
    if (query.data) form.reset({ listPrice: current != null ? String(current).replace(".", ",") : "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const onSubmit = (values: LicenseListPriceInput) =>
    mutation.mutate(values, {
      onSuccess: () => toast.success(t("saved")),
      onError: (err) => {
        if (!applyServerFieldErrors(form, err)) toast.error(errorText(err));
      },
    });

  return (
    <Card className="glass-panel rounded-2xl overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
        </div>
        <p className="pt-2 text-sm text-muted-foreground">{t("description")}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {query.isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : query.isError ? (
          <QueryErrorState onRetry={() => void query.refetch()} />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3">
              <TextField
                name="listPrice"
                label={t("listPrice")}
                placeholder="Ör. 45.000"
                inputMode="decimal"
                className="w-full sm:w-64"
                description={
                  current != null && query.data?.updatedAt
                    ? t("current", { amount: formatTry(current), date: formatDateTime(query.data.updatedAt) })
                    : t("notSet")
                }
              />
              <Button type="submit" disabled={mutation.isPending} className="mb-[22px]">
                {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                {t("save")}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
