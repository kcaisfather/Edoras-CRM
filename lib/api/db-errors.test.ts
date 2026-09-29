import { describe, expect, it } from "vitest";
import { mapDbError } from "./db-errors";

describe("mapDbError", () => {
  it("iş kuralı kodları", () => {
    expect(mapDbError({ code: "P0001", message: "CRM_BILLING_REQUIRED" })).toMatchObject({
      status: 422,
      code: "BILLING_REQUIRED",
    });
    expect(mapDbError({ code: "P0001", message: "CRM_INSTITUTION_NAME_TAKEN" }).code).toBe("INSTITUTION_NAME_TAKEN");
  });

  it("CHECK kısıtları (satır verisi değil, yalnız kısıt adı kullanılır)", () => {
    const err = {
      code: "23514",
      message: 'new row for relation "crm_institutions" violates check constraint "crm_institutions_paid_billing_check"',
    };
    expect(mapDbError(err)).toEqual({ status: 422, code: "BILLING_REQUIRED", reason: "crm_institutions_paid_billing_check" });
  });

  it("mali kaydı olan kurum silinemez", () => {
    const err = {
      code: "23503",
      message: 'update or delete on table "crm_institutions" violates foreign key constraint "crm_licenses_institution_id_fkey" on table "crm_licenses"',
    };
    expect(mapDbError(err).code).toBe("HAS_FINANCIAL_RECORDS");
  });

  it("aday kuralları: kimlik, kurum başına tek aday, silinmiş adaya not", () => {
    expect(
      mapDbError({ code: "23514", message: 'new row for relation "crm_leads" violates check constraint "crm_leads_identity_check"' })
    ).toMatchObject({ status: 422, code: "LEAD_IDENTITY_REQUIRED" });
    expect(
      mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "crm_leads_institution_id_key"' })
    ).toMatchObject({ status: 409, code: "LEAD_INSTITUTION_TAKEN" });
    expect(
      mapDbError({ code: "23503", message: 'insert or update on table "crm_notes" violates foreign key constraint "crm_notes_lead_id_fkey"' })
    ).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("migration uygulanmamışsa CONFIG_MISSING", () => {
    expect(mapDbError({ code: "PGRST205", message: "Could not find the table 'public.crm_staff'" }).code).toBe(
      "CONFIG_MISSING"
    );
  });

  it("bilinmeyen hata 500", () => {
    expect(mapDbError({ code: "XX000", message: "boom" })).toMatchObject({ status: 500, code: "INTERNAL" });
  });
});
