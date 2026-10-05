import { describe, expect, it } from "vitest";
import { BATCH_MAX, BATCH_STATUSES, leadBatchSchema, leadMergeSchema } from "./schemas";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("leadMergeSchema", () => {
  it("iki farklı aday kabul edilir", () => {
    expect(leadMergeSchema.safeParse({ keepId: id(1), dropId: id(2) }).success).toBe(true);
  });
  it("aynı aday kendisiyle birleştirilemez", () => {
    expect(leadMergeSchema.safeParse({ keepId: id(1), dropId: id(1) }).success).toBe(false);
  });
  it("geçersiz kimlik reddedilir", () => {
    expect(leadMergeSchema.safeParse({ keepId: "x", dropId: id(2) }).success).toBe(false);
  });
});

describe("leadBatchSchema", () => {
  const ids = [id(1), id(2)];
  it("durum: yalnız ek bilgi gerektirmeyen aşamalar", () => {
    for (const status of BATCH_STATUSES) expect(leadBatchSchema.safeParse({ ids, action: { type: "status", status } }).success).toBe(true);
    for (const status of ["OLUMSUZ", "SATIS_OLDU", "TAKIPTE", "TEKLIF_VERILDI"]) {
      expect(leadBatchSchema.safeParse({ ids, action: { type: "status", status } }).success).toBe(false);
    }
  });
  it("sorumlu: kişi ya da null (sorumlusuz)", () => {
    expect(leadBatchSchema.safeParse({ ids, action: { type: "owner", ownerId: id(9) } }).success).toBe(true);
    expect(leadBatchSchema.safeParse({ ids, action: { type: "owner", ownerId: null } }).success).toBe(true);
    expect(leadBatchSchema.safeParse({ ids, action: { type: "owner" } }).success).toBe(false);
  });
  it("silme ek alan istemez", () => {
    expect(leadBatchSchema.safeParse({ ids, action: { type: "delete" } }).success).toBe(true);
  });
  it("bilinmeyen işlem reddedilir", () => {
    expect(leadBatchSchema.safeParse({ ids, action: { type: "merge" } }).success).toBe(false);
  });
  it("boş liste ve üst sınır", () => {
    expect(leadBatchSchema.safeParse({ ids: [], action: { type: "delete" } }).success).toBe(false);
    const many = Array.from({ length: BATCH_MAX }, (_, i) => id(i + 1));
    expect(leadBatchSchema.safeParse({ ids: many, action: { type: "delete" } }).success).toBe(true);
    expect(leadBatchSchema.safeParse({ ids: [...many, id(999)], action: { type: "delete" } }).success).toBe(false);
  });
});
