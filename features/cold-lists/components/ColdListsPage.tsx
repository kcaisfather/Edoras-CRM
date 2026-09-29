"use client";

/**
 * Madde 13 — Soğuk listeler (/crm/cold-lists; DeepSport ColdListsPage): içe aktarılan aranacak kişi listeleri, arama
 * sonucu işaretleme ve "Sıcağa taşı" (→ CRM adayı). Listeler ekipçe paylaşılır (DeepSport'ta bayrak kapalıyken bu
 * tarayıcıdaydı; localStorage deposu kaldırıldı). Liste silme yalnız yöneticide.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { useMounted } from "@/lib/hooks/use-mounted";
import type { Prospect } from "@/lib/domain/cold-lists/types";
import { prospectTitle } from "@/lib/domain/cold-lists/utils";
import { useColdListView } from "../hooks";
import { ColdListFilters, ColdListToolbar } from "./ColdListToolbar";
import { DeleteDialog, SavePendingDialog, type DeleteTarget } from "./ColdListDialogs";
import { ImportButton, ImportTemplateButton } from "./import/ImportDialog";
import { MoveToCrmDialog } from "./MoveToCrmDialog";
import { ProspectTable } from "./ProspectTable";

function Header() {
  const t = useTranslations("growth.coldLists");
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}

function EmptyLists({ onImported }: { onImported: (listId: string) => void }) {
  const t = useTranslations("growth.coldLists");
  return (
    <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl px-4 py-12 text-center">
      <ListPlus className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{t("emptyTitle")}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t("emptyBody")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <ImportButton targets={["coldList"]} variant="default" size="default" onCompleted={(s) => s.listId && onImported(s.listId)} />
        <ImportTemplateButton size="default" />
      </div>
    </div>
  );
}

export function ColdListsPage() {
  const t = useTranslations("growth.coldLists");
  const mounted = useMounted();
  const view = useColdListView();
  const [moving, setMoving] = useState<Prospect | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const pendingCount = Object.keys(view.pending).length;

  if (!mounted || view.listsLoading) {
    return (
      <div className="space-y-4">
        <Header />
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  // Okuma hatası "henüz liste yok" gibi görünmesin: satır içi hata + yeniden dene.
  if (view.listsError) {
    return (
      <div className="space-y-4">
        <Header />
        <QueryErrorState onRetry={view.refetch} />
      </div>
    );
  }

  if (view.lists.length === 0) {
    return (
      <div className="space-y-4">
        <Header />
        <EmptyLists onImported={view.selectList} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header />
      <CoverageNote>{t("sharedNote")}</CoverageNote>
      <ColdListToolbar
        view={view}
        onDeleteList={() => view.list && setDeleting({ kind: "list", id: view.list.id, name: view.list.name, count: view.list.prospectCount })}
      />
      <ColdListFilters view={view} />

      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <span>{t("pending", { count: pendingCount })}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={view.clearPending}>
              {t("discard")}
            </Button>
            <Button size="sm" onClick={() => setConfirmSave(true)}>
              {t("save")}
            </Button>
          </div>
        </div>
      )}

      {/* Kişiler okunamadıysa tablo "boş" değil, eksik: bunu söyle. */}
      {view.prospectsError ? (
        <QueryErrorState onRetry={view.refetch} />
      ) : view.prospectsLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <ProspectTable
          view={view}
          actions={{
            onMove: setMoving,
            onDelete: (p) => setDeleting({ kind: "prospect", id: p.id, name: prospectTitle(p) }),
          }}
        />
      )}
      {view.truncated && <CoverageNote>{t("truncated", view.truncated)}</CoverageNote>}
      {view.institutionsError && <CoverageNote>{t("institutionsError")}</CoverageNote>}

      <MoveToCrmDialog prospect={moving} crmMatches={moving ? view.crmMatchesFor(moving) : []} onOpenChange={(o) => !o && setMoving(null)} />
      <DeleteDialog target={deleting} onClose={() => setDeleting(null)} onListDeleted={() => view.selectList("")} />
      <SavePendingDialog open={confirmSave} pending={view.pending} onOpenChange={setConfirmSave} onSaved={view.clearPending} />
    </div>
  );
}
