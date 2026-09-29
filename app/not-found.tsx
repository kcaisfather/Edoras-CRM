import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotFoundPage } from "@/features/errors/components/NotFoundPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("errors.notFound");
  return { title: t("title"), description: t("description") };
}

export default function NotFound() {
  return <NotFoundPage />;
}
