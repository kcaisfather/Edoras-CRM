"use client";

import { useTranslations } from "next-intl";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/features/auth";
import { STORED_STATUSES } from "@/lib/domain/crm/signals";
import { LEAD_SOURCES } from "@/lib/domain/crm/types";
import { CRM_VIEWS, FINANCIAL_VIEWS, type CrmQuickTab } from "@/lib/domain/crm/views";
import { PAGE_SIZES } from "../hooks";

/**
 * Tablo araç satırı: tek süzgeç listesi ("Tümü" + Görünümler ?tab= + Durumlar ?status= + Kaynaklar ?source=; aynı anda
 * biri seçili, seçilince diğerleri temizlenir), arama, sayfa boyutu; sağda tek "Yeni aday".
 */
export function CrmListToolbar({
  quickTab,
  statusFilter,
  sourceFilter,
  onQuickTab,
  onStatus,
  onSource,
  showListControls,
  search,
  onSearch,
  onClearSearch,
  pageSize,
  onPageSize,
  onAdd,
}: {
  quickTab: CrmQuickTab;
  statusFilter: string;
  sourceFilter: string;
  onQuickTab: (tab: CrmQuickTab) => void;
  onStatus: (status: string) => void;
  onSource: (source: string) => void;
  showListControls: boolean;
  search: string;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  pageSize: number;
  onPageSize: (value: string) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("crm.list");
  const tStatus = useTranslations("crm.status");
  const tSource = useTranslations("crm.source");
  const { canSeeFinancials } = usePermissions();
  const views = canSeeFinancials ? CRM_VIEWS : CRM_VIEWS.filter((v) => !FINANCIAL_VIEWS.includes(v.value));

  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Select
          value={quickTab ? `tab:${quickTab}` : statusFilter ? `status:${statusFilter}` : sourceFilter ? `source:${sourceFilter}` : "__all__"}
          onValueChange={(v) => {
            if (v.startsWith("tab:")) onQuickTab(v.slice(4) as CrmQuickTab);
            else if (v.startsWith("status:")) onStatus(v.slice(7));
            else if (v.startsWith("source:")) onSource(v.slice(7));
            else onQuickTab("");
          }}
        >
          <SelectTrigger className="w-[210px]" aria-label={t("filters.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("filters.statusAll")}</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("filters.viewsGroup")}</SelectLabel>
              {views.map((v) => (
                <SelectItem key={v.value} value={`tab:${v.value}`}>
                  {t(`tabs.${v.labelKey}`)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("filters.statusGroup")}</SelectLabel>
              {STORED_STATUSES.map((s) => (
                <SelectItem key={s} value={`status:${s}`}>
                  {tStatus(s)}
                </SelectItem>
              ))}
            </SelectGroup>
            {showListControls && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{t("filters.sourceGroup")}</SelectLabel>
                  {LEAD_SOURCES.map((s) => (
                    <SelectItem key={s} value={`source:${s}`}>
                      {tSource(s)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
        {showListControls && (
          <>
            <div className="relative w-full max-w-sm flex-1 sm:w-auto">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t("search")}
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                aria-label={t("search")}
                className="h-9 pl-10 pr-10"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={onClearSearch}
                  aria-label={t("searchClear")}
                  title={t("searchClear")}
                >
                  <X />
                </Button>
              )}
            </div>
            <Select value={String(pageSize)} onValueChange={onPageSize}>
              <SelectTrigger className="w-[80px]" aria-label={t("pagination.pageSize")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
      <Button size="sm" onClick={onAdd} className="shrink-0 self-end sm:self-auto">
        <Plus />
        {t("addLead")}
      </Button>
    </div>
  );
}
