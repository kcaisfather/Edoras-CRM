"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OBJECTION_REASONS,
  OBJECTION_REASON_LABELS,
  type ObjectedQuestion,
} from "@/lib/domain/question-pool/objections";

const QUESTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

/**
 * Öğrencilerin Mini Test / Düello sonucunda "İtiraz et" dediği sorular. Soru kendiliğinden gizlenmez: yönetici
 * "Onayı geri al" ile kaldırır (soru kuyruğa döner), ya da itirazı "Çözüldü" / "Yersiz" diye kapatır. Öğrenci kimliği gösterilmez.
 */
export function QuestionObjections() {
  const [items, setItems] = useState<ObjectedQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/question-pool/objections", {
      cache: "no-store",
    });
    setError(null);
    if (!res.ok) {
      setError(
        res.status === 403
          ? "Bu ekran yalnız yöneticiler içindir."
          : "İtirazlar yüklenemedi.",
      );
      setItems([]);
      return;
    }
    setItems((await res.json()) as ObjectedQuestion[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    questionId: string,
    action: "revoke" | "resolve" | "dismiss",
  ) {
    setBusyId(questionId);
    const res = await fetch(`/api/question-pool/objections/${questionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(
        action === "revoke"
          ? "Onay geri alınamadı (soru zaten kuyruğa dönmüş olabilir); listeyi yenileyin."
          : "İşlem kaydedilemedi; listeyi yenileyin.",
      );
      return;
    }
    setItems((prev) => (prev ?? []).filter((q) => q.questionId !== questionId));
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : null}
      {items && items.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">Açık itiraz yok.</p>
      ) : null}

      <ul className="space-y-4">
        {(items ?? []).map((q) => (
          <li key={q.questionId} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                {q.count} itiraz
              </span>
              <span className="rounded bg-muted px-2 py-0.5">{q.subject}</span>
              <span className="rounded bg-muted px-2 py-0.5">
                {q.active ? "Öğrenciye açık" : "Öğrenciye kapalı"}
              </span>
              {OBJECTION_REASONS.filter((r) => q.reasons[r] > 0).map((r) => (
                <span key={r} className="rounded bg-muted px-2 py-0.5">
                  {OBJECTION_REASON_LABELS[r]}: {q.reasons[r]}
                </span>
              ))}
            </div>
            <p className="whitespace-pre-line text-sm">{q.stem}</p>
            <ol className="space-y-1 text-sm">
              {q.options.map((opt, i) => {
                const letter = QUESTION_LETTERS[i];
                const isKey = letter === q.answerKey;
                return (
                  <li
                    key={letter}
                    className={isKey ? "font-semibold text-green-700" : ""}
                  >
                    {letter}) {opt}
                    {isKey ? " ✓" : ""}
                  </li>
                );
              })}
            </ol>
            {q.explanation ? (
              <p className="text-xs text-muted-foreground">
                Açıklama: {q.explanation}
              </p>
            ) : null}
            {q.notes.length > 0 ? (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Öğrenci notları
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {q.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {q.active ? (
                <button
                  type="button"
                  disabled={busyId === q.questionId}
                  onClick={() => void act(q.questionId, "revoke")}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Onayı geri al
                </button>
              ) : null}
              <button
                type="button"
                disabled={busyId === q.questionId}
                onClick={() => void act(q.questionId, "resolve")}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Çözüldü
              </button>
              <button
                type="button"
                disabled={busyId === q.questionId}
                onClick={() => void act(q.questionId, "dismiss")}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Yersiz
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
