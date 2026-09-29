/** "Örnek şablon (.csv)" — her içe aktarma noktasında aynı başlıklar (otomatik eşlemeyle birebir uyumlu). */
import { downloadCsv, type CsvCell } from "@/lib/utils/csv";

export const TEMPLATE_HEADERS = ["Ad", "Soyad", "Kurum", "Telefon", "E-posta", "Şehir", "İlçe", "Program", "Not"] as const;

/** Örnek satırlar kurgusaldır (example.com / 0000 numaraları). */
export const TEMPLATE_ROWS: CsvCell[][] = [
  ["Ayşe", "Demir", "Örnek Dershanesi", "0532 000 00 01", "ayse@example.com", "İstanbul", "Kadıköy", "YKS", "Fuarda tanıştık"],
  ["Mehmet", "Kaya", "Örnek Koleji", "+90 533 000 00 02", "", "Ankara", "Çankaya", "LGS", ""],
];

export function downloadImportTemplate(): void {
  downloadCsv("ice-aktarma-sablonu", [...TEMPLATE_HEADERS], TEMPLATE_ROWS);
}
