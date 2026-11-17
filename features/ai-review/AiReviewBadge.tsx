type Props = {
  verdict: "ONAY" | "RED" | "BELIRSIZ" | null;
  confidence: number | null;
  reason: string | null;
  /** Karar insan değil Haiku tarafından verildi (onaylananlar/reddedilenler görünümünde). */
  auto: boolean;
};

const STYLE = {
  ONAY: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  RED: "bg-destructive/15 text-destructive",
  BELIRSIZ: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
} as const;

const LABEL = { ONAY: "Haiku: onay önerir", RED: "Haiku: red önerir", BELIRSIZ: "Haiku: emin değil" } as const;

/** Onay kuyruğundaki ön inceleme rozeti. Gerekçe fare üzerinde (title) ve yanında kısa metin olarak görünür. */
export function AiReviewBadge({ verdict, confidence, reason, auto }: Props) {
  if (!verdict) return <span className="rounded bg-muted px-2 py-0.5">Haiku: henüz bakmadı</span>;
  const pct = confidence == null ? "" : ` %${Math.round(confidence * 100)}`;
  return (
    <>
      <span className={`rounded px-2 py-0.5 font-medium ${STYLE[verdict]}`} title={reason ?? undefined}>
        {LABEL[verdict]}
        {pct}
      </span>
      {auto ? <span className="rounded bg-muted px-2 py-0.5 font-medium">Otomatik karar</span> : null}
      {reason ? <span className="basis-full text-xs">{reason}</span> : null}
    </>
  );
}
