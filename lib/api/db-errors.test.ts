import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import tr from "@/messages/tr.json";
import { mapDbError } from "./db-errors";
import { API_ERROR_CODES } from "./error-codes";

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

  it("görev kuralları: tamamlanmış, atanan değil, geçmiş gün, çift tamamlama yarışı", () => {
    expect(mapDbError({ code: "P0001", message: "CRM_TASK_ALREADY_DONE" })).toMatchObject({ status: 409, code: "TASK_ALREADY_DONE" });
    expect(mapDbError({ code: "P0001", message: "CRM_TASK_NOT_DONE" })).toMatchObject({ status: 409, code: "TASK_NOT_DONE" });
    expect(mapDbError({ code: "P0001", message: "CRM_TASK_NOT_ASSIGNEE" })).toMatchObject({ status: 403, code: "TASK_NOT_ASSIGNEE" });
    expect(mapDbError({ code: "P0001", message: "CRM_TASK_NOT_COMPLETER" })).toMatchObject({ status: 403, code: "TASK_NOT_COMPLETER" });
    expect(mapDbError({ code: "P0001", message: "CRM_TASK_PAST_DUE" })).toMatchObject({ status: 400, code: "TASK_PAST_DUE" });
    expect(
      mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "crm_tasks_task_key_key"' })
    ).toMatchObject({ status: 409, code: "TASK_ALREADY_DONE" });
    expect(
      mapDbError({ code: "23503", message: 'insert or update on table "crm_tasks" violates foreign key constraint "crm_tasks_lead_id_fkey"' })
    ).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("soğuk liste kuralları: taşınmış kişi, liste içi mükerrer, silinmiş liste, istek sınırı", () => {
    expect(mapDbError({ code: "P0001", message: "CRM_PROSPECT_ALREADY_MOVED" })).toMatchObject({ status: 409, code: "PROSPECT_ALREADY_MOVED" });
    expect(mapDbError({ code: "P0001", message: "CRM_PROSPECT_LIST_NOT_FOUND" })).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mapDbError({ code: "P0001", message: "CRM_PROSPECT_BATCH_TOO_LARGE" })).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(
      mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "crm_prospects_list_phone_key"' })
    ).toMatchObject({ status: 409, code: "PROSPECT_DUPLICATE" });
    expect(
      mapDbError({ code: "23503", message: 'insert or update on table "crm_prospects" violates foreign key constraint "crm_prospects_list_id_fkey"' })
    ).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("migration'lardaki her CRM_ hata kodu bir API koduna eşlenir", () => {
    const dir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
    const raised = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      for (const m of readFileSync(`${dir}${file}`, "utf8").matchAll(/raise exception '(CRM_[A-Z_]+)'/g)) raised.add(m[1]);
    }
    // İşlem kaydına güncelleme / silme yalnız kod hatasında olur: bilerek 500 (INTERNAL) kalır.
    raised.delete("CRM_AUDIT_APPEND_ONLY");
    expect(raised.size).toBeGreaterThan(10);
    for (const code of raised) {
      expect(mapDbError({ code: "P0001", message: code }).code, code).not.toBe("INTERNAL");
    }
  });

  it("her API hata kodunun Türkçe metni var", () => {
    const codes = tr.common.errors.codes as Record<string, string>;
    for (const code of API_ERROR_CODES) expect(codes[code], code).toBeTruthy();
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
