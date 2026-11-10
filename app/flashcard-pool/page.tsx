import type { Metadata } from "next";
import { FlashcardPoolReview } from "@/features/flashcard-pool/FlashcardPoolReview";

export const metadata: Metadata = { title: "Kart onayı" };

export default function Page() {
  return <FlashcardPoolReview />;
}
