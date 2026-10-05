"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, getLeadTitle } from "@/lib/domain/crm/utils";
import { useAllCrmLeads } from "../queries";
import type { CrmTableActions } from "../types";
import { DissatisfiedBadge, ProgramBadges } from "./CrmBadges";
import { CrmCollectionDialog } from "./CrmCollectionDialog";
import { CrmLeadFields } from "./CrmLeadFields";
import { CrmLeadInstitution } from "./CrmLeadInstitution";
import { CustomerBadge, LinkedMark } from "./CrmRowParts";
import { StatusDropdown } from "./StatusDropdown";
import { CrmDeleteConfirmDialog, CrmUnsavedDialog } from "./crm-edit/CrmEditDialogs";
import { CrmEditSalesSection } from "./crm-edit/CrmEditSalesSection";
import { useCrmEditActions } from "./crm-edit/useCrmEditActions";
import { useCrmEditForm } from "./crm-edit/useCrmEditForm";
import { LeadActionRow, LeadDetailsSection, LeadPurchaseHistory, LeadSection, NotesTimeline } from "./lead-sheet/LeadSheetSections";

const FORM_ID = "crm-lead-sheet-form";

export interface CrmLeadSheetProps {
  /** Açık kayıt (null = kapalı). Panel açıkken paylaşılan aday önbelleğindeki güncel hâli gösterilir. */
  lead: CrmLead | null;
  onOpenChange: (open: boolean) => void;
  /**
   * Eylem satırı (Not ekle, Görev ata, Arama listesine ekle, Anket gönder), Demo aç / Kuruma bağla, Fatura kes, satır
   * içi statüden ve formdan "Satış oldu" sonrası devir notu; verilmeyen parça çizilmez. İletişim menüsü her zaman.
   */
  actions?: Partial<CrmTableActions>;
  /** Silme sonrası (panel kapanır). */
  onDeleted?: () => void;
}

/**
 * Aday paneli (satıra tıklama, "Düzenle"): sağdan açılır ve doğrudan düzenleme biçimindedir — ayrı salt okunur görünüm
 * ve ortadaki düzenleme penceresi yok. Üstte ad + satış aşaması (StatusDropdown, anında kaydeder) ve kısa eylem satırı;
 * gövdede düzenleme formu (aday, takip, Edoras kurumu, satış); altında salt okunur ayrıntılar, alım-satım geçmişi ve
 * notlar. Altta sabit "Sil / Vazgeç / Kaydet" (Vazgeç ve Kaydet yalnız değişiklik varken); kaydedilmemiş değişiklikle
 * kapatmaya çalışınca onay istenir.
 */
export function CrmLeadSheet(props: CrmLeadSheetProps) {
  const { lead, onOpenChange } = props;
  if (!lead) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent className="hidden" />
      </Sheet>
    );
  }
  return <CrmLeadSheetBody {...props} lead={lead} />;
}

function CrmLeadSheetBody({ lead: leadProp, onOpenChange, actions = {}, onDeleted }: CrmLeadSheetProps & { lead: CrmLead }) {
  const t = useTranslations("crm.detail");
  const tX = useTranslations("crm");
  const tEdit = useTranslations("crm.edit");
  const tCommon = useTranslations("common");
  // Kaydetme / tahsilat / statü değişikliği sonrası güncel kayıt (tahsilat tutarı da buradan; form onu asla ezmez).
  const { leads: allLeads } = useAllCrmLeads(true);
  const lead = allLeads.find((l) => l.id === leadProp.id) ?? leadProp;
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const forceClose = () => onOpenChange(false);
  const edit = useCrmEditForm({ lead, onSold: actions.onStatusSold });
  const del = useCrmEditActions({
    leadId: lead.id,
    onDeleted: () => {
      forceClose();
      onDeleted?.();
    },
  });
  const requestClose = () => {
    if (edit.isDirty && !edit.isSaving) setConfirmDiscard(true);
    else forceClose();
  };

  const { title, subtitle } = getLeadTitle(lead);
  const createdBy = lead.createdByName ?? (lead.createdBy ? tX("audit.unknown") : null);
  const updatedBy = lead.updatedByName ?? (lead.updatedBy ? tX("audit.unknown") : null);

  return (
    <>
      <Sheet open onOpenChange={(next) => (next ? undefined : requestClose())}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <div className="flex-1 overflow-y-auto">
            <SheetHeader className="space-y-1 border-b border-border px-5 pb-3 pr-12 pt-5 text-left">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-lg leading-tight">
                <span className="break-words">{title}</span>
                <LinkedMark lead={lead} />
                <CustomerBadge lead={lead} />
              </SheetTitle>
              <SheetDescription className={subtitle ? "text-sm" : "sr-only"}>{subtitle || title}</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusDropdown lead={lead} onSold={actions.onStatusSold} />
                <DissatisfiedBadge value={lead.dissatisfaction} />
                {actions.renderSatisfaction?.(lead)}
                <ProgramBadges tags={lead.programTags} />
              </div>
              {(createdBy || updatedBy) && (
                <p className="text-xs text-muted-foreground">
                  {createdBy && tX("audit.created", { name: createdBy, date: formatCrmDate(lead.createdAt) })}
                  {createdBy && updatedBy && " · "}
                  {updatedBy && tX("audit.updated", { name: updatedBy, date: formatCrmDate(lead.updatedAt) })}
                </p>
              )}
            </SheetHeader>

            <div className="space-y-4 px-5 py-4">
              <LeadActionRow lead={lead} title={title} actions={actions} />

              <form id={FORM_ID} onSubmit={edit.submit} className="space-y-4" noValidate>
                <section className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{tX("form.leadSection")}</p>
                  <CrmLeadFields form={edit.form} idPrefix="crm-sheet" offerDate={lead.offerSentAt} hideStatus />
                </section>
                <div className="border-t border-border" />
                <CrmEditSalesSection form={edit.form} lead={lead} onAddCollection={() => setCollectionOpen(true)} />
              </form>

              <LeadSection title={tX("institution.title")}>
                <CrmLeadInstitution lead={lead} onOpenDemo={actions.onOpenDemo} onLink={actions.onLink} showUsage />
              </LeadSection>

              <LeadDetailsSection lead={lead} />
              <LeadPurchaseHistory lead={lead} actions={actions} />
              <NotesTimeline lead={lead} onAllNotes={actions.onAddNote ? () => actions.onAddNote?.(lead) : undefined} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
            <Button
              type="button"
              size="sm"
              variant="destructive-outline"
              disabled={del.isDeleting || edit.isSaving}
              onClick={() => del.setDeleteConfirmOpen(true)}
            >
              <Trash2 />
              {tEdit("deleteButton")}
            </Button>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={edit.discard} disabled={!edit.isDirty || edit.isSaving}>
                {t("discardEdits")}
              </Button>
              <Button type="submit" form={FORM_ID} size="sm" disabled={!edit.isDirty || edit.isSaving || del.isDeleting} aria-busy={edit.isSaving}>
                {edit.isSaving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {tCommon("saving")}
                  </>
                ) : (
                  t("save")
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CrmDeleteConfirmDialog
        open={del.deleteConfirmOpen}
        onOpenChange={del.setDeleteConfirmOpen}
        busy={del.isDeleting}
        onConfirm={del.handleDelete}
      />
      <CrmCollectionDialog lead={lead} open={collectionOpen} onOpenChange={setCollectionOpen} />
      <CrmUnsavedDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={() => {
          setConfirmDiscard(false);
          edit.discard();
          forceClose();
        }}
      />
    </>
  );
}
