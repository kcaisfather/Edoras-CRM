export type AiFilterValue = "ALL" | "RED" | "BELIRSIZ" | "ONAY" | "NONE";
export type AiCounts = { ONAY: number; RED: number; BELIRSIZ: number; NONE: number };

const OPTIONS: { value: AiFilterValue; label: string }[] = [
  { value: "ALL", label: "Tümü" },
  { value: "RED", label: "Red önerilenler" },
  { value: "BELIRSIZ", label: "Emin olmadıkları" },
  { value: "ONAY", label: "Onay önerilenler" },
  { value: "NONE", label: "Henüz bakılmamış" },
];

/** Bekleyenler listesini Haiku kararına göre süzer; sayılar bekleyenlerin TAMAMINDANDIR (liste en çok 200 satır gösterir). */
export function AiReviewFilterBar({
  value,
  counts,
  onChange,
}: {
  value: AiFilterValue;
  counts: AiCounts | null;
  onChange: (next: AiFilterValue) => void;
}) {
  const total = counts ? counts.ONAY + counts.RED + counts.BELIRSIZ + counts.NONE : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Haiku kararına göre süz">
      {OPTIONS.map((o) => {
        const n = counts ? (o.value === "ALL" ? total : counts[o.value]) : null;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md border px-3 py-1 ${value === o.value ? "bg-muted font-medium" : ""}`}
          >
            {o.label}
            {n != null ? ` (${n})` : ""}
          </button>
        );
      })}
    </div>
  );
}
