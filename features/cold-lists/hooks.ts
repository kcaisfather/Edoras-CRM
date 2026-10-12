"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAllCrmLeads } from "@/features/crm";
import { useUrlParam, useUrlParamsSetter } from "@/lib/hooks/use-url-param";
import type { ExistingContact } from "@/lib/import/duplicates";
import { crmLeadToExisting, institutionToExisting } from "@/lib/import/existing";
import { PROSPECT_OUTCOMES, type Prospect, type ProspectOutcome } from "@/lib/domain/cold-lists/types";
import {
  activeProspectFilterCount,
  filterProspects,
  isMoved,
  PRESENCE_FILTER_KEYS,
  PROSPECT_FILTER_KEYS,
  toPresenceFilter,
  type ProspectDetailFilter,
  type ProspectFilterKey,
} from "@/lib/domain/cold-lists/utils";
import { distinctOptions, sameText } from "@/lib/utils/filter-match";
import { useListProspects, useProspectLists } from "./queries";

export type OutcomeFilter = "all" | ProspectOutcome | "moved";
export const OUTCOME_FILTERS: OutcomeFilter[] = ["all", ...PROSPECT_OUTCOMES, "moved"];
export const PAGE_SIZE = 50;

/** Detay süzgecinin URL parametreleri (paylaşılabilir bağlantı; liste değişince korunur). */
export const PROSPECT_FILTER_PARAMS: Record<ProspectFilterKey, string> = {
  city: "city",
  district: "district",
  phone: "phone",
  email: "email",
  organization: "org",
  name: "name",
  branch: "branch",
  note: "note",
  hasPhone: "hasPhone",
  hasEmail: "hasEmail",
  inCrm: "inCrm",
};

function matchesOutcome(p: Prospect, outcome: OutcomeFilter): boolean {
  if (outcome === "all") return true;
  if (outcome === "moved") return isMoved(p);
  return !isMoved(p) && p.outcome === outcome;
}

/** URL'deki detay süzgeci; değerler değişmedikçe aynı nesne (bağımlı useMemo'lar boşuna çalışmasın). */
function useDetailFiltersFromUrl(): ProspectDetailFilter {
  const searchParams = useSearchParams();
  const key = JSON.stringify(PROSPECT_FILTER_KEYS.map((k) => searchParams.get(PROSPECT_FILTER_PARAMS[k]) ?? ""));
  return useMemo(() => {
    const values = JSON.parse(key) as string[];
    const f = Object.fromEntries(PROSPECT_FILTER_KEYS.map((k, i) => [k, values[i] ?? ""])) as Record<ProspectFilterKey, string>;
    for (const k of PRESENCE_FILTER_KEYS) f[k] = toPresenceFilter(f[k]);
    return f as ProspectDetailFilter;
  }, [key]);
}

/**
 * CRM eşleşmesi (telefon / e-posta): aday ve kurum yetkilisi — "CRM'de var" rozeti ve taşıma uyarısı (DeepSport
 * ColdListsPage crmIndex; kurum yetkilileri EdorasCRM'de eklendi).
 */
function useCrmIndex() {
  const crm = useAllCrmLeads(true);
  const index = useMemo(() => {
    const byPhone = new Map<string, ExistingContact[]>();
    const byEmail = new Map<string, ExistingContact[]>();
    const add = (e: ExistingContact) => {
      if (e.phone) byPhone.set(e.phone, [...(byPhone.get(e.phone) ?? []), e]);
      if (e.email) byEmail.set(e.email, [...(byEmail.get(e.email) ?? []), e]);
    };
    crm.leads.forEach((l) => add(crmLeadToExisting(l)));
    for (const i of crm.institutions ?? []) {
      const e = institutionToExisting(i);
      if (e) add(e);
    }
    return { byPhone, byEmail };
  }, [crm.leads, crm.institutions]);
  const matchesFor = useCallback(
    (p: Prospect): ExistingContact[] => {
      const seen = new Set<string>();
      return [...(p.phone ? (index.byPhone.get(p.phone) ?? []) : []), ...(p.email ? (index.byEmail.get(p.email) ?? []) : [])].filter((e) =>
        seen.has(`${e.source}:${e.id}`) ? false : (seen.add(`${e.source}:${e.id}`), true)
      );
    },
    [index]
  );
  return { matchesFor, institutionsError: crm.institutionsError };
}

/**
 * Soğuk listeler ekranının durumu: liste (?list=), sonuç süzgeci (?outcome=), arama (?q=) ve detay süzgeci
 * (`PROSPECT_FILTER_PARAMS`) URL'de; sayfa ve kaydedilmemiş sonuçlar yerel. Seçili listenin kişileri sunucudan (tümü)
 * gelir, istemcide süzülür (DeepSport). Sıra: detay süzgeci + arama → sekme sayıları → sonuç sekmesi.
 */
export function useColdListView() {
  const listsQ = useProspectLists();
  const lists = useMemo(() => listsQ.data ?? [], [listsQ.data]);
  const [listParam, setListParam] = useUrlParam("list");
  const [outcomeParam, setOutcome] = useUrlParam("outcome", "all");
  const [q, setQ] = useUrlParam("q");
  const detailFilters = useDetailFiltersFromUrl();
  const setParams = useUrlParamsSetter();
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<Record<string, ProspectOutcome>>({});

  const listId = lists.some((l) => l.id === listParam) ? listParam : (lists[lists.length - 1]?.id ?? "");
  const list = lists.find((l) => l.id === listId) ?? null;
  const prospectsQ = useListProspects(listId || null);
  const crm = useCrmIndex();

  const outcome: OutcomeFilter = (OUTCOME_FILTERS as string[]).includes(outcomeParam) ? (outcomeParam as OutcomeFilter) : "all";
  const listProspects = useMemo(() => prospectsQ.data?.items ?? [], [prospectsQ.data]);
  const detailActiveCount = activeProspectFilterCount(detailFilters);

  const { matchesFor } = crm;
  const hasCrmMatch = useCallback((p: Prospect) => matchesFor(p).length > 0, [matchesFor]);
  /** Detay süzgeci + arama; sekme sayıları bundan sayılır ("Aranmadı (12)" = süzgece uyan 12 kişi). */
  const searched = useMemo(
    () => filterProspects(listProspects, detailFilters, { q, hasCrmMatch }),
    [listProspects, detailFilters, q, hasCrmMatch]
  );
  const counts = useMemo(() => {
    const c = Object.fromEntries(OUTCOME_FILTERS.map((f) => [f, 0])) as Record<OutcomeFilter, number>;
    for (const p of searched) {
      c.all++;
      if (isMoved(p)) c.moved++;
      else c[p.outcome]++;
    }
    return c;
  }, [searched]);
  const filtered = useMemo(() => searched.filter((p) => matchesOutcome(p, outcome)), [searched, outcome]);

  /** Seçenekler yalnız listedeki değerlerden; ilçe = seçili ilin ilçeleri (il seçilmediyse hepsi). */
  const filterOptions = useMemo(
    () => ({
      cities: distinctOptions(listProspects.map((p) => p.city)),
      districts: distinctOptions(listProspects.filter((p) => sameText(p.city, detailFilters.city)).map((p) => p.district)),
      branches: distinctOptions(listProspects.map((p) => p.branch)),
    }),
    [listProspects, detailFilters.city]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  /** Sonuç seçimi biriktirilir; "Kaydet" onayıyla yazılır (DeepSport sunucu modu). Aynı sonuca dönerse düşer. */
  const setOutcomeFor = (p: Prospect, next: ProspectOutcome) =>
    setPending((prev) => {
      const copy = { ...prev };
      if (next === p.outcome) delete copy[p.id];
      else copy[p.id] = next;
      return copy;
    });

  return {
    lists,
    listsLoading: listsQ.isLoading,
    listsError: listsQ.isError,
    refetch: () => {
      if (listsQ.isError) void listsQ.refetch();
      if (prospectsQ.isError) void prospectsQ.refetch();
    },
    listId,
    list,
    selectList: (id: string) => {
      setListParam(id);
      setPage(0);
      setPending({});
    },
    prospectsLoading: prospectsQ.isLoading,
    prospectsError: prospectsQ.isError,
    truncated: prospectsQ.data?.truncated ? { loaded: listProspects.length, total: prospectsQ.data.total } : null,
    listProspects,
    outcome,
    setOutcome: (v: OutcomeFilter) => {
      setOutcome(v);
      setPage(0);
    },
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(0);
    },
    detailFilters,
    detailActiveCount,
    /** Tek alan; il değişince ilçe sıfırlanır (tek URL yazımı). Sayfa başa döner. */
    setDetailFilter: (key: ProspectFilterKey, value: string) => {
      setParams({ [PROSPECT_FILTER_PARAMS[key]]: value, ...(key === "city" ? { [PROSPECT_FILTER_PARAMS.district]: null } : {}) });
      setPage(0);
    },
    clearDetailFilters: () => {
      setParams(Object.fromEntries(PROSPECT_FILTER_KEYS.map((k) => [PROSPECT_FILTER_PARAMS[k], null])));
      setPage(0);
    },
    filterOptions,
    counts,
    filtered,
    visible: filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    page: safePage,
    totalPages,
    setPage,
    pending,
    clearPending: () => setPending({}),
    setOutcomeFor,
    outcomeOf: (p: Prospect) => pending[p.id] ?? p.outcome,
    crmMatchesFor: crm.matchesFor,
    institutionsError: crm.institutionsError,
  };
}

export type ColdListView = ReturnType<typeof useColdListView>;
