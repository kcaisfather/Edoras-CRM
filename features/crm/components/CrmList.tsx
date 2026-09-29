"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { VisionListPagination } from "@/components/ui/vision-list-pagination";
import { PeriodPicker } from "@/components/period-picker";
import { NewDemoDialog, formatPhone } from "@/features/institutions";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useUrlSort } from "@/components/ui/sortable-header";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getContactName } from "@/lib/domain/crm/utils";
import { CRM_SORT_KEYS } from "@/lib/domain/crm/sort";
import { crmApi } from "../api";
import { useCrmList } from "../hooks";
import { useInvalidateCrm } from "../mutations";
import type { CrmScreenSlots } from "../types";
import { CrmAddModal } from "./CrmAddModal";
import { CrmCollectionDialog } from "./CrmCollectionDialog";
import { CrmDuplicates } from "./CrmDuplicates";
import { CrmEditModal } from "./CrmEditModal";
import { CrmEmptyState } from "./CrmEmptyState";
import { CrmErrorState } from "./CrmErrorState";
import { CrmExportButton } from "./CrmExportButton";
import { CrmLeadDetailSheet } from "./CrmLeadDetailSheet";
import { CrmListSkeleton } from "./CrmListSkeleton";
import { CrmListToolbar } from "./CrmListToolbar";
import { CrmMobileCards } from "./CrmMobileCards";
import { CrmNewSignups } from "./CrmNewSignups";
import { CrmNoteModal } from "./CrmNoteModal";
import { CrmPipelineStrip } from "./CrmPipelineStrip";
import { CrmSummaryCards } from "./CrmSummaryCards";
import { CrmTable } from "./CrmTable";
import { LinkInstitutionDialog } from "./LinkInstitutionDialog";

/**
 * Adaylar (DeepSport CRM operasyon ekranı): tüm adaylar — satış olmuşlar da ("Müşteri" rozetiyle, bağlı kurum
 * sayfasına gider). Satış hunisi Satış Analizleri'nde (/crm/analytics). Tek tarih kontrolü: dönem seçici
 * (aday oluşturma tarihi) — özet kartlar, aşama şeridi ve liste aynı aralığı izler. Başka modüllerin satır
 * parçaları (Görev ata) ve üst satırdaki "İçe aktar" `slots` ile gelir (app/crm/_components/CrmScreen.tsx) —
 * crm → tasks / cold-lists bağımlılığı yok.
 */
export function CrmList({ renderImport, ...slots }: CrmScreenSlots = {}) {
  const t = useTranslations("crm.list");
  const mounted = useMounted();
  const list = useCrmList(slots);
  const colSort = useUrlSort(CRM_SORT_KEYS);

  if (!mounted || list.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <CrmListSkeleton />
      </div>
    );
  }

  if (list.isError) return <CrmErrorState onRetry={list.refetch} />;

  const isListView = !list.isSignupsTab && !list.isDuplicatesTab;
  const { all, actions } = list;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* Üst satır: dönem seçici (kartlar, şerit ve liste bunu izler) + veri araçları (dışa / içe aktarma) */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <PeriodPicker defaultPeriod="all" allowAll resetParams={["page"]} />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isListView && <CrmExportButton getLeads={() => list.filteredLeads} />}
          {/* EK-1: Excel/CSV içe aktarma (mükerrer önizleme, onay, sunucu kontrolü ve özet bileşenin içinde). */}
          {renderImport?.()}
        </div>
      </div>

      <CrmSummaryCards summary={list.summary} openReceivables={list.openReceivables} />

      {/* Satış aşamaları (G35) — tıklanınca liste o statüye süzülür */}
      <CrmPipelineStrip stages={list.pipeline} activeStatus={list.effectiveStatus} onSelect={list.setStatusFilter} />

      <CrmListToolbar
        quickTab={list.quickTab}
        statusFilter={list.statusFilter}
        onQuickTab={list.setQuickTab}
        onStatus={list.setStatusFilter}
        showListControls={isListView}
        search={list.searchBox.input}
        onSearch={list.searchBox.change}
        onClearSearch={list.searchBox.clear}
        pageSize={list.pageSize}
        onPageSize={list.setPageSize}
        onAdd={() => list.setAddOpen(true)}
      />

      {list.isSignupsTab ? (
        <CrmNewSignups leads={all.leads} institutions={all.institutions} isLoading={all.institutionsLoading} isError={all.institutionsError} />
      ) : list.isDuplicatesTab ? (
        <CrmDuplicates
          leads={all.leads}
          institutions={all.institutions}
          isLoading={all.institutionsLoading}
          institutionsError={all.institutionsError}
          onRetryInstitutions={all.refetchInstitutions}
          onEdit={actions.onEdit}
        />
      ) : list.leads.length === 0 ? (
        <CrmEmptyState />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
          <p className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
            {t("count", { count: list.totalElements, page: list.page + 1, totalPages: list.totalPages })}
          </p>
          <CrmTable leads={list.leads} actions={actions} sort={colSort.sort} onSort={colSort.toggle} />
          <CrmMobileCards leads={list.leads} actions={actions} />
          <VisionListPagination
            currentPage={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            from={list.page * list.pageSize + 1}
            to={Math.min((list.page + 1) * list.pageSize, list.totalElements)}
            total={list.totalElements}
            renderShowing={(from, to, total) => t("pagination.showing", { from, to, total })}
            previousLabel={t("pagination.previous")}
            nextLabel={t("pagination.next")}
          />
        </div>
      )}

      <CrmListDialogs list={list} />
    </div>
  );
}

/** Ekranın pencereleri: detay, yeni aday, düzenle, not, demo aç, kuruma bağla, tahsilat. */
function CrmListDialogs({ list }: { list: ReturnType<typeof useCrmList> }) {
  const tDemo = useTranslations("crm.demo");
  const invalidateCrm = useInvalidateCrm();
  const { actions, demoLead } = list;
  const demoInitial = useMemo(() => (demoLead ? demoFormInitial(demoLead) : undefined), [demoLead]);

  return (
    <>
      <CrmLeadDetailSheet lead={list.detailLead} onOpenChange={(next) => !next && list.closeDetail()} actions={actions} />
      <CrmAddModal open={list.addOpen} onOpenChange={list.setAddOpen} onCreated={(lead) => list.showCreated(lead.id)} />
      <CrmEditModal
        open={list.editLead != null}
        onOpenChange={(next) => !next && list.closeEdit()}
        lead={list.editLead}
        onDeleted={list.closeDetail}
        onSold={(lead) => actions.onAddNote(lead, "handoff")}
        onOpenDemo={actions.onOpenDemo}
        onLink={actions.onLink}
        onAddCollection={actions.onAddCollection}
      />
      <CrmNoteModal open={list.noteLead != null} onOpenChange={(next) => !next && list.closeNote()} lead={list.noteLead} mode={list.noteMode} />
      {demoLead && (
        <NewDemoDialog
          open
          onOpenChange={(next) => !next && list.closeDemo()}
          initial={demoInitial}
          description={tDemo("description")}
          submitRequest={(input) => crmApi.openDemo(demoLead.id, input)}
          onCreated={invalidateCrm}
        />
      )}
      <LinkInstitutionDialog lead={list.linkLead} leads={list.all.leads} open={list.linkLead != null} onOpenChange={(next) => !next && list.closeLink()} />
      <CrmCollectionDialog lead={list.collectionLead} open={list.collectionLead != null} onOpenChange={(next) => !next && list.closeCollection()} />
    </>
  );
}

/** Demo formunun adaydan başlangıç değerleri (demo kuralı: kurum adı, yetkili ad soyad, telefon, e-posta). */
function demoFormInitial(lead: CrmLead) {
  return {
    institutionName: lead.organizationName ?? "",
    contactName: getContactName(lead),
    contactPhone: lead.contactPhone ? formatPhone(lead.contactPhone) : "",
    contactEmail: lead.contactEmail ?? "",
  };
}
