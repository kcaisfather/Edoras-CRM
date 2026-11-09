"use client";

import { useCallback, useEffect, useState } from "react";

type PoolQuestion = {
  id: string;
  source: "AIG" | "LLM";
  subject: string;
  objectiveCode: string | null;
  model: string;
  runDate: string;
  body: {
    stem: string;
    options: string[];
    key: string;
    explanation: string | null;
    meta?: {
      reference_question?: string | null;
      objective_text?: string | null;
      form?: string | null;
      course?: string | null;
      option_origins?: string[];
      params?: Record<string, string | number | boolean>;
    };
  };
  createdAt: string;
  inPanel?: boolean;
};

const TRANSFER_NOTICE: Record<string, string> = {
  not_found: "Soru onaylandı ama panele aktarılamadı: kazanımı panelde bulunamadı.",
  ambiguous: "Soru onaylandı ama panele aktarılamadı: kazanım kodu birden çok kazanıma uyuyor.",
};

const FORM_LABEL: Record<string, string> = {
  oncullu: "Öncüllü",
  sayisal: "Sayısal",
  siralama: "Sıralamalı",
  girisli: "Girişli",
};

// rules.ts node:crypto kullandığı için istemciye taşınmaz; harfler burada tekrar edilir.
const QUESTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

const SOURCE_LABEL = { AIG: "Kod (AIG)", LLM: "Dil modeli" } as const;

/**
 * Gece sorularının onay ekranı. Öğretmen kapısı yok: yönetici tek tek onaylar ya da reddeder. Onaylanan soru panele
 * (Mini Test) aktarılır, reddedilen bir daha gösterilmez. "Onaylananlar"da onay geri alınır: soru kuyruğa döner.
 */
export function QuestionPoolReview() {
  const [view, setView] = useState<"pending" | "approved">("pending");
  const [items, setItems] = useState<PoolQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(view === "approved" ? "/api/question-pool?status=approved" : "/api/question-pool", { cache: "no-store" });
    setError(null);
    if (!res.ok) {
      setError(res.status === 403 ? "Bu ekran yalnız yöneticiler içindir." : "Sorular yüklenemedi.");
      setItems([]);
      return;
    }
    setItems((await res.json()) as PoolQuestion[]);
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusyId(id);
    const res = await fetch(`/api/question-pool/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError("Karar kaydedilemedi. Soru zaten karara bağlanmış olabilir; listeyi yenileyin.");
      return;
    }
    const { panelTransfer } = (await res.json()) as { panelTransfer: string | null };
    setNotice(panelTransfer ? (TRANSFER_NOTICE[panelTransfer] ?? null) : null);
    setItems((prev) => (prev ?? []).filter((q) => q.id !== id));
  }

  async function revoke(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/question-pool/${id}/revoke`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      setError("Onay geri alınamadı; listeyi yenileyin.");
      return;
    }
    setItems((prev) => (prev ?? []).filter((q) => q.id !== id));
  }

  function switchView(next: "pending" | "approved") {
    if (next === view) return;
    setItems(null); // eski listenin satırları yeni sekmenin düğmeleriyle görünmesin
    setNotice(null);
    setView(next);
  }

  const notInPanel = view === "approved" ? (items ?? []).filter((q) => !q.inPanel).length : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Soru onayı</h1>
          <p className="text-sm text-muted-foreground">Gece üretilen sorular. Onaylananlar Mini Test&apos;e aktarılır.</p>
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
      {notInPanel > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {notInPanel} onaylı soru kazanım eşleşmediği için öğrenciye gitmiyor.
        </p>
      ) : null}

      {items === null ? <p className="text-sm text-muted-foreground">Yükleniyor…</p> : null}
      {items && items.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">{view === "approved" ? "Onaylanmış soru yok." : "Onay bekleyen soru yok."}</p>
      ) : null}

      <ul className="space-y-4">
        {(items ?? []).map((q) => (
          <li key={q.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5">{SOURCE_LABEL[q.source]}</span>
              <span className="rounded bg-muted px-2 py-0.5">{q.subject}</span>
              {q.objectiveCode ? <span className="rounded bg-muted px-2 py-0.5">{q.objectiveCode}</span> : null}
              <span className="rounded bg-muted px-2 py-0.5">{q.model}</span>
              <span className="rounded bg-muted px-2 py-0.5">{q.runDate}</span>
              {view === "approved" ? (
                <span className="rounded bg-muted px-2 py-0.5 font-medium">{q.inPanel ? "Öğrenciye açık" : "Aktarılamadı"}</span>
              ) : null}
            </div>
            <p className="whitespace-pre-line text-sm">{q.body.stem}</p>
            <ol className="space-y-1 text-sm">
              {q.body.options.map((opt, i) => {
                const letter = QUESTION_LETTERS[i];
                const isKey = letter === q.body.key;
                return (
                  <li key={letter} className={isKey ? "font-semibold text-green-700" : ""}>
                    {letter}) {opt}
                    {isKey ? " ✓" : ""}
                    {q.body.meta?.option_origins?.[i] && !isKey ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (çeldirici: {q.body.meta.option_origins[i]})
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {q.body.explanation ? <p className="text-xs text-muted-foreground">Açıklama: {q.body.explanation}</p> : null}
            <Basis q={q} />
            {view === "approved" ? (
              <button
                type="button"
                disabled={busyId === q.id}
                onClick={() => void revoke(q.id)}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Onayı geri al
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === q.id}
                  onClick={() => void decide(q.id, "APPROVED")}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Onayla
                </button>
                <button
                  type="button"
                  disabled={busyId === q.id}
                  onClick={() => void decide(q.id, "REJECTED")}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Reddet
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Bu soru neye dayanıyor": dayandığı çıkmış soru, kazanım, soru biçimi ve üretim değerleri. Eski satırlarda meta yoktur. */
function Basis({ q }: { q: PoolQuestion }) {
  const meta = q.body.meta;
  const rows: [string, string][] = [];
  if (meta?.reference_question) rows.push(["Dayandığı çıkmış soru", meta.reference_question]);
  if (q.objectiveCode || meta?.objective_text) {
    rows.push(["Kazanım", [q.objectiveCode, meta?.objective_text].filter(Boolean).join(" — ")]);
  }
  if (meta?.course) rows.push(["Ders", meta.course]);
  if (meta?.form) rows.push(["Soru biçimi", FORM_LABEL[meta.form] ?? meta.form]);
  rows.push(["Üretici", q.source === "AIG" ? `Kod ile üretildi (model: ${q.model})` : `Dil modeli (${q.model})`]);
  const params = Object.entries(meta?.params ?? {});
  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-3 text-xs">
      <p className="font-medium">Dayanak</p>
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {params.length ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">Üretimde kullanılan değerler</summary>
          <p className="mt-1">{params.map(([k, v]) => `${k} = ${String(v)}`).join(" · ")}</p>
        </details>
      ) : null}
    </div>
  );
}
