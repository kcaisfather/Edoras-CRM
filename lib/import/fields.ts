/**
 * İçe aktarma alanları ve sütun eşleme tahmini (DeepSport lib/import/fields.ts). Başlıklar Türkçe karakterlerden
 * arındırılıp takma adlarla karşılaştırılır ("Cep Telefonu" → phone, "Kurum Adı" → organization).
 * `branch` DeepSport'taki "branş" alanıdır; Edoras'ta "Program / tür" (YKS, LGS, dershane, kolej… serbest metin).
 * DeepSport dosyaları da okunabilsin diye spor takma adları korundu.
 */
import type { RawTable } from "./parse";

export const IMPORT_FIELDS = [
  "fullName",
  "firstName",
  "lastName",
  "organization",
  "phone",
  "email",
  "city",
  "district",
  "branch",
  "note",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Alan → sütun indeksi. Eşlenmeyen alan anahtarı yoktur. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

/** Başlığı karşılaştırma için sadeleştirir: küçük harf, Türkçe karakter → ASCII, yalnız harf/rakam. */
export function normalizeHeader(header: string): string {
  return header
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ALIASES: Record<ImportField, string[]> = {
  fullName: [
    "adsoyad",
    "adisoyadi",
    "adsoyadi",
    "isimsoyisim",
    "isimsoyad",
    "fullname",
    "name",
    "kisi",
    "yetkili",
    "yetkiliadi",
    "yetkilikisi",
    "iletisimkisisi",
    "contact",
    "contactname",
    "musteri",
    "musteriadi",
  ],
  firstName: ["ad", "adi", "isim", "firstname", "first", "givenname"],
  lastName: ["soyad", "soyadi", "soyisim", "lastname", "last", "surname", "familyname"],
  organization: [
    "kurum",
    "kurumadi",
    "dershane",
    "dershaneadi",
    "kolej",
    "okul",
    "okuladi",
    "sirket",
    "sirketadi",
    "firma",
    "firmaadi",
    "organization",
    "organisation",
    "company",
    "school",
    "kurulus",
    "kulup",
    "kulupadi",
    "akademi",
    "club",
    "takim",
  ],
  phone: [
    "telefon",
    "tel",
    "telno",
    "telefonno",
    "telefonnumarasi",
    "cep",
    "ceptel",
    "ceptelefonu",
    "cepno",
    "gsm",
    "mobile",
    "phone",
    "phonenumber",
    "numara",
    "iletisimno",
  ],
  email: ["eposta", "email", "mail", "emailadresi", "epostaadresi", "mailadresi"],
  city: ["sehir", "il", "city", "province"],
  district: ["ilce", "district", "semt", "county"],
  branch: [
    "program",
    "programturu",
    "kurumturu",
    "sinav",
    "sinavturu",
    "brans",
    "spor",
    "sporbrans",
    "sporbransi",
    "sport",
    "branch",
    "disiplin",
  ],
  note: ["not", "notlar", "aciklama", "note", "notes", "comment", "yorum"],
};

/**
 * Otomatik eşleme: önce tam takma ad eşleşmesi, sonra (≥4 harfli takma adla) "içerir" eşleşmesi.
 * Her sütun ve her alan en fazla bir kez kullanılır. Ad Soyad tek sütunsa `fullName`'e düşer.
 */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};
  const used = new Set<number>();

  for (const field of IMPORT_FIELDS) {
    const idx = normalized.findIndex((h, i) => !used.has(i) && ALIASES[field].includes(h));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }

  // "İçerir" eşleşmesi: uzun takma adlar önce (ör. "yetkiliadisoyadi" → fullName, "ad" değil).
  const pairs = IMPORT_FIELDS.flatMap((field) =>
    ALIASES[field].filter((a) => a.length >= 4).map((alias) => ({ field, alias }))
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const { field, alias } of pairs) {
    if (mapping[field] != null) continue;
    const idx = normalized.findIndex((h, i) => !used.has(i) && h.includes(alias));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }

  // Kısa (3 harfli) takma adlar yalnız başlık başında: "GSM No", "Tel 2", "Cep".
  for (const field of IMPORT_FIELDS) {
    if (mapping[field] != null) continue;
    const idx = normalized.findIndex((h, i) => !used.has(i) && ALIASES[field].some((a) => a.length === 3 && h.startsWith(a)));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }

  // Ayrı ad + soyad varsa "ad soyad" tek sütun eşlemesi gereksiz.
  if (mapping.firstName != null && mapping.lastName != null) delete mapping.fullName;
  return mapping;
}

/** Eşleme en az bir tanımlayıcı alan (ad, kurum, telefon, e-posta) içeriyor mu? */
export function hasIdentityField(mapping: ColumnMapping): boolean {
  return (["fullName", "firstName", "lastName", "organization", "phone", "email"] as const).some((f) => mapping[f] != null);
}

/** Eşleme ekranında sütunun ilk dolu örnek değeri. */
export function sampleValue(table: RawTable, column: number | undefined): string {
  if (column == null) return "";
  return table.rows.find((r) => (r[column] ?? "") !== "")?.[column] ?? "";
}
