import { AI_LABEL, AI_STYLE, type AiVerdictValue } from "./AiReviewBadge";

/**
 * Haiku'nun gerekçesi, kartın üstünde ayrı ve okunur bir kutu olarak. RED ve BELİRSİZ'de her zaman görünür (karar
 * insanda); ONAY'da da gerekçe varsa gösterilir. Karar yoksa ya da gerekçe boşsa hiçbir şey çizilmez.
 */
export function AiReviewNote({ verdict, reason }: { verdict: AiVerdictValue | null; reason: string | null }) {
  if (!verdict || !reason) return null;
  return (
    <div className={`rounded-md px-3 py-2 text-sm ${AI_STYLE[verdict]}`} role="note">
      <p className="text-xs font-semibold uppercase tracking-wide">{AI_LABEL[verdict]} — gerekçe</p>
      <p className="mt-1 whitespace-pre-line">{reason}</p>
    </div>
  );
}
