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
   * Başka modüllerin satır parçaları (bağımlılık tersine çevrilir: crm → tasks / surveys yok). Ekranı kuran bileşen
   * verir (app/crm/_components/CrmScreen.tsx); verilmezse çizilmez.
   */
  renderAssignTask?: (lead: CrmLead, opts?: { showLabel?: boolean }) => ReactNode;
  /** Memnuniyet rozeti (anketler modülü; yalnız müşterinin anket yanıtından). */
  renderSatisfaction?: (lead: CrmLead) => ReactNode;
  /** "Anket gönder" (anketler modülünün penceresi; DeepSport onSendSurvey). */
  onSendSurvey?: (lead: CrmLead) => void;
  /**
   * "Fatura kes" (faturalar modülünün penceresi; DeepSport setInvoiceLead). Yalnız finans yetkisiyle ve ücretli kuruma
   * bağlı adayda çizilir (fatura, kurumun lisansı / ödemesi için kesilir).
   */
  onIssueInvoice?: (lead: CrmLead) => void;
}

/** Ekranı kuran bileşenin verdiği satır parçaları (Görev ata, memnuniyet rozeti, Anket gönder). */
export type CrmRowSlots = Pick<CrmTableActions, "renderAssignTask" | "renderSatisfaction" | "onSendSurvey" | "onIssueInvoice">;

/**
 * Ekranı kuran bileşenin verdiği parçalar: satır parçaları + üst satırdaki "İçe aktar (Excel/CSV)" düğmesi
 * (soğuk listeler modülünden; crm → cold-lists bağımlılığı olmasın diye app/crm/_components/CrmScreen.tsx verir).
 */
export interface CrmScreenSlots extends CrmRowSlots {
  renderImport?: () => ReactNode;
}
