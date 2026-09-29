"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { usePermissions } from "@/features/auth";
import { parsePeriodParam, periodToRange } from "@/lib/utils/date";
import { parseSort, sortRows } from "@/lib/utils/sort";
import { leadFunnel } from "@/lib/domain/crm/insights";
import { STORED_STATUSES, filterLeadsClient, pipelineByStatus, summarizeLeads, type CrmClientTab } from "@/lib/domain/crm/signals";
import { CRM_SORT_ACCESSORS, CRM_SORT_KEYS } from "@/lib/domain/crm/sort";
import { isCrmStatus, type CrmLead, type CrmNoteMode } from "@/lib/domain/crm/types";
import { getRemainingAmount } from "@/lib/domain/crm/utils";
import { CRM_QUICK_TABS, FINANCIAL_VIEWS, type CrmQuickTab } from "@/lib/domain/crm/views";
import { useAllCrmLeads } from "./queries";
import type { CrmRowSlots, CrmTableActions } from "./types";

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** Sayfanın dönem seçicisi (?period=&startDate=&endDate=) → oluşturma tarihi aralığı. Varsayılan "Tümü". */
export function useCrmPeriodRange() {
  const searchParams = useSearchParams();
  const period = parsePeriodParam(searchParams.get("period"), "all");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  return useMemo(() => {
    const r = periodToRange(period, startDate, endDate);
    return { period, dateFrom: r?.from, dateTo: r?.to };
  }, [period, startDate, endDate]);
}

/** URL'deki arama metni kutuda anında, URL'de 300 ms sonra güncellenir (dışarıdan değişirse kutu eşitlenir). */
function useSearchInput(search: string, commit: (value: string) => void) {
  const [input, setInput] = useState(search);
  const [synced, setSynced] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (search !== synced) {
    setSynced(search);
    setInput(search);
  }
  const change = (value: string) => {
    setInput(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(value.trim()), 300);
  };
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setInput("");
    commit("");
  };
  return { input, change, clear };
}

/**
 * Aday listesi (DeepSport useCrmList). Tüm adaylar (paylaşılan önbellek) istemcide süzülür: dönem (oluşturma
 * tarihi), statü / görünüm, arama, sütun sıralaması ve sayfa URL'de. Detay penceresi de URL'de (?lead=<id>):
 * kurum sayfasındaki "Adaylar'da aç" bağlantısı doğrudan açar. Pencereler (düzenle, not, demo, bağla,
 * tahsilat) yerel durumdadır.
 */
export function useCrmList(slots: CrmRowSlots = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { canSeeFinancials } = usePermissions();

  const search = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const statusFilter = isCrmStatus(statusParam) ? statusParam : "";
  const tabParam = searchParams.get("tab") ?? "";
  // Tutar içeren görünüm (Bakiyesi olanlar) CRM_AGENT için varsayılana düşer.
  const quickTab = (
    (CRM_QUICK_TABS as string[]).includes(tabParam) && (canSeeFinancials || !FINANCIAL_VIEWS.includes(tabParam as CrmQuickTab)) ? tabParam : ""
  ) as CrmQuickTab;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const sizeParam = parseInt(searchParams.get("size") ?? "", 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const colSort = parseSort(searchParams.get("sort"), searchParams.get("dir"), CRM_SORT_KEYS);
  const detailId = searchParams.get("lead") ?? "";
  const addOpen = searchParams.get("new") === "lead";
  const { dateFrom, dateTo } = useCrmPeriodRange();

  const replaceParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const searchBox = useSearchInput(search, (value) =>
    replaceParams((p) => {
      if (value) p.set("search", value);
      else p.delete("search");
      p.delete("page");
    })
  );

  const clientTab: CrmClientTab | undefined = quickTab === "demoEnded" || quickTab === "balance" ? quickTab : undefined;
  const isSignupsTab = quickTab === "newSignups";
  const isDuplicatesTab = quickTab === "duplicates";
  const effectiveStatus = (!clientTab && !isSignupsTab && !isDuplicatesTab ? quickTab : "") || statusFilter;

  const all = useAllCrmLeads();

  // Seçili dönemdeki tüm adaylar (satış olanlar dahil).
  const rangeLeads = useMemo(() => filterLeadsClient(all.leads, { dateFrom, dateTo }), [all.leads, dateFrom, dateTo]);

  const filteredLeads = useMemo(() => {
    const filtered = filterLeadsClient(all.leads, { status: effectiveStatus || undefined, dateFrom, dateTo, tab: clientTab, search });
    if (colSort) return sortRows(filtered, colSort, CRM_SORT_ACCESSORS);
    // "Bakiyesi olanlar": en yüksek kalan bakiye önce; diğerleri en yeni kayıt önce (sunucu sırası).
    if (clientTab === "balance") return sortRows(filtered, { key: "balance", dir: "desc" }, CRM_SORT_ACCESSORS);
    return filtered;
  }, [all.leads, effectiveStatus, dateFrom, dateTo, clientTab, search, colSort]);

  // Statü şeridi (G35): dönemdeki aşamalar (statü seçiminden bağımsız).
  const pipeline = useMemo(() => pipelineByStatus(rangeLeads, STORED_STATUSES), [rangeLeads]);
  // Özet kartlar (G03): süzgeç varsa süzülen satırlar, yoksa seçili dönemin tamamı.
  const hasFilter = !!effectiveStatus || !!clientTab || !!search.trim();
  const summary = useMemo(() => summarizeLeads(hasFilter ? filteredLeads : rangeLeads), [rangeLeads, hasFilter, filteredLeads]);
  // G19: açık alacak — dönemdeki kayıtlar (satır formülüyle aynı).
  const openReceivables = useMemo(
    () => rangeLeads.reduce((sum, l) => sum + getRemainingAmount(l.saleAmount, l.collectedAmount), 0),
    [rangeLeads]
  );

  const totalElements = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const leads = useMemo(
    () => filteredLeads.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [filteredLeads, currentPage, pageSize]
  );

  // Pencereler
  const [editId, setEditId] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; mode: CrmNoteMode } | null>(null);
  const [demoLead, setDemoLead] = useState<CrmLead | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const byId = (id: string | null) => (id ? (all.leads.find((l) => l.id === id) ?? null) : null);

  const setDetail = (id: string | null) =>
    replaceParams((p) => {
      if (id) p.set("lead", id);
      else p.delete("lead");
    });

  const actions: CrmTableActions = {
    onOpen: (lead) => setDetail(lead.id),
    onEdit: (lead) => setEditId(lead.id),
    onAddNote: (lead, mode = "note") => setNote({ id: lead.id, mode }),
    onOpenDemo: (lead) => setDemoLead(lead),
    onLink: (lead) => setLinkId(lead.id),
    // Tahsilat yalnız finans yetkisiyle (uç da CRM_AGENT'a 403).
    onAddCollection: canSeeFinancials ? (lead) => setCollectionId(lead.id) : undefined,
    ...slots,
  };

  return {
    // Veri
    all,
    isLoading: all.isLoading,
    isError: all.isError,
    refetch: all.refetch,
    leads,
    filteredLeads,
    totalElements,
    totalPages,
    page: currentPage,
    pageSize,
    summary,
    openReceivables,
    pipeline,
    // Süzgeçler
    searchBox,
    statusFilter,
    quickTab,
    effectiveStatus,
    isSignupsTab,
    isDuplicatesTab,
    setStatusFilter: (value: string) =>
      replaceParams((p) => {
        if (value) p.set("status", value);
        else p.delete("status");
        p.delete("tab");
        p.delete("page");
      }),
    setQuickTab: (tab: CrmQuickTab) =>
      replaceParams((p) => {
        if (tab) p.set("tab", tab);
        else p.delete("tab");
        p.delete("status");
        p.delete("page");
      }),
    setPage: (next: number) =>
      replaceParams((p) => {
        const clamped = Math.max(0, Math.min(next, totalPages - 1));
        if (clamped) p.set("page", String(clamped));
        else p.delete("page");
      }),
    setPageSize: (value: string) =>
      replaceParams((p) => {
        p.delete("page");
        if (Number(value) === DEFAULT_PAGE_SIZE) p.delete("size");
        else p.set("size", value);
      }),
    // Pencereler
    actions,
    detailLead: byId(detailId || null),
    closeDetail: () => setDetail(null),
    addOpen,
    setAddOpen: (open: boolean) =>
      replaceParams((p) => {
        if (open) p.set("new", "lead");
        else p.delete("new");
      }),
    /** Yeni aday kaydedildi: ekleme penceresi kapanır, detay açılır (tek URL değişikliği — ikisi birbirini ezmesin). */
    showCreated: (id: string) =>
      replaceParams((p) => {
        p.delete("new");
        p.set("lead", id);
      }),
    editLead: byId(editId),
    closeEdit: () => setEditId(null),
    noteLead: byId(note?.id ?? null),
    noteMode: note?.mode ?? "note",
    closeNote: () => setNote(null),
    demoLead,
    closeDemo: () => setDemoLead(null),
    linkLead: byId(linkId),
    closeLink: () => setLinkId(null),
    collectionLead: byId(collectionId),
    closeCollection: () => setCollectionId(null),
  };
}

/**
 * Satış Analizleri: seçili dönemde oluşturulan aday kohortu üzerinden satış hunisi (G82) ve satış kırılımları.
 */
export function useCrmAnalytics() {
  const all = useAllCrmLeads();
  const { dateFrom, dateTo } = useCrmPeriodRange();
  const cohort = useMemo(() => filterLeadsClient(all.leads, { dateFrom, dateTo }), [all.leads, dateFrom, dateTo]);
  const funnel = useMemo(() => leadFunnel(cohort), [cohort]);
  return {
    funnel,
    cohort,
    cohortSize: cohort.length,
    isLoading: all.isLoading,
    isError: all.isError,
    refetch: all.refetch,
  };
}
