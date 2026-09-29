"use client";

/**
 * Ortak içe aktarma (DeepSport components/import/ImportDialog, EK-1): Excel/CSV → sütun eşleme → önizleme →
 * mükerrer çözümü → onay → kaydet → özet.
 *
 * Hedefler:
 *  - coldList: ekiple paylaşılan soğuk liste (POST /api/crm/prospect-lists/{id}/prospects/bulk).
 *  - crm:      CRM adayı, statü "Aranacak", kaynak IMPORT (POST /api/crm/leads/bulk; onaydan önce dryRun).
 *
 * Dosya tarayıcıda okunur; sunucuya yalnız eşlenen ham alanlar 500'erli parçalar hâlinde gider. Önizlemedeki
 * mükerrer kontrolü (dosya içi, CRM adayları, kurum yetkilileri, seçilen liste) kullanıcıya yol gösterir; asıl kontrolü
 * sunucu kendi verisiyle yeniden yapar. Adaylar ekranı bu düğmeyi app/crm/_components/CrmScreen.tsx üzerinden alır.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadImportTemplate } from "@/lib/import/template";
import { BulkProgress } from "./BulkProgress";
import { ConfirmStep, DoneStep } from "./ImportFinish";
import { ReviewStep } from "./ImportReview";
import { FileStep, MapStep } from "./ImportSteps";
import { useImportFlow, type ImportSummary, type ImportTarget } from "./use-import-flow";

export type { ImportSummary, ImportTarget };

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** İzin verilen hedefler (varsayılan ikisi de). */
  targets?: readonly ImportTarget[];
  defaultTarget?: ImportTarget;
  /** Soğuk liste hedefinde önceden seçili liste. */
  defaultListId?: string | null;
  onCompleted?: (summary: ImportSummary) => void;
}

const ALL_TARGETS: readonly ImportTarget[] = ["coldList", "crm"];

export function ImportDialog(props: ImportDialogProps) {
  const t = useTranslations("growth.import");
  const { open, onOpenChange } = props;
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Yazma sürerken kapatma yok (önce "Durdur").
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open && <ImportFlowView {...props} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

/** Liste başlığındaki "İçe aktar (Excel/CSV)" düğmesi + diyalog. */
export function ImportButton({
  targets,
  defaultTarget,
  defaultListId,
  onCompleted,
  size = "sm",
  variant = "outline",
}: Omit<ImportDialogProps, "open" | "onOpenChange"> & { size?: "sm" | "default"; variant?: "outline" | "default" }) {
  const t = useTranslations("growth.import");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <Upload />
        {t("button")}
      </Button>
      <ImportDialog
        open={open}
        onOpenChange={setOpen}
        targets={targets}
        defaultTarget={defaultTarget}
        defaultListId={defaultListId}
        onCompleted={onCompleted}
      />
    </>
  );
}

/** Yalnız şablon indirme düğmesi (içe aktarma noktalarının yanında). */
export function ImportTemplateButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const t = useTranslations("growth.import");
  return (
    <Button size={size} variant="ghost" onClick={downloadImportTemplate}>
      <FileSpreadsheet />
      {t("template")}
    </Button>
  );
}

function ImportFlowView({
  onOpenChange,
  targets = ALL_TARGETS,
  defaultTarget,
  defaultListId,
  onCompleted,
  onBusyChange,
}: ImportDialogProps & { onBusyChange: (busy: boolean) => void }) {
  const flow = useImportFlow({ targets, defaultTarget, defaultListId, onCompleted, onBusyChange });
  const close = () => onOpenChange(false);
  switch (flow.step) {
    case "file":
      return <FileStep flow={flow} targets={targets} onCancel={close} />;
    case "map":
      return <MapStep flow={flow} />;
    case "review":
      return <ReviewStep flow={flow} />;
    case "confirm":
      return <ConfirmStep flow={flow} />;
    case "running":
      return <BulkProgress done={flow.progress.done} total={flow.progress.total} stopping={flow.stopping} onStop={flow.stop} />;
    case "done":
      return flow.summary ? <DoneStep summary={flow.summary} onClose={close} /> : null;
  }
}
