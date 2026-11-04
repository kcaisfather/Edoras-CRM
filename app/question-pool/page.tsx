import type { Metadata } from "next";
import { QuestionPoolReview } from "@/features/question-pool/QuestionPoolReview";

export const metadata: Metadata = { title: "Soru onayı" };

export default function Page() {
  return <QuestionPoolReview />;
}
