/**
 * Yenileme Radarı — taahhüt (yenileme niyeti) tipleri, doğrulama ve radar özeti. Saf; testler commitments.test.ts.
 * Taahhüt belirli bir bitiş gününe (cycle_end) bağlıdır: kurum yenilenip bitiş değişince geçersiz sayılır.
 * Tablo: supabase/migrations/20261005150000_crm_renewal_commitments.sql.
 */
import { z } from "zod";
import { isIsoDate } from "@/lib/domain/institutions/rules";
import type { RenewalRow } from "./renewals";
import type { GrowthCustomer } from "./types";

export const RENEWAL_COMMITMENTS = ["WILL_RENEW", "UNDECIDED", "WILL_CHURN"] as const;
export type RenewalCommitment = (typeof RENEWAL_COMMITMENTS)[number];

export const COMMITMENT_NOTE_MAX = 500;

/** GET /api/crm/renewals/commitments satırı. */
export interface RenewalCommitmentDto {
  institutionId: string;
  /** Taahhüdün geçerli olduğu bitiş günü (YYYY-MM-DD). */
  cycleEnd: string;
  status: RenewalCommitment;
  note: string | null;
  updatedByName: string | null;
  updatedAt: number;
}

/** PUT /api/crm/renewals/commitments/{institutionId} gövdesi. Aktör oturumdan; gövdeden okunmaz. */
export const commitmentSchema = z.object({
  cycleEnd: z.string().refine(isIsoDate, "Geçerli bir tarih seçin"),
  status: z.enum(RENEWAL_COMMITMENTS),
  note: z.string().trim().max(COMMITMENT_NOTE_MAX, "Not en fazla 500 karakter olabilir").nullable().default(null),
});
export type CommitmentInput = z.input<typeof commitmentSchema>;
export type CommitmentValues = z.output<typeof commitmentSchema>;

export type CommitmentMap = ReadonlyMap<string, RenewalCommitmentDto>;

export function commitmentMap(list: readonly RenewalCommitmentDto[]): Map<string, RenewalCommitmentDto> {
  return new Map(list.map((c) => [c.institutionId, c]));
}

/** Satırın GEÇERLİ taahhüdü: yalnız taahhüt bu bitiş gününe verildiyse (yenilenince eski taahhüt sayılmaz). */
export function activeCommitment(row: Pick<RenewalRow, "customer" | "endsOn">, map: CommitmentMap): RenewalCommitmentDto | null {
  const c = map.get(row.customer.id);
  return c && c.cycleEnd === row.endsOn ? c : null;
}

/** Kurumun en son biten lisansının bedeli; lisans yok (demo) ya da tutar görünmüyorsa (CRM_AGENT) null. */
export function lastLicensePrice(c: Pick<GrowthCustomer, "licenses">): number | null {
  const last = [...c.licenses].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0];
  return last && last.price != null ? last.price : null;
}

export type CommitmentFilter = RenewalCommitment | "NONE" | "";

export function parseCommitmentFilter(v: string | null | undefined): CommitmentFilter {
  return v === "NONE" || (RENEWAL_COMMITMENTS as readonly string[]).includes(v ?? "") ? (v as CommitmentFilter) : "";
}

export function matchesCommitmentFilter(c: RenewalCommitmentDto | null, filter: CommitmentFilter): boolean {
  if (!filter) return true;
  return filter === "NONE" ? c == null : c?.status === filter;
}

export interface RadarSummary {
  /** Taahhüt durumuna göre satır sayısı ("NONE" = taahhüt yok / geçersiz). */
  counts: Record<RenewalCommitment | "NONE", number>;
  /**
   * Risk altındaki bedel: ücretli kurumlarda yenilemesi güvenceye alınmamış (Yenileyecek DEĞİL) satırların son lisans
   * bedeli. Tutar hiçbir satırda görünmüyorsa (CRM_AGENT) null.
   */
  atRiskAmount: number | null;
  atRiskCount: number;
}

export function radarSummary(rows: readonly RenewalRow[], map: CommitmentMap): RadarSummary {
  const counts: RadarSummary["counts"] = { WILL_RENEW: 0, UNDECIDED: 0, WILL_CHURN: 0, NONE: 0 };
  let amount = 0;
  let known = false;
  let atRiskCount = 0;
  for (const row of rows) {
    const c = activeCommitment(row, map);
    counts[c?.status ?? "NONE"]++;
    if (c?.status === "WILL_RENEW" || row.isDemo) continue;
    atRiskCount++;
    const price = lastLicensePrice(row.customer);
    if (price != null) {
      amount += price;
      known = true;
    }
  }
  return { counts, atRiskAmount: known ? amount : null, atRiskCount };
}
