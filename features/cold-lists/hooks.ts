"use client";

import { useMemo, useState } from "react";
import { useAllCrmLeads } from "@/features/crm";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import type { ExistingContact } from "@/lib/import/duplicates";
import { crmLeadToExisting, institutionToExisting } from "@/lib/import/existing";
import { PROSPECT_OUTCOMES, type Prospect, type ProspectOutcome } from "@/lib/domain/cold-lists/types";
import { isMoved } from "@/lib/domain/cold-lists/utils";
import { useListProspects, useProspectLists } from "./queries";

export type OutcomeFilter = "all" | ProspectOutcome | "moved";
export const OUTCOME_FILTERS: OutcomeFilter[] = ["all", ...PROSPECT_OUTCOMES, "moved"];
export const PAGE_SIZE = 50;

function matches(p: Prospect, q: string): boolean {
  const query = q.trim().toLocaleLowerCase("tr");
  if (!query) return true;
  return [p.firstName, p.lastName, p.organization, p.phoneRaw, p.phone, p.email, p.city, p.district, p.branch].some((v) =>
    v?.toLocaleLowerCase("tr").includes(query)
  );
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
  const matchesFor = (p: Prospect): ExistingContact[] => {
    const seen = new Set<string>();
    return [...(p.phone ? (index.byPhone.get(p.phone) ?? []) : []), ...(p.email ? (index.byEmail.get(p.email) ?? []) : [])].filter((e) =>
      seen.has(`${e.source}:${e.id}`) ? false : (seen.add(`${e.source}:${e.id}`), true)
    );
  };
  return { matchesFor, institutionsError: crm.institutionsError };
}

/**
 * Soğuk listeler ekranının durumu: liste (?list=), sonuç süzgeci (?outcome=), arama (?q=) URL'de; sayfa ve
 * kaydedilmemiş sonuçlar yerel. Seçili listenin kişileri sunucudan (tümü) gelir, istemcide süzülür (DeepSport).
 */
export function useColdListView() {
  const listsQ = useProspectLists();
  const lists = useMemo(() => listsQ.data ?? [], [listsQ.data]);
  const [listParam, setListParam] = useUrlParam("list");
  const [outcomeParam, setOutcome] = useUrlParam("outcome", "all");
  const [q, setQ] = useUrlParam("q");
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<Record<string, ProspectOutcome>>({});

  const listId = lists.some((l) => l.id === listParam) ? listParam : (lists[lists.length - 1]?.id ?? "");
  const list = lists.find((l) => l.id === listId) ?? null;
  const prospectsQ = useListProspects(listId || null);
  const crm = useCrmIndex();

  const outcome: OutcomeFilter = (OUTCOME_FILTERS as string[]).includes(outcomeParam) ? (outcomeParam as OutcomeFilter) : "all";
  const listProspects = useMemo(() => prospectsQ.data?.items ?? [], [prospectsQ.data]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(OUTCOME_FILTERS.map((f) => [f, 0])) as Record<OutcomeFilter, number>;
    for (const p of listProspects) {
      c.all++;
      if (isMoved(p)) c.moved++;
      else c[p.outcome]++;
    }
    return c;
  }, [listProspects]);

  const filtered = listProspects.filter((p) => {
    if (outcome === "moved") return isMoved(p) && matches(p, q);
    if (outcome !== "all" && (isMoved(p) || p.outcome !== outcome)) return false;
    return matches(p, q);
  });
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
