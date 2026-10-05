import { describe, expect, it } from "vitest";
import {
  activeCommitment,
  commitmentMap,
  commitmentSchema,
  lastLicensePrice,
  matchesCommitmentFilter,
  parseCommitmentFilter,
  radarSummary,
  type RenewalCommitmentDto,
} from "./commitments";
import type { RenewalRow } from "./renewals";
import type { GrowthCustomer } from "./types";

const customer = (id: string, over: Partial<GrowthCustomer> = {}): GrowthCustomer =>
  ({ id, name: id, licenses: [], payments: null, usage: null, status: "UCRETLI", ...over }) as unknown as GrowthCustomer;

const row = (id: string, endsOn: string, over: { price?: number | null; isDemo?: boolean } = {}): RenewalRow => ({
  customer: customer(id, {
    licenses: over.price === undefined ? [] : [{ startsOn: "2025-01-01", endsOn, price: over.price, free: false }],
  }),
  bucket: "d15_30",
  daysLeft: 20,
  endsOn,
  isDemo: over.isDemo ?? false,
});

const commit = (institutionId: string, cycleEnd: string, status: RenewalCommitmentDto["status"]): RenewalCommitmentDto => ({
  institutionId,
  cycleEnd,
  status,
  note: null,
  updatedByName: null,
  updatedAt: 0,
});

describe("activeCommitment", () => {
  it("bitiş günü aynıysa geçerli, kurum yenilenip bitiş değiştiyse geçersiz", () => {
    const map = commitmentMap([commit("a", "2026-11-01", "WILL_RENEW")]);
    expect(activeCommitment(row("a", "2026-11-01"), map)?.status).toBe("WILL_RENEW");
    expect(activeCommitment(row("a", "2027-11-01"), map)).toBeNull();
    expect(activeCommitment(row("b", "2026-11-01"), map)).toBeNull();
  });
});

describe("lastLicensePrice", () => {
  it("en son biten lisansın bedeli; tutar görünmüyorsa ya da lisans yoksa null", () => {
    const lic = (endsOn: string, price: number | null) => ({ startsOn: "2024-01-01", endsOn, price, free: false });
    expect(lastLicensePrice({ licenses: [lic("2025-01-01", 100), lic("2026-01-01", 250)] })).toBe(250);
    expect(lastLicensePrice({ licenses: [lic("2026-01-01", null)] })).toBeNull();
    expect(lastLicensePrice({ licenses: [] })).toBeNull();
  });
});

describe("radarSummary", () => {
  const rows = [
    row("a", "2026-11-01", { price: 1000 }),
    row("b", "2026-11-02", { price: 2000 }),
    row("c", "2026-11-03", { price: 4000 }),
    row("d", "2026-11-04", { isDemo: true }),
  ];
  const map = commitmentMap([commit("a", "2026-11-01", "WILL_RENEW"), commit("b", "2026-11-02", "WILL_CHURN"), commit("c", "2020-01-01", "WILL_RENEW")]);

  it("sayılar: geçersiz (eski bitişli) taahhüt 'yok' sayılır", () => {
    expect(radarSummary(rows, map).counts).toEqual({ WILL_RENEW: 1, UNDECIDED: 0, WILL_CHURN: 1, NONE: 2 });
  });
  it("risk altındaki bedel: yenileyecek ve demo hariç, son lisans bedelleri toplanır", () => {
    const r = radarSummary(rows, map);
    expect(r.atRiskCount).toBe(2);
    expect(r.atRiskAmount).toBe(6000);
  });
  it("tutar hiçbir satırda görünmüyorsa bedel null (CRM_AGENT)", () => {
    const hidden = [row("a", "2026-11-01", { price: null })];
    expect(radarSummary(hidden, commitmentMap([])).atRiskAmount).toBeNull();
    expect(radarSummary(hidden, commitmentMap([])).atRiskCount).toBe(1);
  });
});

describe("süzgeç", () => {
  it("parse ve eşleşme", () => {
    expect(parseCommitmentFilter("NONE")).toBe("NONE");
    expect(parseCommitmentFilter("WILL_CHURN")).toBe("WILL_CHURN");
    expect(parseCommitmentFilter("x")).toBe("");
    expect(matchesCommitmentFilter(null, "NONE")).toBe(true);
    expect(matchesCommitmentFilter(commit("a", "2026-11-01", "UNDECIDED"), "NONE")).toBe(false);
    expect(matchesCommitmentFilter(commit("a", "2026-11-01", "UNDECIDED"), "UNDECIDED")).toBe(true);
    expect(matchesCommitmentFilter(null, "")).toBe(true);
  });
});

describe("commitmentSchema", () => {
  it("geçerli gövde; not verilmezse null", () => {
    expect(commitmentSchema.parse({ cycleEnd: "2026-11-01", status: "UNDECIDED" })).toEqual({ cycleEnd: "2026-11-01", status: "UNDECIDED", note: null });
  });
  it("geçersiz tarih, bilinmeyen durum ve uzun not reddedilir; aktör alanı atılır", () => {
    expect(commitmentSchema.safeParse({ cycleEnd: "2026-02-30", status: "UNDECIDED" }).success).toBe(false);
    expect(commitmentSchema.safeParse({ cycleEnd: "2026-11-01", status: "MAYBE" }).success).toBe(false);
    expect(commitmentSchema.safeParse({ cycleEnd: "2026-11-01", status: "UNDECIDED", note: "x".repeat(501) }).success).toBe(false);
    const v = commitmentSchema.parse({ cycleEnd: "2026-11-01", status: "UNDECIDED", updatedBy: "x" });
    expect("updatedBy" in v).toBe(false);
  });
});
