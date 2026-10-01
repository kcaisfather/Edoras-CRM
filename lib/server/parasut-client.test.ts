import { beforeEach, describe, expect, it } from "vitest";
import {
  activeDocument,
  documentPdfUrl,
  issueWithParasut,
  resetParasutTokenCache,
  type ParasutConfig,
  type ParasutIssueInput,
  type ParasutRefs,
} from "./parasut-client";

const CONFIG: ParasutConfig = {
  clientId: "cid",
  clientSecret: "secret",
  username: "muhasebe@edoras.test",
  password: "pw",
  companyId: "1234",
  baseUrl: "https://parasut.test",
};

const INPUT: ParasutIssueInput = {
  customer: {
    kind: "COMPANY",
    name: "Örnek Kolej A.Ş.",
    taxNumber: "1234567890",
    taxOffice: "Bakırköy",
    address: "Atatürk Cad. No: 12",
    district: "Bakırköy",
    city: "İstanbul",
    email: "muhasebe@kolej.test",
  },
  description: "Edoras yıllık lisans bedeli",
  net: 1000,
  vatRate: 20,
  issueDate: "2026-10-05",
};

interface Call {
  method: string;
  path: string;
  body: unknown;
  auth: string | null;
}

/** Sahte Paraşüt: yol + yönteme göre yanıt. Her senaryo yalnız ihtiyaç duyduğu davranışı değiştirir. */
function fakeParasut(overrides: Partial<Record<string, (call: Call) => Response>> = {}) {
  const calls: Call[] = [];
  const state = { jobPolls: 0, jobDoneAfter: 1, jobError: false, inbox: false, existingContact: false, formalized: false };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const handlers: Record<string, (call: Call) => Response> = {
    "POST /oauth/token": () => json(200, { access_token: "tok-1", token_type: "bearer", expires_in: 7200 }),
    "GET /v4/1234/contacts": () => json(200, { data: state.existingContact ? [{ id: "c-9", type: "contacts" }] : [] }),
    "POST /v4/1234/contacts": () => json(201, { data: { id: "c-1", type: "contacts" } }),
    "GET /v4/1234/products": () => json(200, { data: [] }),
    "POST /v4/1234/products": () => json(201, { data: { id: "p-1", type: "products" } }),
    "POST /v4/1234/sales_invoices": () => json(201, { data: { id: "si-1", type: "sales_invoices" } }),
    "GET /v4/1234/e_invoice_inboxes": () =>
      json(200, { data: state.inbox ? [{ id: "ib-1", type: "e_invoice_inboxes", attributes: { e_invoice_address: "urn:mail:defaultpk@kolej" } }] : [] }),
    "POST /v4/1234/e_archives": () => json(201, { data: { id: "job-1", type: "trackable_jobs" } }),
    "POST /v4/1234/e_invoices": () => json(201, { data: { id: "job-2", type: "trackable_jobs" } }),
    "GET /v4/1234/trackable_jobs/job-1": () => jobResponse(),
    "GET /v4/1234/trackable_jobs/job-2": () => jobResponse(),
    "GET /v4/1234/sales_invoices/si-1": () => {
      if (!state.formalized) return json(200, { data: { id: "si-1", type: "sales_invoices", attributes: {}, relationships: { active_e_document: { data: null } } } });
      const docType = state.inbox ? "e_invoices" : "e_archives";
      return json(200, {
        data: { id: "si-1", type: "sales_invoices", attributes: { invoice_no: "TASLAK-1" }, relationships: { active_e_document: { data: { id: "doc-1", type: docType } } } },
        included: [{ id: "doc-1", type: docType, attributes: { invoice_number: "EDR2026000000001", uuid: "u-1" } }],
      });
    },
    "GET /v4/1234/e_archives/doc-1/pdf": () => json(200, { data: { id: "pdf-1", type: "e_document_pdfs", attributes: { url: "https://cdn.parasut.test/a.pdf" } } }),
    ...overrides,
  };

  function jobResponse() {
    state.jobPolls += 1;
    if (state.jobError) return json(200, { data: { id: "job-1", type: "trackable_jobs", attributes: { status: "error", errors: ["VKN hatalı"] } } });
    const done = state.jobPolls >= state.jobDoneAfter;
    if (done) state.formalized = true;
    return json(200, { data: { id: "job-1", type: "trackable_jobs", attributes: { status: done ? "done" : "running" } } });
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : null;
    const call = { method, path: url.pathname, body, auth: headers.get("authorization") };
    calls.push(call);
    const handler = handlers[`${method} ${url.pathname}`];
    return handler ? handler(call) : new Response("{}", { status: 404 });
  }) as typeof fetch;

  return { fetch: fetchImpl, calls, state };
}

function deps(fake: ReturnType<typeof fakeParasut>, saved: ParasutRefs[] = []) {
  return {
    fetch: fake.fetch,
    sleep: async () => undefined,
    saveRefs: async (refs: ParasutRefs) => {
      saved.push(refs);
    },
    pollAttempts: 3,
    pollIntervalMs: 1,
  };
}

const NO_REFS: ParasutRefs = { salesInvoiceId: null, jobId: null };

beforeEach(() => resetParasutTokenCache());

describe("issueWithParasut", () => {
  it("e-Fatura mükellefi olmayan müşteride e-Arşiv keser, referansları adım adım kaydeder", async () => {
    const fake = fakeParasut();
    const saved: ParasutRefs[] = [];
    const result = await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake, saved));

    expect(result).toEqual({ ok: true, invoiceNo: "EDR2026000000001", type: "E_ARSIV", refs: { salesInvoiceId: "si-1", jobId: null } });
    expect(saved).toEqual([
      { salesInvoiceId: "si-1", jobId: null },
      { salesInvoiceId: "si-1", jobId: "job-1" },
      { salesInvoiceId: "si-1", jobId: null },
    ]);
    // Jeton password grant ile alınır, istekler Bearer taşır.
    const token = fake.calls.find((c) => c.path === "/oauth/token");
    expect(token?.body).toMatchObject({ grant_type: "password", client_id: "cid", username: "muhasebe@edoras.test" });
    expect(fake.calls.filter((c) => c.path.startsWith("/v4/")).every((c) => c.auth === "Bearer tok-1")).toBe(true);
  });

  it("satış faturası: müşteri + ürün ilişkisi, net birim fiyat ve KDV oranı, TRL", async () => {
    const fake = fakeParasut();
    await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake));
    const contact = fake.calls.find((c) => c.method === "POST" && c.path.endsWith("/contacts"));
    expect(contact?.body).toMatchObject({
      data: { type: "contacts", attributes: { name: "Örnek Kolej A.Ş.", contact_type: "company", account_type: "customer", tax_number: "1234567890", tax_office: "Bakırköy" } },
    });
    const invoice = fake.calls.find((c) => c.method === "POST" && c.path.endsWith("/sales_invoices"));
    expect(invoice?.body).toMatchObject({
      data: {
        type: "sales_invoices",
        attributes: { item_type: "invoice", issue_date: "2026-10-05", currency: "TRL" },
        relationships: {
          contact: { data: { id: "c-1", type: "contacts" } },
          details: { data: [{ attributes: { quantity: 1, unit_price: 1000, vat_rate: 20 }, relationships: { product: { data: { id: "p-1", type: "products" } } } }] },
        },
      },
    });
  });

  it("e-Fatura mükellefinde gelen kutusuna temel senaryoyla e-Fatura keser", async () => {
    const fake = fakeParasut();
    fake.state.inbox = true;
    const result = await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake));
    expect(result).toMatchObject({ ok: true, type: "E_FATURA" });
    const formalize = fake.calls.find((c) => c.method === "POST" && c.path.endsWith("/e_invoices"));
    expect(formalize?.body).toMatchObject({
      data: { type: "e_invoices", attributes: { scenario: "basic", to: "urn:mail:defaultpk@kolej" }, relationships: { invoice: { data: { id: "si-1" } } } },
    });
  });

  it("var olan müşteri ve PARASUT_PRODUCT_ID yeniden kullanılır (yeni kayıt açılmaz)", async () => {
    const fake = fakeParasut();
    fake.state.existingContact = true;
    await issueWithParasut({ ...CONFIG, productId: "p-77" }, INPUT, NO_REFS, deps(fake));
    expect(fake.calls.some((c) => c.method === "POST" && c.path.endsWith("/contacts"))).toBe(false);
    expect(fake.calls.some((c) => c.path.endsWith("/products"))).toBe(false);
    const invoice = fake.calls.find((c) => c.method === "POST" && c.path.endsWith("/sales_invoices"));
    expect(JSON.stringify(invoice?.body)).toContain('"c-9"');
    expect(JSON.stringify(invoice?.body)).toContain('"p-77"');
  });

  it("iş bitmezse parasut:pending; yeniden denemede yeni satış faturası açılmaz, aynı iş sorulur", async () => {
    const fake = fakeParasut();
    fake.state.jobDoneAfter = 5;
    const first = await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake));
    expect(first).toEqual({ ok: false, error: "parasut:pending", refs: { salesInvoiceId: "si-1", jobId: "job-1" } });

    const retry = await issueWithParasut(CONFIG, INPUT, first.refs, deps(fake));
    expect(retry).toMatchObject({ ok: true, invoiceNo: "EDR2026000000001" });
    expect(fake.calls.filter((c) => c.method === "POST" && c.path.endsWith("/sales_invoices"))).toHaveLength(1);
    expect(fake.calls.filter((c) => c.method === "POST" && c.path.endsWith("/e_archives"))).toHaveLength(1);
  });

  it("resmileştirme hatasında iş kimliği boşalır; satış faturası kimliği kalır", async () => {
    const fake = fakeParasut();
    fake.state.jobError = true;
    const result = await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake));
    expect(result).toEqual({ ok: false, error: "parasut:formalize:error", refs: { salesInvoiceId: "si-1", jobId: null } });
  });

  it("satış faturası var ama iş kaydı yoksa ve belge zaten resmileşmişse yeniden resmileştirmez", async () => {
    const fake = fakeParasut();
    fake.state.formalized = true;
    const result = await issueWithParasut(CONFIG, INPUT, { salesInvoiceId: "si-1", jobId: null }, deps(fake));
    expect(result).toMatchObject({ ok: true, type: "E_ARSIV" });
    expect(fake.calls.filter((c) => c.method === "POST" && c.path.startsWith("/v4/"))).toHaveLength(0);
  });

  it("HTTP hatasında kısa kod döner; gövde (kişisel veri) taşınmaz", async () => {
    const fake = fakeParasut({
      "POST /v4/1234/sales_invoices": () => new Response(JSON.stringify({ errors: [{ detail: "VKN 1234567890 geçersiz" }] }), { status: 422 }),
    });
    const result = await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake));
    expect(result).toEqual({ ok: false, error: "parasut:invoice:422", refs: NO_REFS });
  });

  it("hatalı kimlik bilgisi parasut:auth:401 döner", async () => {
    const fake = fakeParasut({ "POST /oauth/token": () => new Response("{}", { status: 401 }) });
    const result = await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake));
    expect(result).toMatchObject({ ok: false, error: "parasut:auth:401" });
  });

  it("401 alınca jeton bir kez yenilenir; 429'da beklenip yeniden denenir", async () => {
    let contactCalls = 0;
    let tokens = 0;
    const fake = fakeParasut({
      "POST /oauth/token": () => new Response(JSON.stringify({ access_token: `tok-${++tokens}`, expires_in: 7200 }), { status: 200 }),
      "GET /v4/1234/contacts": () => {
        contactCalls += 1;
        if (contactCalls === 1) return new Response("{}", { status: 401 });
        if (contactCalls === 2) return new Response("{}", { status: 429, headers: { "Retry-After": "1" } });
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
    });
    const result = await issueWithParasut(CONFIG, INPUT, NO_REFS, deps(fake));
    expect(result.ok).toBe(true);
    expect(tokens).toBe(2);
    expect(contactCalls).toBe(3);
  });

  it("referans kaydedilemezse (veritabanı) akış durur ve hata yukarı fırlar", async () => {
    const fake = fakeParasut();
    await expect(
      issueWithParasut(CONFIG, INPUT, NO_REFS, { ...deps(fake), saveRefs: async () => Promise.reject(new Error("db")) })
    ).rejects.toThrow("db");
    expect(fake.calls.some((c) => c.path.endsWith("/e_archives"))).toBe(false);
  });
});

describe("belge ve PDF", () => {
  it("resmileşmemiş satış faturası null; PDF adresi https ise döner", async () => {
    const fake = fakeParasut();
    expect(await activeDocument(CONFIG, deps(fake), "si-1")).toBeNull();
    fake.state.formalized = true;
    const doc = await activeDocument(CONFIG, deps(fake), "si-1");
    expect(doc).toEqual({ id: "doc-1", type: "E_ARSIV", invoiceNo: "EDR2026000000001" });
    expect(await documentPdfUrl(CONFIG, deps(fake), doc!)).toBe("https://cdn.parasut.test/a.pdf");
  });

  it("PDF henüz hazır değilse (204) null", async () => {
    const fake = fakeParasut({ "GET /v4/1234/e_archives/doc-1/pdf": () => new Response(null, { status: 204 }) });
    expect(await documentPdfUrl(CONFIG, deps(fake), { id: "doc-1", type: "E_ARSIV" })).toBeNull();
  });
});
