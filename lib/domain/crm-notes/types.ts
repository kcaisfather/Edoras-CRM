/**
 * Aday notu (crm_notes). DeepSport'taki not anahtarı (userId / lead.id ikilisi) yok: not doğrudan
 * adaya bağlıdır (lead_id FK). Yazar sunucuda oturumdan yazılır; ad yazıldığı andaki haliyle saklanır.
 * Zaman damgaları epoch ms (G09 kural 4).
 */
export interface CrmNote {
  id: string;
  leadId: string;
  content: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: number | null;
  updatedAt?: number | null;
}
