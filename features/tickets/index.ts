/**
 * tickets — Destek talepleri; diğer ekranların kullandığı genel yüzey (public API).
 *
 * - <TicketsPage /> : /crm/tickets listesi (süzgeç, talep aç, ayrıntı, ekip notları)
 * - <InstitutionTicketsCard institutionId /> : kurum ayrıntısındaki kart (talepler + destek bağlantısı kopyala / yenile)
 */
export { InstitutionTicketsCard } from "./components/InstitutionTicketsCard";
// Herkese açık sayfa (PublicTicketPage) bilinçli olarak burada YOK: app/t/[token] onu doğrudan alır, müşterinin
// indirdiği sayfaya bu barrel'ın panel bileşenleri girmesin.
export { TicketsPage } from "./components/TicketsPage";
export { ticketKeys, useTickets } from "./queries";
