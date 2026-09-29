"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InstitutionStatusBadge, formatPhone, programLabel } from "@/features/institutions";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { buildLeadIndex } from "@/lib/domain/crm/signals";
import type { CrmLead, CrmStatus } from "@/lib/domain/crm/types";
import { formatCrmDate, splitFullName } from "@/lib/domain/crm/utils";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import { useCreateCrmLead } from "../mutations";
import { CrmContactMenu } from "./CrmContactMenu";

type Range = "14" | "30" | "all";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Kurumun CRM durumuna göre yeni adayın statüsü: demodaysa Demo Tanımlandı, ücretliyse Takipte. */
function initialStatus(inst: InstitutionListItem): CrmStatus {
  if (inst.crm?.status === "DEMO") return "DEMO_TANIMLANDI";
  if (inst.crm?.status === "UCRETLI") return "TAKIPTE";
  return "ARANACAK";
}

/**
 * Yeni kayıtlar (G21): Edoras'ta açılmış ama CRM'de adayı olmayan kurumlar, en yeni önce. İç / sunum
 * kurumları ve Edoras'ta olmayan kayıtlar hariç. "Aday oluştur" kurumun adı ve yetkilisiyle bağlı aday açar.
 */
export function CrmNewSignups({
  leads,
  institutions,
  isLoading,
  isError,
}: {
  leads: CrmLead[];
  institutions: InstitutionListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const t = useTranslations("crm.signups");
  const errorMessage = useApiErrorMessage();
  const [range, setRange] = useState<Range>("30");
  const createLead = useCreateCrmLead();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  // Aralığın başlangıcı yalnız aralık değişince hesaplanır (render sırasında saat okunmaz).
  const [since, setSince] = useState<number | null>(() => Date.now() - 30 * DAY_MS);

  const changeRange = (next: Range) => {
    setRange(next);
    setSince(next === "all" ? null : Date.now() - Number(next) * DAY_MS);
  };

  const rows = useMemo(() => {
    const index = buildLeadIndex(leads);
    return (institutions ?? [])
      .filter((i) => !i.isInternal && !i.missingInEdoras && !index.has(i.id))
      .filter((i) => since == null || (i.createdAt != null && Date.parse(i.createdAt) >= since))
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "") || a.name.localeCompare(b.name, "tr"));
  }, [institutions, leads, since]);

  const handleCreate = (inst: InstitutionListItem) => {
    const { firstName, lastName } = splitFullName(inst.crm?.contactName);
    setCreatingId(inst.id);
    createLead.mutate(
      {
        organizationName: inst.name,
        contactFirstName: firstName,
        contactLastName: lastName,
        contactEmail: inst.crm?.contactEmail ?? "",
        contactPhone: inst.crm?.contactPhone ?? "",
        status: initialStatus(inst),
        source: "EDORAS",
        institutionId: inst.id,
      },
      {
        onSuccess: () => toast.success(t("created")),
        onError: (err) => toast.error(errorMessage(err, t("createError"))),
        onSettled: () => setCreatingId(null),
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<Range>
          value={range}
          onValueChange={changeRange}
          aria-label={t("rangeLabel")}
          options={[
            { value: "14", label: t("last14") },
            { value: "30", label: t("last30") },
            { value: "all", label: t("all") },
          ]}
        />
        {!isLoading && !isError && <span className="text-sm text-muted-foreground">{t("count", { count: rows.length })}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{t("coverage")}</p>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : isError ? (
        <p className="text-sm text-destructive">{t("error")}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/60">
          <Table className="min-w-max [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40">
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.signedUp")}</TableHead>
                <TableHead>{t("table.institution")}</TableHead>
                <TableHead>{t("table.contact")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell className="tabular-nums">{formatCrmDate(inst.createdAt ? Date.parse(inst.createdAt) : null)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <Link href={`/institutions/${inst.id}`} className="font-medium hover:underline">
                        {inst.name}
                      </Link>
                      {inst.program ? (
                        <span className="rounded border border-border px-1.5 text-[10px] font-semibold text-muted-foreground">
                          {programLabel(inst.program)}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    {inst.crm ? (
                      <span className="flex flex-col">
                        <span>{inst.crm.contactName}</span>
                        <span className="text-xs text-muted-foreground">{formatPhone(inst.crm.contactPhone)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <InstitutionStatusBadge item={inst} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {inst.crm && (
                        <CrmContactMenu
                          target={{ leadId: null, phone: inst.crm.contactPhone, email: inst.crm.contactEmail, name: inst.crm.contactName, organization: inst.name }}
                          templates={["welcome", "demoWelcome"]}
                        />
                      )}
                      <Button variant="outline" size="sm" disabled={createLead.isPending} onClick={() => handleCreate(inst)}>
                        {creatingId === inst.id ? <Loader2 className="animate-spin" /> : <UserPlus />}
                        {t("createLead")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
