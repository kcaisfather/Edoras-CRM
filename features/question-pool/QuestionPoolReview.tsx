"use client";

import { useCallback, useEffect, useState } from "react";

type PoolQuestion = {
  id: string;
  source: "AIG" | "LLM";
  subject: string;
  objectiveCode: string | null;
  model: string;
  runDate: string;
  body: { stem: string; options: string[]; key: string; explanation: string | null };
  createdAt: string;
};

// rules.ts node:crypto kullandığı için istemciye taşınmaz; harfler burada tekrar edilir.
const QUESTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

const SOURCE_LABEL = { AIG: "Kod (AIG)", LLM: "Dil modeli" } as const;

/**
 * Gece sorularının onay ekranı. Öğretmen kapısı yok: yönetici tek tek onaylar ya da reddeder. Onaylanan soru havuza girer,
 * reddedilen bir daha gösterilmez. Liste yalnız bekleyenleri gösterir.
 */
export function QuestionPoolReview() {
  const [items, setItems] = useState<PoolQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/question-pool", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 403 ? "Bu ekran yalnız yöneticiler içindir." : "Sorular yüklenemedi.");
      setItems([]);
      return;
    }
    setItems((await res.json()) as PoolQuestion[]);
  }, []);

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
    setItems((prev) => (prev ?? []).filter((q) => q.id !== id));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Soru onayı</h1>
          <p className="text-sm text-muted-foreground">Gece üretilen sorular. Onaylananlar havuza girer.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-md border px-3 py-1.5 text-sm">
          Yenile
        </button>
      </header>

      {error ? <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {items === null ? <p className="text-sm text-muted-foreground">Yükleniyor…</p> : null}
      {items && items.length === 0 && !error ? <p className="text-sm text-muted-foreground">Onay bekleyen soru yok.</p> : null}

      <ul className="space-y-4">
        {(items ?? []).map((q) => (
          <li key={q.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5">{SOURCE_LABEL[q.source]}</span>
              <span className="rounded bg-muted px-2 py-0.5">{q.subject}</span>
              {q.objectiveCode ? <span className="rounded bg-muted px-2 py-0.5">{q.objectiveCode}</span> : null}
              <span className="rounded bg-muted px-2 py-0.5">{q.model}</span>
              <span className="rounded bg-muted px-2 py-0.5">{q.runDate}</span>
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
                  </li>
                );
              })}
            </ol>
            {q.body.explanation ? <p className="text-xs text-muted-foreground">Açıklama: {q.body.explanation}</p> : null}
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
          </li>
        ))}
      </ul>
    </div>
  );
}
