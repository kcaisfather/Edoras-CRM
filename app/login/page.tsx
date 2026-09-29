import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginPage } from "@/features/auth/components/LoginPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title"), description: t("description") };
}

export default function LoginPageRoute() {
  return <LoginPage />;
}
