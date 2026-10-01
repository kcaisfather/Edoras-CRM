import { NextResponse } from "next/server";
import { requireStaff, requireUuid, route } from "@/lib/api/server";
import { getInvoicePdfUrl } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Paraşüt'te kesilmiş faturanın PDF'i (yalnız ADMIN). Paraşüt'ün PDF adresi 1 saat geçerli olduğundan saklanmaz: her
 * açılışta taze adres alınıp oraya yönlendirilir. 409 INVOICE_PDF_NOT_READY: PDF henüz üretilmedi.
 */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  const url = await getInvoicePdfUrl(id);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
});
