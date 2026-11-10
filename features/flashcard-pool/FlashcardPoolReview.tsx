"use client";

import { useCallback, useEffect, useState } from "react";

type Card = { id: string; front: string; back: string };

type LoadResult = { items: PoolDeck[]; error: string | null };

async function fetchDecks(view: "pending" | "approved"): Promise<LoadResult> {
  const res = await fetch(view === "approved" ? "/api/flashcard-pool?status=approved" : "/api/flashcard-pool", {
    cache: "no-store",
  });
  if (!res.ok) {
    return { items: [], error: res.status === 403 ? "Bu ekran yalnız yöneticiler içindir." : "Desteler yüklenemedi." };
  }
  return { items: (await res.json()) as PoolDeck[], error: null };
}

type PoolDeck = {
  id: string;
  objectiveId: number;
  objectiveCode: string | null;
  objectiveText: string | null;
  subject: string;
  model: string;
  runDate: string;
  cards: Card[];
  excludedCardIds: string[];
  sourceRef: { book?: string | null; pages?: number[]; section_title?: string | null };
  createdAt: string;
  inPanel?: boolean;
};

// rules.ts node:crypto kullandığı için istemciye taşınmaz; eşik burada tekrar edilir (Edoras FLASHCARD_MIN_CARDS).
const MIN_CARDS = 4;

const ERROR_TEXT: Record<string, string> = {
  TOO_FEW_CARDS: `Onay için en az ${MIN_CARDS} kart kalmalı.`,
};

/**
 * Bilgi kartı destelerinin onay ekranı. Yönetici desteyi bütün olarak onaylar ya da reddeder; onaylarken hatalı kartın
 * işaretini kaldırıp onu dışarıda bırakabilir. Onaylanan kartlar panele (Bilgi Kartı modülü) aktarılır.
 */
export function FlashcardPoolReview() {
  const [view, setView] = useState<"pending" | "approved">("pending");
  const [items, setItems] = useState<PoolDeck[] | null>(null);
  const [excluded, setExcluded] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = useCallback((result: LoadResult) => {
    setError(result.error);
    setItems(result.items);
  }, []);

  const load = useCallback(async () => apply(await fetchDecks(view)), [apply, view]);

  useEffect(() => {
    // Sekme hızlı değişirse eski sekmenin geç gelen yanıtı yeni listeyi ezmesin.
    let cancelled = false;
    void fetchDecks(view).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, view]);

  function toggleCard(deckId: string, cardId: string) {
    setExcluded((prev) => {
      const next = new Set(prev[deckId] ?? []);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return { ...prev, [deckId]: next };
    });
  }

  async function decide(deck: PoolDeck, decision: "APPROVED" | "REJECTED") {
    setBusyId(deck.id);
    const res = await fetch(`/api/flashcard-pool/${deck.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        excluded_card_ids: decision === "APPROVED" ? [...(excluded[deck.id] ?? [])] : [],
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      const code = body?.error?.code;
      setError(
        (code && ERROR_TEXT[code]) ?? "Karar kaydedilemedi. Deste zaten karara bağlanmış olabilir; listeyi yenileyin.",
      );
      return;
    }
    const { panelTransfer } = (await res.json()) as { panelTransfer: string | null };
    setNotice(panelTransfer === "not_found" ? "Deste onaylandı ama panele aktarılamadı: kazanım panelde bulunamadı." : null);
    setItems((prev) => (prev ?? []).filter((d) => d.id !== deck.id));
  }

  async function revoke(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/flashcard-pool/${id}/revoke`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      setError("Onay geri alınamadı; listeyi yenileyin.");
      return;
    }
    setItems((prev) => (prev ?? []).filter((d) => d.id !== id));
  }

  function switchView(next: "pending" | "approved") {
    if (next === view) return;
    setItems(null);
    setNotice(null);
    setExcluded({});
    setView(next);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kart onayı</h1>
          <p className="text-sm text-muted-foreground">
            Gece MEB ders kitabından üretilen bilgi kartı desteleri. Onaylananlar öğrencinin Bilgi Kartı ekranına gider.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={view === "pending"}
            onClick={() => switchView("pending")}
            className={`rounded-md border px-3 py-1.5 text-sm ${view === "pending" ? "bg-muted font-medium" : ""}`}
          >
            Bekleyenler
          </button>
          <button
            type="button"
            aria-pressed={view === "approved"}
            onClick={() => switchView("approved")}
            className={`rounded-md border px-3 py-1.5 text-sm ${view === "approved" ? "bg-muted font-medium" : ""}`}
          >
            Onaylananlar
          </button>
          <button type="button" onClick={() => void load()} className="rounded-md border px-3 py-1.5 text-sm">
            Yenile
          </button>
        </div>
      </header>

      {error ? <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{notice}</p> : null}

      {items === null ? <p className="text-sm text-muted-foreground">Yükleniyor…</p> : null}
      {items && items.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">{view === "approved" ? "Onaylanmış deste yok." : "Onay bekleyen deste yok."}</p>
      ) : null}

      <ul className="space-y-4">
        {(items ?? []).map((deck) => {
          const off = view === "approved" ? new Set(deck.excludedCardIds) : (excluded[deck.id] ?? new Set<string>());
          const keptCount = deck.cards.length - deck.cards.filter((c) => off.has(c.id)).length;
          return (
            <li key={deck.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5">{deck.subject}</span>
                {deck.objectiveCode ? <span className="rounded bg-muted px-2 py-0.5">{deck.objectiveCode}</span> : null}
                <span className="rounded bg-muted px-2 py-0.5">{deck.model}</span>
                <span className="rounded bg-muted px-2 py-0.5">{deck.runDate}</span>
                {view === "approved" ? (
                  <span className="rounded bg-muted px-2 py-0.5 font-medium">{deck.inPanel ? "Öğrenciye açık" : "Aktarılamadı"}</span>
                ) : null}
              </div>
              {deck.objectiveText ? <p className="text-sm font-medium">{deck.objectiveText}</p> : null}
              <Source deck={deck} />
              <ol className="space-y-2">
                {deck.cards.map((card, index) => {
                  const isOff = off.has(card.id);
                  return (
                    <li key={card.id} className={`rounded-md border p-3 text-sm ${isOff ? "opacity-50" : ""}`}>
                      <label className="flex items-start gap-3">
                        {view === "pending" ? (
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={!isOff}
                            onChange={() => toggleCard(deck.id, card.id)}
                            aria-label={`${index + 1}. kartı desteye kat`}
                          />
                        ) : null}
                        <span className="space-y-1">
                          <span className="block font-medium">
                            {index + 1}. {card.front}
                          </span>
                          <span className="block whitespace-pre-line text-muted-foreground">{card.back}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ol>
              {view === "approved" ? (
                <button
                  type="button"
                  disabled={busyId === deck.id}
                  onClick={() => void revoke(deck.id)}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Onayı geri al
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === deck.id || keptCount < MIN_CARDS}
                    onClick={() => void decide(deck, "APPROVED")}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {keptCount === deck.cards.length ? "Onayla" : `${keptCount} kartla onayla`}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === deck.id}
                    onClick={() => void decide(deck, "REJECTED")}
                    className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Reddet
                  </button>
                  {keptCount < MIN_CARDS ? (
                    <span className="text-xs text-muted-foreground">Onay için en az {MIN_CARDS} kart işaretli kalmalı.</span>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Destenin dayandığı ders kitabı bölümü (kitap metni değil, yalnız adı ve sayfalar). */
function Source({ deck }: { deck: PoolDeck }) {
  const ref = deck.sourceRef ?? {};
  const pages = ref.pages?.length ? `s. ${ref.pages.join(", ")}` : null;
  const parts = [ref.book, ref.section_title, pages].filter(Boolean);
  if (!parts.length) return null;
  return <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">Kaynak: {parts.join(" · ")}</p>;
}
