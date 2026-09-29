import { redirect } from "next/navigation";

/** Kök adres ana sayfaya gider; oturum yoksa proxy.ts önce /login'e yollar. */
export default function HomePage() {
  redirect("/dashboard");
}
