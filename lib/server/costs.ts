import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { todayIso } from "@/lib/domain/institutions/rules";
import { amortizedMonthlyRevenue } from "@/lib/domain/growth/economics";
import { allocateInstitutionCosts, type AllocationInstitution } from "@/lib/domain/costs/allocation";
import { budgetStatus, computeCostAlerts } from "@/lib/domain/costs/alerts";
import {
  buildOverview,
  buildServicesMatrix,
  monthTotal,
  serviceTotal,
  totalsByMonth,
  type LedgerLine,
} from "@/lib/domain/costs/aggregate";
import { costEntryKey } from "@/lib/domain/costs/import";
import { addMonthsKey, monthOfDay, monthStartDay, monthsEndingAt } from "@/lib/domain/costs/months";
import {
  costEntryInputSchema,
  type CostBudgetInput,
  type CostEntriesQuery,
  type CostEntryInput,
} from "@/lib/domain/costs/schemas";
import {
  COST_SERVICES,
  type BudgetStatus,
  type CostAlert,
  type CostBudget,
  type CostEntry,
  type CostEntryList,
  type CostOverview,
  type CostService,
  type CostSettings,
  type InstitutionCostsResponse,
  type ServicesMatrix,
  type SmsEstimate,
} from "@/lib/domain/costs/types";
import { fetchAll } from "./edoras";
import { getSmsRecipientsByInstitution } from "./edoras-usage";
import { listGrowthCustomers } from "./growth";
import { pgChain } from "./pg-chain";
import { staffNameMap } from "./staff";
import { recordAudit } from "./audit";

/**
 * Maliyetler servisi (yalnız ADMIN — uçlar denetler). Veri CRM projesindeki maliyet defteridir (crm_cost_entries,
 * crm_cost_budgets, crm_cost_settings); Edoras yalnız iki yerde OKUNUR: SMS alıcı sayısı (tahmini SMS maliyeti) ve kurum
 * başına öğrenci / lisans (Müşteri analizleri servisi üzerinden). Edoras'a hiçbir şey yazılmaz.
 * Uyarılar ve bütçe durumu okuma anında hesaplanır (lib/domain/costs/alerts.ts) — saklanmaz, zamanlayıcı yok.
 * Not (serbest metin) işlem kaydına yazılmaz: yalnız hizmet, ay, tutar ve para birimi.
 */

const ENTRY_COLUMNS = "id, service, period_month, amount, currency, fx_rate, amount_try, note, source, created_by, created_at";

interface EntryRow {
  id: string;
  service: CostService;
  period_month: string;
  amount: number | string;
  currency: "TRY" | "USD";
  fx_rate: number | string | null;
  amount_try: number | string;
  note: string | null;
  source: "MANUAL" | "IMPORT";
  created_by: string | null;
  created_at: string;
}

function toEntry(row: EntryRow, names: Map<string, string>): CostEntry {
  return {
    id: row.id,
    service: row.service,
    month: monthOfDay(row.period_month),
    amount: Number(row.amount),
    currency: row.currency,
    fxRate: row.fx_rate === null ? null : Number(row.fx_rate),
    amountTry: Number(row.amount_try),
    note: row.note,
    source: row.source,
    createdByName: row.created_by ? (names.get(row.created_by) ?? null) : null,
    createdAt: row.created_at,
  };
}

const entryFields = (input: CostEntryInput) => ({
  service: input.service,
  period_month: monthStartDay(input.month),
  amount: input.amount,
  currency: input.currency,
  fx_rate: input.currency === "USD" ? (input.fxRate ?? null) : null,
  note: input.note ?? null,
});

const auditDetails = (e: Pick<CostEntry, "service" | "month" | "amount" | "currency" | "amountTry">) => ({
  service: e.service,
  month: e.month,
  amount: e.amount,
  currency: e.currency,
  amountTry: e.amountTry,
});

// --- Okuma -----------------------------------------------------------------------------------------

interface LineRow {
  service: CostService;
  period_month: string;
  amount_try: number | string;
}

/** Defter satırları (yalnız hesap için gereken sütunlar); `fromMonth` verilirse o aydan itibaren. */
async function ledgerLines(fromMonth?: string): Promise<LedgerLine[]> {
  const db = getSupabaseAdminClient();
  const rows = await fetchAll<LineRow>((a, b) => {
    let q = pgChain(db.from("crm_cost_entries").select("service, period_month, amount_try"));
    if (fromMonth) q = q.gte("period_month", monthStartDay(fromMonth));
    return q.order("id").range(a, b) as unknown as PromiseLike<{ data: LineRow[] | null; error: { code?: string; message?: string } | null }>;
  });
  return rows.map((r) => ({ service: r.service, month: monthOfDay(r.period_month), amountTry: Number(r.amount_try) }));
}

export async function listCostEntries(query: CostEntriesQuery): Promise<CostEntryList> {
  const db = getSupabaseAdminClient();
  const scoped = (q: unknown) => {
    let out = pgChain(q);
    if (query.service) out = out.eq("service", query.service);
    if (query.from) out = out.gte("period_month", monthStartDay(query.from));
    if (query.to) out = out.lte("period_month", monthStartDay(query.to));
    return out;
  };
  const offset = query.page * query.size;
  const [page, amounts, names] = await Promise.all([
    scoped(db.from("crm_cost_entries").select(ENTRY_COLUMNS, { count: "exact" }))
      .order("period_month", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + query.size - 1),
    fetchAll<{ amount_try: number | string }>(
      (a, b) =>
        scoped(db.from("crm_cost_entries").select("amount_try")).order("id").range(a, b) as unknown as PromiseLike<{
          data: { amount_try: number | string }[] | null;
          error: { code?: string; message?: string } | null;
        }>
    ),
    staffNameMap(),
  ]);
  if (page.error) throw dbError(page.error);
  return {
    items: ((page.data ?? []) as unknown as EntryRow[]).map((r) => toEntry(r, names)),
    total: page.count ?? 0,
    totalTry: Math.round(amounts.reduce((s, r) => s + Number(r.amount_try), 0) * 100) / 100,
    page: query.page,
    size: query.size,
  };
}

/** Tüm satırlar (CSV dışa aktarma). */
async function allEntries(): Promise<CostEntry[]> {
  const db = getSupabaseAdminClient();
  const [rows, names] = await Promise.all([
    fetchAll<EntryRow>((a, b) => db.from("crm_cost_entries").select(ENTRY_COLUMNS).order("period_month", { ascending: false }).order("id").range(a, b)),
    staffNameMap(),
  ]);
  return rows.map((r) => toEntry(r, names));
}

// --- Yazma: satırlar -------------------------------------------------------------------------------

export async function createCostEntry(input: CostEntryInput, staff: StaffContext): Promise<CostEntry> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_cost_entries")
    .insert({ ...entryFields(input), source: "MANUAL", created_by: staff.userId })
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw dbError(error);
  const entry = toEntry(data as unknown as EntryRow, new Map([[staff.userId, staff.fullName ?? ""]]));
  await recordAudit(staff, {
    action: "COST_ENTRY_CREATED",
    entityType: "cost_entry",
    entityId: entry.id,
    entityLabel: `${entry.service} ${entry.month}`,
    details: auditDetails(entry),
  });
  return entry;
}

export async function updateCostEntry(id: string, input: CostEntryInput, staff: StaffContext): Promise<CostEntry> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_cost_entries")
    .update(entryFields(input))
    .eq("id", id)
    .select(ENTRY_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const entry = toEntry(data as unknown as EntryRow, await staffNameMap());
  await recordAudit(staff, {
    action: "COST_ENTRY_UPDATED",
    entityType: "cost_entry",
    entityId: entry.id,
    entityLabel: `${entry.service} ${entry.month}`,
    details: auditDetails(entry),
  });
  return entry;
}

export async function deleteCostEntry(id: string, staff: StaffContext): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().from("crm_cost_entries").delete().eq("id", id).select(ENTRY_COLUMNS).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const entry = toEntry(data as unknown as EntryRow, new Map());
  await recordAudit(staff, {
    action: "COST_ENTRY_DELETED",
    entityType: "cost_entry",
    entityId: entry.id,
    entityLabel: `${entry.service} ${entry.month}`,
    details: auditDetails(entry),
  });
}

export interface CostImportResult {
  created: number;
  /** Doğrulamadan geçemeyen (istekteki 1 tabanlı sıra) ve aynısı zaten defterde / istekte olan satırlar. */
  invalid: number[];
  duplicates: number[];
}

/**
 * Toplu ekleme (CSV / Excel içe aktarma). Her satır ayrıca doğrulanır; aynı satır (hizmet + ay + tutar + para birimi + not)
 * defterde ya da aynı istekte varsa atlanır — aynı dosyanın ikinci kez yüklenmesi satır çoğaltmaz. Geçerli satırlar tek
 * INSERT ile (hepsi ya da hiçbiri) eklenir.
 */
export async function importCostEntries(rows: readonly unknown[], staff: StaffContext): Promise<CostImportResult> {
  const valid: { index: number; value: CostEntryInput }[] = [];
  const invalid: number[] = [];
  rows.forEach((raw, i) => {
    const parsed = costEntryInputSchema.safeParse(raw);
    if (parsed.success) valid.push({ index: i + 1, value: parsed.data });
    else invalid.push(i + 1);
  });

  const db = getSupabaseAdminClient();
  const months = [...new Set(valid.map((v) => v.value.month))];
  const existing = new Set<string>();
  if (months.length > 0) {
    const found = await fetchAll<{ service: CostService; period_month: string; amount: number | string; currency: "TRY" | "USD"; note: string | null }>((a, b) =>
      db
        .from("crm_cost_entries")
        .select("service, period_month, amount, currency, note")
        .in(
          "period_month",
          months.map((m) => monthStartDay(m))
        )
        .order("id")
        .range(a, b)
    );
    for (const r of found) existing.add(costEntryKey({ service: r.service, month: monthOfDay(r.period_month), amount: Number(r.amount), currency: r.currency, note: r.note }));
  }

  const duplicates: number[] = [];
  const fresh: CostEntryInput[] = [];
  for (const { index, value } of valid) {
    const key = costEntryKey(value);
    if (existing.has(key)) duplicates.push(index);
    else {
      existing.add(key);
      fresh.push(value);
    }
  }

  if (fresh.length > 0) {
    const { error } = await db.from("crm_cost_entries").insert(fresh.map((v) => ({ ...entryFields(v), source: "IMPORT", created_by: staff.userId })));
    if (error) throw dbError(error);
    await recordAudit(staff, {
      action: "COST_ENTRIES_IMPORTED",
      entityType: "cost_entry",
      details: { created: fresh.length, invalid: invalid.length, duplicates: duplicates.length },
    });
  }
  return { created: fresh.length, invalid, duplicates };
}

// --- Bütçeler --------------------------------------------------------------------------------------

const BUDGET_COLUMNS = "id, scope, service, monthly_limit_try, soft_pct, hard_pct, active, note, created_at, updated_at";

interface BudgetRow {
  id: string;
  scope: "GLOBAL" | "SERVICE";
  service: CostService | null;
  monthly_limit_try: number | string;
  soft_pct: number;
  hard_pct: number;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const toBudget = (r: BudgetRow): CostBudget => ({
  id: r.id,
  scope: r.scope,
  service: r.service,
  monthlyLimitTry: Number(r.monthly_limit_try),
  softPct: r.soft_pct,
  hardPct: r.hard_pct,
  active: r.active,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const budgetFields = (input: CostBudgetInput) => ({
  scope: input.scope,
  service: input.scope === "GLOBAL" ? null : (input.service ?? null),
  monthly_limit_try: input.monthlyLimitTry,
  soft_pct: input.softPct,
  hard_pct: input.hardPct,
  active: input.active,
  note: input.note ?? null,
});

const budgetAuditDetails = (b: CostBudget) => ({
  scope: b.scope,
  service: b.service,
  monthlyLimitTry: b.monthlyLimitTry,
  softPct: b.softPct,
  hardPct: b.hardPct,
  active: b.active,
});

const budgetLabel = (b: CostBudget) => (b.scope === "GLOBAL" ? "GLOBAL" : `SERVICE ${b.service}`);

export async function listBudgets(): Promise<CostBudget[]> {
  const { data, error } = await getSupabaseAdminClient().from("crm_cost_budgets").select(BUDGET_COLUMNS).order("scope").order("service").order("created_at");
  if (error) throw dbError(error);
  return ((data ?? []) as unknown as BudgetRow[]).map(toBudget);
}

export async function createBudget(input: CostBudgetInput, staff: StaffContext): Promise<CostBudget> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_cost_budgets")
    .insert({ ...budgetFields(input), created_by: staff.userId })
    .select(BUDGET_COLUMNS)
    .single();
  if (error) throw dbError(error);
  const budget = toBudget(data as unknown as BudgetRow);
  await recordAudit(staff, { action: "COST_BUDGET_CREATED", entityType: "cost_budget", entityId: budget.id, entityLabel: budgetLabel(budget), details: budgetAuditDetails(budget) });
  return budget;
}

export async function updateBudget(id: string, input: CostBudgetInput, staff: StaffContext): Promise<CostBudget> {
  const { data, error } = await getSupabaseAdminClient().from("crm_cost_budgets").update(budgetFields(input)).eq("id", id).select(BUDGET_COLUMNS).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const budget = toBudget(data as unknown as BudgetRow);
  await recordAudit(staff, { action: "COST_BUDGET_UPDATED", entityType: "cost_budget", entityId: budget.id, entityLabel: budgetLabel(budget), details: budgetAuditDetails(budget) });
  return budget;
}

export async function deleteBudget(id: string, staff: StaffContext): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().from("crm_cost_budgets").delete().eq("id", id).select(BUDGET_COLUMNS).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const budget = toBudget(data as unknown as BudgetRow);
  await recordAudit(staff, { action: "COST_BUDGET_DELETED", entityType: "cost_budget", entityId: budget.id, entityLabel: budgetLabel(budget), details: budgetAuditDetails(budget) });
}

/** İçinde bulunulan ay ve önceki ay (tahmin ve sıçrama için gerekli en az veri). */
async function currentTotals(today: string) {
  return totalsByMonth(await ledgerLines(addMonthsKey(monthOfDay(today), -1)));
}

export async function listBudgetStatuses(today = todayIso()): Promise<{ month: string; items: { budget: CostBudget; status: BudgetStatus }[] }> {
  const [budgets, totals] = await Promise.all([listBudgets(), currentTotals(today)]);
  return { month: monthOfDay(today), items: budgets.map((budget) => ({ budget, status: budgetStatus(budget, totals, today) })) };
}

export async function getCostAlerts(today = todayIso()): Promise<{ month: string; items: CostAlert[] }> {
  const [budgets, totals] = await Promise.all([listBudgets(), currentTotals(today)]);
  return { month: monthOfDay(today), items: computeCostAlerts(budgets, totals, today) };
}

// --- Genel bakış, hizmetler ------------------------------------------------------------------------

export async function getCostOverview(today = todayIso()): Promise<CostOverview> {
  const month = monthOfDay(today);
  const [lines, budgets] = await Promise.all([ledgerLines(monthsEndingAt(month, 13)[0]), listBudgets()]);
  const overview = buildOverview(lines, today);
  return { ...overview, activeAlerts: computeCostAlerts(budgets, totalsByMonth(lines), today).length };
}

/** Hizmet × ay tablosu: `month` ile biten son 12 ay. */
export async function getServicesMatrix(month: string): Promise<ServicesMatrix> {
  const months = monthsEndingAt(month, 12);
  const lines = (await ledgerLines(months[0])).filter((l) => l.month <= month);
  return buildServicesMatrix(lines, months);
}

// --- Ayarlar, SMS tahmini --------------------------------------------------------------------------

export async function getCostSettings(): Promise<CostSettings> {
  const { data, error } = await getSupabaseAdminClient().from("crm_cost_settings").select("sms_unit_price_try, updated_at").eq("id", 1).maybeSingle();
  if (error) throw dbError(error);
  return { smsUnitPriceTry: data ? Number((data as { sms_unit_price_try: number | string }).sms_unit_price_try) : 0, updatedAt: (data as { updated_at: string } | null)?.updated_at ?? null };
}

export async function updateCostSettings(input: { smsUnitPriceTry: number }, staff: StaffContext): Promise<CostSettings> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_cost_settings")
    .update({ sms_unit_price_try: input.smsUnitPriceTry, updated_by: staff.userId })
    .eq("id", 1)
    .select("sms_unit_price_try, updated_at")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(503, "CONFIG_MISSING", undefined, "cost_settings:row");
  await recordAudit(staff, { action: "COST_SETTINGS_UPDATED", entityType: "cost_settings", entityId: "1", details: { smsUnitPriceTry: input.smsUnitPriceTry } });
  return { smsUnitPriceTry: Number((data as { sms_unit_price_try: number | string }).sms_unit_price_try), updatedAt: (data as { updated_at: string }).updated_at };
}

/** Edoras sms_logs alıcı sayısı × birim fiyat — TAHMİN; deftere yazılmaz, deftere girilmiş SMS satırıyla yan yana gösterilir. */
export async function getSmsEstimate(month: string): Promise<SmsEstimate> {
  const [settings, sms, lines] = await Promise.all([getCostSettings(), getSmsRecipientsByInstitution(month), ledgerLines(month)]);
  const ledgerTry = serviceTotal(totalsByMonth(lines.filter((l) => l.month === month)), month, "SMS");
  const recipients = sms ? [...sms.byInstitution.values()].reduce((s, n) => s + n, 0) : 0;
  return {
    month,
    recipients,
    unitPriceTry: settings.smsUnitPriceTry,
    estimatedTry: Math.round(recipients * settings.smsUnitPriceTry * 100) / 100,
    ledgerTry,
    available: sms !== null,
    truncated: sms?.truncated ?? false,
  };
}

// --- Kurum başına maliyet --------------------------------------------------------------------------

export async function getInstitutionCosts(staff: StaffContext, month: string): Promise<InstitutionCostsResponse> {
  const [growth, lines, settings, sms] = await Promise.all([
    listGrowthCustomers(staff, 30),
    ledgerLines(month),
    getCostSettings(),
    getSmsRecipientsByInstitution(month),
  ]);
  const totals = totalsByMonth(lines.filter((l) => l.month === month));
  const smsLedger = serviceTotal(totals, month, "SMS");
  const sharedPool = Math.round((monthTotal(totals, month) - smsLedger) * 100) / 100;

  const institutions: AllocationInstitution[] = growth.customers.map((c) => ({
    id: c.id,
    name: c.name,
    students: c.usage?.enrolledStudents ?? c.usage?.students ?? 0,
    revenueTry: amortizedMonthlyRevenue([c], month),
    status: c.status,
  }));
  const listed = new Set(institutions.map((i) => i.id));
  const recipients = sms ? new Map([...sms.byInstitution].filter(([id]) => listed.has(id))) : null;

  return allocateInstitutionCosts({
    month,
    institutions,
    sharedPoolTry: sharedPool,
    smsLedgerTry: smsLedger,
    smsRecipients: recipients,
    smsUnitPriceTry: settings.smsUnitPriceTry,
  });
}

// --- CSV dışa aktarma ------------------------------------------------------------------------------

export const COST_EXPORT_KINDS = ["entries", "services", "trend", "institutions"] as const;
export type CostExportKind = (typeof COST_EXPORT_KINDS)[number];

const SERVICE_LABELS: Record<CostService, string> = {
  SUPABASE: "Supabase",
  VERCEL: "Vercel",
  SMS: "SMS",
  OPENAI: "OpenAI",
  RESEND: "Resend",
  DOMAIN: "Alan adı",
  OTHER: "Diğer",
};

/** Excel TR: ondalık virgül. */
const num = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2).replace(".", ","));

/** Excel formülü olarak çalışabilecek serbest metin başına ' konur (CSV enjeksiyonu). */
const safeText = (v: string | null | undefined) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : (v ?? ""));

export async function buildCostExport(kind: CostExportKind, month: string): Promise<{ filename: string; header: string[]; rows: (string | number)[][] }> {
  if (kind === "entries") {
    const entries = await allEntries();
    return {
      filename: "maliyet-defteri",
      header: ["Ay", "Hizmet", "Tutar", "Para birimi", "Kur (TL/USD)", "TL karşılığı", "Kaynak", "Not", "Kaydeden"],
      rows: entries.map((e) => [e.month, SERVICE_LABELS[e.service], num(e.amount), e.currency, e.fxRate === null ? "" : String(e.fxRate).replace(".", ","), num(e.amountTry), e.source === "IMPORT" ? "İçe aktarma" : "Elle", safeText(e.note), safeText(e.createdByName)]),
    };
  }
  if (kind === "services") {
    const m = await getServicesMatrix(month);
    return {
      filename: "maliyet-hizmetler",
      header: ["Hizmet", ...m.months, "Toplam (TL)"],
      rows: [...m.rows.map((r) => [SERVICE_LABELS[r.service], ...r.byMonth.map(num), num(r.totalTry)]), ["Toplam", ...m.totalsByMonth.map(num), num(m.grandTotalTry)]],
    };
  }
  if (kind === "trend") {
    const m = await getServicesMatrix(month);
    return {
      filename: "maliyet-egilim",
      header: ["Ay", ...COST_SERVICES.map((s) => SERVICE_LABELS[s]), "Toplam (TL)"],
      rows: m.months.map((mo, i) => [mo, ...COST_SERVICES.map((s) => num(m.rows.find((r) => r.service === s)?.byMonth[i] ?? 0)), num(m.totalsByMonth[i])]),
    };
  }
  throw new HttpError(400, "VALIDATION");
}

export async function buildInstitutionCostExport(staff: StaffContext, month: string) {
  const r = await getInstitutionCosts(staff, month);
  return {
    filename: `maliyet-kurumlar-${month}`,
    header: ["Kurum", "Öğrenci", "Ortak maliyet payı (TL)", "SMS (TL)", "Toplam maliyet (TL)", "Aylık gelir (TL)", "Marj (TL)", "Marj (%)", "Öğrenci başı maliyet (TL)"],
    rows: r.items.map((i) => [safeText(i.name), i.students, num(i.sharedCostTry), num(i.smsCostTry), num(i.totalCostTry), num(i.revenueTry), num(i.marginTry), i.marginPct === null ? "" : num(i.marginPct), num(i.costPerStudentTry)]),
  };
}
