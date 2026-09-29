import type { ReactNode } from "react";
import type { CrmLead, CrmNoteMode } from "@/lib/domain/crm/types";

export interface CrmTableActions {
  /** Satıra tıklama / Enter: aday detay penceresi. */
  onOpen?: (lead: CrmLead) => void;
  onEdit: (lead: CrmLead) => void;
  onAddNote: (lead: CrmLead, mode?: CrmNoteMode) => void;
  /** Kuruma bağlı olmayan aday için "Demo aç" (yeni demo formu adayın bilgileriyle dolu). */
  onOpenDemo?: (lead: CrmLead) => void;
  /** Kuruma bağlı olmayan aday için "Kuruma bağla" (Edoras'taki mevcut kurum). */
  onLink?: (lead: CrmLead) => void;
  /** "Tahsilat ekle" — satışı olan aday için (yalnız finans yetkisiyle verilir). */
  onAddCollection?: (lead: CrmLead) => void;
  /**
   * Başka modüllerin satır parçaları (bağımlılık tersine çevrilir: crm → tasks / surveys yok). Görev ve
   * anket modülleri taşınınca ekranı kuran bileşen verir; verilmezse çizilmez.
   */
  renderAssignTask?: (lead: CrmLead, opts?: { showLabel?: boolean }) => ReactNode;
  renderSatisfaction?: (lead: CrmLead) => ReactNode;
}
