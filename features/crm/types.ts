import type { ReactNode } from "react";
import type { CrmLead, CrmNoteMode } from "@/lib/domain/crm/types";

export interface CrmTableActions {
  /** Satıra tıklama / Enter: aday paneli (sağdan açılır, doğrudan düzenleme biçimindedir). */
  onOpen?: (lead: CrmLead) => void;
  /** "Düzenle": aday panelini açar (ayrı düzenleme penceresi yok). */
  onEdit: (lead: CrmLead) => void;
  onAddNote: (lead: CrmLead, mode?: CrmNoteMode) => void;
  /** Kuruma bağlı olmayan aday için "Demo aç" (yeni demo formu adayın bilgileriyle dolu). */
  onOpenDemo?: (lead: CrmLead) => void;
  /** Kuruma bağlı olmayan aday için "Kuruma bağla" (Edoras'taki mevcut kurum). */
  onLink?: (lead: CrmLead) => void;
  /** "Tahsilat ekle" — satışı olan aday için (yalnız finans yetkisiyle verilir). */
  onAddCollection?: (lead: CrmLead) => void;
  /** Satış Oldu'ya geçildi (satır içi statü seçici ya da panel formu): devir notu penceresi. */
  onStatusSold?: (lead: CrmLead) => void;
  /**
   * Başka modüllerin eylemleri (bağımlılık tersine çevrilir: crm → tasks / surveys / invoices yok). Ekranı kuran
   * bileşen verir (app/crm/_components/CrmScreen.tsx); verilmezse çizilmez.
   * "Görev ata": görev penceresini ekranı kuran bileşen açar.
   */
  onAssignTask?: (lead: CrmLead) => void;
  /** "Arama listesine ekle": bugüne "Arama" görevi (ekranı kuran bileşen yazar; mükerrer görev açmaz). */
  onAddToCallList?: (lead: CrmLead) => void;
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

/** Ekranı kuran bileşenin verdiği satır parçaları (Görev ata, Arama listesine ekle, memnuniyet rozeti, Anket gönder, Fatura kes). */
export type CrmRowSlots = Pick<
  CrmTableActions,
  "onAssignTask" | "onAddToCallList" | "renderSatisfaction" | "onSendSurvey" | "onIssueInvoice"
>;

/**
 * Ekranı kuran bileşenin verdiği parçalar: satır parçaları + üst satırdaki "İçe aktar (Excel/CSV)" düğmesi
 * (soğuk listeler modülünden; crm → cold-lists bağımlılığı olmasın diye app/crm/_components/CrmScreen.tsx verir).
 */
export interface CrmScreenSlots extends CrmRowSlots {
  renderImport?: () => ReactNode;
}
