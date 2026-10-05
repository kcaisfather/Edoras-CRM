/**
 * Kurum / lisans / demo kuralları — saf fonksiyonlar. Aynı kurallar veritabanında da zorunludur
 * (supabase/migrations/20260929120000_crm_core.sql); burası formun ve sunucunun erken kontrolü.
 * İkisi ayrışırsa veritabanı kazanır, o yüzden algoritmalar SQL ile birebir aynı tutulur.
 */

/**
 * Kural: 1 dönem = 1 yıl. Hem demo hem ücretli lisans 1 dönem sürer (SQL: crm_institutions_demo_dates_check,
 * crm_licenses_one_year_check). Demo bitince kurum pasife düşmez; yalnız ekranda "Demo bitti" görünür.
 */
export const TERM_YEARS = 1;
/** Lisans bitişine bu kadar gün kala "yaklaşıyor" sayılır. */
export const LICENSE_WARNING_DAYS = 30;
/** Açık adres alt sınırı (SQL: crm_institutions_address_check). */
export const ADDRESS_MIN_LENGTH = 10;

/** TC Kimlik No: 11 hane, ilk hane 0 değil, 10. ve 11. hane kontrol haneleri. */
export function isValidTckn(value: string | null | undefined): boolean {
  if (!value || !/^[1-9]\d{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  const total = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return total % 10 === d[10];
}

/** Vergi Kimlik No (GİB algoritması): 10 hane, son hane kontrol hanesi. */
export function isValidVkn(value: string | null | undefined): boolean {
  if (!value || !/^\d{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  let total = 0;
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 9 - i) % 10;
    total += t === 9 ? 9 : (t * 2 ** (9 - i)) % 9;
  }
  return (10 - (total % 10)) % 10 === d[9];
}

/**
 * Kurumsal faturada vergi numarası: VKN (10 hane) ya da şahıs şirketinin TCKN'si (11 hane; şahıs şirketlerinde vergi
 * numarası sahibin kimlik numarasıdır). SQL: crm_institutions_tax_no_check.
 */
export function isValidTaxNumber(value: string | null | undefined): boolean {
  return isValidVkn(value) || isValidTckn(value);
}

/** Yalnız rakamlar (boşluk, tire vb. atılır). */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** "Ad Soyad": en az iki kelime (SQL: crm_institutions_contact_name_check). */
export function isFullName(value: string | null | undefined): boolean {
  return /^\S+(\s+\S+)+$/.test((value ?? "").trim());
}

/** Fatura bilgisi tam mı: adres + (TC veya Vergi No). Ücretli hesap ve ödeme bunu şart koşar. */
export function isBillingComplete(billing: {
  address: string | null | undefined;
  tcNo: string | null | undefined;
  taxNo: string | null | undefined;
}): boolean {
  const addressOk = (billing.address ?? "").trim().length >= ADDRESS_MIN_LENGTH;
  const idOk = isValidTckn(billing.tcNo) || isValidTaxNumber(billing.taxNo);
  return addressOk && idOk;
}

// --- Tarihler (YYYY-MM-DD, Türkiye takvim günü) ---------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  const m = value ? ISO_DATE.exec(value) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function parts(iso: string): [number, number, number] {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Geçersiz tarih: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Türkiye'de bugünün tarihi (sunucu UTC'de çalışsa da gece yarısı kayması olmaz). */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return fromUtc(new Date(Date.UTC(y, m - 1, d + days)));
}

/**
 * Postgres `date + interval 'N year'` ile aynı: ay sonunu aşan gün ayın son gününe kırpılır
 * (29 Şubat 2028 + 1 yıl = 28 Şubat 2029). SQL CHECK'i bu eşitliği birebir arar.
 */
export function addYears(iso: string, years: number): string {
  const [y, m, d] = parts(iso);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay))));
}

/** b − a (gün). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** 1 dönemin bitişi: başlangıç + 1 yıl. Aralık [başlangıç, bitiş) — bitiş günü dönem bitmiştir. */
export function termEndDate(startsOn: string): string {
  return addYears(startsOn, TERM_YEARS);
}

/** Ücretli lisansın bitişi (1 dönem). */
export const licenseEndDate = termEndDate;

/** Demonun bitişi (1 dönem). */
export const demoEndDate = termEndDate;

/** Yenilemenin başlangıcı: süren lisansın bitişi; lisans bitmişse (ya da yoksa) bugün. SQL ile aynı. */
export function renewalStartDate(lastEndsOn: string | null, today: string): string {
  if (!lastEndsOn) return today;
  return lastEndsOn > today ? lastEndsOn : today;
}

// --- Akademik dönem -------------------------------------------------------------------------

export interface AcademicPeriod {
  yearName: string;
  yearStart: string;
  yearEnd: string;
  termName: string;
  termStart: string;
  termEnd: string;
}

/**
 * Yeni kurumun ilk aktif yılı ve dönemi. Aktif dönemi olmayan kurumda edoras-admin'in yoklama,
 * ödev ve program ekranları çalışmaz, o yüzden demo kurum bununla açılır.
 * Temmuz–Aralık → yeni öğretim yılının 1. dönemi; Ocak → süren yılın 1. dönemi; Şubat–Haziran → 2. dönem.
 */
export function initialAcademicPeriod(today: string): AcademicPeriod {
  const [y, m] = parts(today);
  const startYear = m >= 7 ? y : y - 1;
  const year = {
    yearName: `${startYear}-${startYear + 1}`,
    yearStart: `${startYear}-09-01`,
    yearEnd: `${startYear + 1}-06-30`,
  };
  if (m >= 2 && m <= 6) {
    return { ...year, termName: "2. Dönem", termStart: `${y}-02-01`, termEnd: `${y}-06-30` };
  }
  return { ...year, termName: "1. Dönem", termStart: `${startYear}-09-01`, termEnd: `${startYear + 1}-01-31` };
}

// --- Geçici şifre ---------------------------------------------------------------------------

/** Karıştırılan karakterler yok (0/O, 1/l/I). */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Kurum yöneticisinin ilk şifresi (12 karakter, en az bir büyük harf, küçük harf ve rakam).
 * `randomInt` dışarıdan verilir: sunucu `crypto.randomInt` kullanır, testler deterministik.
 */
export function generateTemporaryPassword(randomInt: (max: number) => number, length = 12): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    if (/[A-Z]/.test(out) && /[a-z]/.test(out) && /\d/.test(out)) return out;
  }
}
