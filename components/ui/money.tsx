import { cn } from "@/lib/utils";

/** Metin içindeki para birimi işaretleri (backend hazır biçimli tutar dizelerinde görülenler). */
const CURRENCY_TOKENS = /\s*(?:TRY|TL|₺)\s*/gi;

/**
 * TL tutarı: sayı + küçük, soluk "₺" işareti (metin "TRY" soneki yerine). Sayı verilirse yerel biçimle
 * formatlanır; dize verilirse (ör. backend "1.250 TRY") içindeki TRY/TL/₺ ayıklanıp aynı görünümle çizilir.
 */
export function Money({
  value,
  locale = "tr-TR",
  fractionDigits = 0,
  className,
}: {
  value: number | string | null | undefined;
  locale?: string;
  fractionDigits?: number;
  className?: string;
}) {
  let text: string;
  if (value == null || value === "") text = "";
  else if (typeof value === "number") {
    text = Number.isFinite(value)
      ? new Intl.NumberFormat(locale, {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }).format(value)
      : "";
  } else text = value.replace(CURRENCY_TOKENS, " ").trim();
  if (!text) return <span className={className}>-</span>;
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <span className="mr-[0.15em] align-baseline text-[0.7em] font-normal text-muted-foreground" aria-hidden>
        ₺
      </span>
      <span className="sr-only">TL </span>
      {text}
    </span>
  );
}
