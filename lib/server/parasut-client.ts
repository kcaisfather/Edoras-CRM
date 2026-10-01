/**
 * Paraşüt API v4 istemcisi (https://apidocs.parasut.com). Ortam değişkeni okumaz, `fetch` / bekleme / referans kaydı
 * dışarıdan verilir: birim testleri gerçek ağa çıkmadan bütün akışı dener. Sunucu tarafı bağlantısı:
 * `lib/server/invoices.ts` (ortam değişkenleri, satır güncellemesi).
 *
 * Akış (Paraşüt "Satış Faturası Oluşturma" + "Satış Faturası Resmileştirme"):
 *   1. OAuth2 password grant → access_token (2 saat; süreç içinde önbellekte, 401'de bir kez yenilenir)
 *   2. Müşteri: VKN/TCKN ile `/contacts?filter[tax_number]=` → yoksa oluştur
 *   3. Ürün: PARASUT_PRODUCT_ID ya da `EDORAS-LISANS` kodlu hizmet → yoksa oluştur (fatura kalemi ürün ister)
 *   4. Satış faturası (`/sales_invoices`, 1 kalem: net tutar + KDV oranı) → kimliği HEMEN kaydedilir (`saveRefs`)
 *   5. e-Fatura mükellefi mi: `/e_invoice_inboxes?filter[vkn]=` → kutusu varsa e-Fatura (`/e_invoices`, temel senaryo),
 *      yoksa e-Arşiv (`/e_archives`). Yanıt bir iş (trackable job) döner → iş kimliği kaydedilir.
 *   6. İş `done` olana dek kısa aralıklarla sorulur. Süre yetmezse `parasut:pending` — iş kimliği satırda kaldığı için
 *      "Yeniden dene" aynı işi sormaya devam eder; yeni satış faturası AÇILMAZ.
 *   7. `/sales_invoices/{id}?include=active_e_document` → belge türü + GİB fatura numarası.
 *
 * Hata hâlinde yalnız kısa kod döner (`parasut:<adım>:<http durumu>`); Paraşüt'ün gövdesi (müşteri adı, VKN taşıyabilir)
 * döndürülmez ve loglanmaz.
 */

export const PARASUT_BASE_URL = "https://api.parasut.com";
/** Ürün kimliği verilmezse bu kodla aranır / oluşturulur. */
export const PARASUT_PRODUCT_CODE = "EDORAS-LISANS";
const PRODUCT_NAME = "Edoras yıllık lisans";
const REQUEST_TIMEOUT_MS = 20_000;

export interface ParasutConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  companyId: string;
  /** Fatura kalemindeki ürün/hizmet (isteğe bağlı; boşsa `EDORAS-LISANS` kodlu hizmet bulunur ya da açılır). */
  productId?: string | null;
  baseUrl?: string;
}

export interface ParasutCustomer {
  /** COMPANY → VKN (10 hane) + vergi dairesi; INDIVIDUAL → TCKN (11 hane). */
  kind: "COMPANY" | "INDIVIDUAL";
  name: string;
  taxNumber: string;
  taxOffice: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  email: string | null;
}

export interface ParasutIssueInput {
  customer: ParasutCustomer;
  description: string;
  /** KDV hariç tutar (TRY). */
  net: number;
  vatRate: number;
  /** YYYY-MM-DD. */
  issueDate: string;
}

/** Satırda saklanan sağlayıcı referansları (crm_invoices.provider_ref / provider_job). */
export interface ParasutRefs {
  salesInvoiceId: string | null;
  jobId: string | null;
}

export interface ParasutDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Referans değişince çağrılır (satış faturası açıldı, iş başladı / bitti). Hata fırlatırsa akış durur. */
  saveRefs: (refs: ParasutRefs) => Promise<void>;
  /** İş durumu kaç kez sorulur (varsayılan 10) ve aralık (ms, varsayılan 2500). */
  pollAttempts?: number;
  pollIntervalMs?: number;
}

export type ParasutDocType = "E_FATURA" | "E_ARSIV";

export type ParasutResult =
  | { ok: true; invoiceNo: string; type: ParasutDocType; refs: ParasutRefs }
  | { ok: false; error: string; refs: ParasutRefs };

/** Paraşüt çağrısı başarısız (kısa kod; gövde yok). */
export class ParasutError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ParasutError";
  }
}

// --- Kimlik jetonu ---------------------------------------------------------------------------------

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/** Testler için: önbelleği boşaltır. */
export function resetParasutTokenCache(): void {
  tokenCache.clear();
}

const cacheKey = (c: ParasutConfig) => `${c.baseUrl ?? PARASUT_BASE_URL}|${c.clientId}|${c.username}`;

type HttpDeps = Pick<ParasutDeps, "fetch" | "sleep">;

async function fetchToken(config: ParasutConfig, deps: HttpDeps): Promise<string> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    username: config.username,
    password: config.password,
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
  });
  let res: Response;
  try {
    res = await deps.fetch(`${config.baseUrl ?? PARASUT_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ParasutError("parasut:auth:network");
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new ParasutError(`parasut:auth:${res.status}`);
  }
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!json?.access_token) throw new ParasutError("parasut:auth:invalid");
  // Süreden bir dakika önce yenile.
  const ttlMs = Math.max(60, (json.expires_in ?? 7200) - 60) * 1000;
  tokenCache.set(key, { token: json.access_token, expiresAt: Date.now() + ttlMs });
  return json.access_token;
}

// --- İstek ------------------------------------------------------------------------------------------

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}

interface JsonApiDoc {
  data?: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
}

/** Şirket kapsamlı istek (`/v4/{company_id}/…`). 401'de jeton bir kez yenilenir, 429'da bir kez beklenir. */
async function api(
  config: ParasutConfig,
  deps: HttpDeps,
  step: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<{ status: number; doc: JsonApiDoc | null }> {
  const url = `${config.baseUrl ?? PARASUT_BASE_URL}/v4/${encodeURIComponent(config.companyId)}${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await fetchToken(config, deps);
    let res: Response;
    try {
      res = await deps.fetch(url, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new ParasutError(`parasut:${step}:network`);
    }
    if (res.status === 401 && attempt === 0) {
      await res.body?.cancel().catch(() => undefined);
      tokenCache.delete(cacheKey(config));
      continue;
    }
    if (res.status === 429 && attempt < 2) {
      await res.body?.cancel().catch(() => undefined);
      const retryAfter = Number(res.headers.get("retry-after"));
      await deps.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 3000);
      continue;
    }
    if (res.status === 204) return { status: 204, doc: null };
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new ParasutError(`parasut:${step}:${res.status}`);
    }
    return { status: res.status, doc: (await res.json().catch(() => null)) as JsonApiDoc | null };
  }
  throw new ParasutError(`parasut:${step}:retry`);
}

const first = (doc: JsonApiDoc | null): JsonApiResource | null =>
  Array.isArray(doc?.data) ? (doc.data[0] ?? null) : (doc?.data ?? null);

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

// --- Adımlar ----------------------------------------------------------------------------------------

async function findOrCreateContact(config: ParasutConfig, deps: ParasutDeps, c: ParasutCustomer): Promise<string> {
  const found = await api(config, deps, "contact", `/contacts?${qs({ "filter[tax_number]": c.taxNumber, "page[size]": "1" })}`);
  const existing = first(found.doc);
  if (existing?.id) return existing.id;

  const created = await api(config, deps, "contact", "/contacts", {
    method: "POST",
    body: {
      data: {
        type: "contacts",
        attributes: {
          name: c.name,
          contact_type: c.kind === "COMPANY" ? "company" : "person",
          account_type: "customer",
          tax_number: c.taxNumber,
          ...(c.taxOffice ? { tax_office: c.taxOffice } : {}),
          ...(c.address ? { address: c.address } : {}),
          ...(c.district ? { district: c.district } : {}),
          ...(c.city ? { city: c.city } : {}),
          ...(c.email ? { email: c.email } : {}),
          country: "Türkiye",
          is_abroad: false,
        },
      },
    },
  });
  const id = first(created.doc)?.id;
  if (!id) throw new ParasutError("parasut:contact:invalid");
  return id;
}

async function findOrCreateProduct(config: ParasutConfig, deps: ParasutDeps, vatRate: number): Promise<string> {
  if (config.productId?.trim()) return config.productId.trim();
  const found = await api(config, deps, "product", `/products?${qs({ "filter[code]": PARASUT_PRODUCT_CODE, "page[size]": "1" })}`);
  const existing = first(found.doc);
  if (existing?.id) return existing.id;

  const created = await api(config, deps, "product", "/products", {
    method: "POST",
    body: {
      data: {
        type: "products",
        attributes: { code: PARASUT_PRODUCT_CODE, name: PRODUCT_NAME, vat_rate: vatRate, unit: "Adet", currency: "TRL", inventory_tracking: false },
      },
    },
  });
  const id = first(created.doc)?.id;
  if (!id) throw new ParasutError("parasut:product:invalid");
  return id;
}

async function createSalesInvoice(
  config: ParasutConfig,
  deps: ParasutDeps,
  input: ParasutIssueInput,
  contactId: string,
  productId: string
): Promise<string> {
  const created = await api(config, deps, "invoice", "/sales_invoices", {
    method: "POST",
    body: {
      data: {
        type: "sales_invoices",
        attributes: {
          item_type: "invoice",
          description: input.description,
          issue_date: input.issueDate,
          due_date: input.issueDate,
          currency: "TRL",
        },
        relationships: {
          contact: { data: { id: contactId, type: "contacts" } },
          details: {
            data: [
              {
                type: "sales_invoice_details",
                attributes: { quantity: 1, unit_price: input.net, vat_rate: input.vatRate, description: input.description },
                relationships: { product: { data: { id: productId, type: "products" } } },
              },
            ],
          },
        },
      },
    },
  });
  const id = first(created.doc)?.id;
  if (!id) throw new ParasutError("parasut:invoice:invalid");
  return id;
}

/** e-Fatura mükellefiyse gelen kutusu adresi, değilse null (→ e-Arşiv). */
async function eInvoiceInbox(config: ParasutConfig, deps: ParasutDeps, taxNumber: string): Promise<string | null> {
  const res = await api(config, deps, "inbox", `/e_invoice_inboxes?${qs({ "filter[vkn]": taxNumber })}`);
  const inbox = first(res.doc);
  const address = inbox?.attributes?.e_invoice_address;
  return typeof address === "string" && address ? address : null;
}

async function startFormalization(config: ParasutConfig, deps: ParasutDeps, salesInvoiceId: string, taxNumber: string): Promise<string> {
  const inbox = await eInvoiceInbox(config, deps, taxNumber);
  const body = inbox
    ? {
        data: {
          type: "e_invoices",
          attributes: { scenario: "basic", to: inbox },
          relationships: { invoice: { data: { id: salesInvoiceId, type: "sales_invoices" } } },
        },
      }
    : {
        data: {
          type: "e_archives",
          attributes: {},
          relationships: { sales_invoice: { data: { id: salesInvoiceId, type: "sales_invoices" } } },
        },
      };
  const res = await api(config, deps, "formalize", inbox ? "/e_invoices" : "/e_archives", { method: "POST", body });
  const jobId = first(res.doc)?.id;
  if (!jobId) throw new ParasutError("parasut:formalize:invalid");
  return jobId;
}

type JobStatus = "pending" | "running" | "done" | "error";

async function jobStatus(config: ParasutConfig, deps: ParasutDeps, jobId: string): Promise<JobStatus> {
  const res = await api(config, deps, "job", `/trackable_jobs/${encodeURIComponent(jobId)}`);
  const status = first(res.doc)?.attributes?.status;
  return status === "done" || status === "error" || status === "running" ? status : "pending";
}

export interface ActiveDocument {
  id: string;
  type: ParasutDocType;
  invoiceNo: string | null;
}

/** Satış faturasının resmileşmiş belgesi (yoksa null). */
export async function activeDocument(config: ParasutConfig, deps: HttpDeps, salesInvoiceId: string): Promise<ActiveDocument | null> {
  const res = await api(config, deps, "document", `/sales_invoices/${encodeURIComponent(salesInvoiceId)}?include=active_e_document`);
  const invoice = first(res.doc);
  const rel = invoice?.relationships?.active_e_document?.data;
  if (!rel?.id) return null;
  const doc = res.doc?.included?.find((r) => r.id === rel.id && r.type === rel.type);
  const type: ParasutDocType = rel.type === "e_invoices" ? "E_FATURA" : "E_ARSIV";
  const candidates = [doc?.attributes?.invoice_number, invoice?.attributes?.invoice_no, doc?.attributes?.uuid];
  const invoiceNo = candidates.find((v): v is string => typeof v === "string" && v.trim().length > 0) ?? null;
  return { id: rel.id, type, invoiceNo: invoiceNo ? invoiceNo.trim().slice(0, 64) : null };
}

/** Resmileşmiş belgenin PDF adresi (1 saat geçerli). PDF henüz hazır değilse null (Paraşüt 204). */
export async function documentPdfUrl(
  config: ParasutConfig,
  deps: HttpDeps,
  doc: Pick<ActiveDocument, "id" | "type">
): Promise<string | null> {
  const path = doc.type === "E_FATURA" ? "e_invoices" : "e_archives";
  const res = await api(config, deps, "pdf", `/${path}/${encodeURIComponent(doc.id)}/pdf`);
  const url = first(res.doc)?.attributes?.url;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

// --- Ana akış ---------------------------------------------------------------------------------------

/**
 * Faturayı Paraşüt'te keser ya da yarım kalmış işi sürdürür (`refs`). Fırlatmaz: her sonuç `{ ok }` ile döner ve son
 * referansları taşır. `saveRefs` hatası (veritabanı) ise yukarı fırlar — kaydedilemeyen satış faturası, sonraki denemede
 * ikinci kez açılmasın diye akış orada durur.
 */
export async function issueWithParasut(
  config: ParasutConfig,
  input: ParasutIssueInput,
  initial: ParasutRefs,
  deps: ParasutDeps
): Promise<ParasutResult> {
  let refs: ParasutRefs = { ...initial };
  const save = async (next: ParasutRefs) => {
    refs = next;
    await deps.saveRefs(next);
  };

  try {
    // 1) Satış faturası: yoksa aç ve kimliği hemen kaydet.
    if (!refs.salesInvoiceId) {
      const contactId = await findOrCreateContact(config, deps, input.customer);
      const productId = await findOrCreateProduct(config, deps, input.vatRate);
      const salesInvoiceId = await createSalesInvoice(config, deps, input, contactId, productId);
      await save({ salesInvoiceId, jobId: null });
    }
    const salesInvoiceId = refs.salesInvoiceId as string;

    // 2) Daha önce resmileşmiş olabilir (iş bitti ama yanıt bize ulaşmadı).
    if (!refs.jobId) {
      const done = await activeDocument(config, deps, salesInvoiceId);
      if (done) return finish(done);
      await save({ salesInvoiceId, jobId: await startFormalization(config, deps, salesInvoiceId, input.customer.taxNumber) });
    }

    // 3) İşi bekle.
    const attempts = deps.pollAttempts ?? 10;
    const interval = deps.pollIntervalMs ?? 2500;
    for (let i = 0; i < attempts; i++) {
      const status = await jobStatus(config, deps, refs.jobId as string);
      if (status === "done") {
        await save({ salesInvoiceId, jobId: null });
        const doc = await activeDocument(config, deps, salesInvoiceId);
        return doc ? finish(doc) : { ok: false, error: "parasut:document:missing", refs };
      }
      if (status === "error") {
        // İş bitti (hatayla): kimlik boşalır, "Yeniden dene" yeniden resmileştirir (satış faturası aynı kalır).
        await save({ salesInvoiceId, jobId: null });
        return { ok: false, error: "parasut:formalize:error", refs };
      }
      if (i < attempts - 1) await deps.sleep(interval);
    }
    return { ok: false, error: "parasut:pending", refs };
  } catch (err) {
    if (err instanceof ParasutError) return { ok: false, error: err.code, refs };
    throw err;
  }

  function finish(doc: ActiveDocument): ParasutResult {
    return doc.invoiceNo
      ? { ok: true, invoiceNo: doc.invoiceNo, type: doc.type, refs }
      : { ok: false, error: "parasut:document:no-number", refs };
  }
}
