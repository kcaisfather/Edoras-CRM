"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, ExternalLink, LifeBuoy, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/lib/navigation";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useTicketLink } from "../mutations";
import { useTickets } from "../queries";
import { CreateTicketDialog } from "./CreateTicketDialog";
import { TicketDetailDialog } from "./TicketDetailDialog";
import { TicketTable } from "./TicketsPage";

/**
 * Kurum ayrıntısındaki "Destek talepleri" kartı: kurumun talepleri, talep aç ve müşteriye verilecek destek bağlantısı
 * (/t/{token}). Bağlantıyı yenilemek eskisini geçersiz kılar — onay ister. Kurum sayfası bu kartı `aside` ile alır.
 */
export function InstitutionTicketsCard({ institutionId }: { institutionId: string }) {
  const t = useTranslations("tickets.institutionCard");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const query = useTickets({ institutionId });
  const link = useTicketLink(institutionId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const copyLink = async (rotate: boolean) => {
    try {
      const { token } = await link.mutateAsync(rotate);
      const url = `${window.location.origin}/t/${encodeURIComponent(token)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(rotate ? t("rotated") : t("copied"));
      } catch {
        toast.error(t("copyFailed"));
      }
      setConfirmRotate(false);
    } catch (err) {
      toast.error(errorMessage(err, t("linkError")));
    }
  };

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold leading-tight">
          <LifeBuoy className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus />
            {t("new")}
          </Button>
          <Link href="/crm/tickets" className={buttonVariants({ size: "sm", variant: "outline" })}>
            <ExternalLink />
            {t("open")}
          </Link>
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : query.isError ? (
        <p className="text-xs text-muted-foreground">{t("error")}</p>
      ) : (query.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <TicketTable tickets={query.data ?? []} onOpen={setOpenId} />
      )}

      <div className="mt-4 space-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void copyLink(false)} disabled={link.isPending}>
            {link.isPending ? <Loader2 className="animate-spin" /> : <Copy />}
            {t("copyLink")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmRotate(true)} disabled={link.isPending}>
            <RefreshCw />
            {t("rotateLink")}
          </Button>
        </div>
      </div>

      <Dialog open={confirmRotate} onOpenChange={(o) => !link.isPending && setConfirmRotate(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("rotateTitle")}</DialogTitle>
            <DialogDescription>{t("rotateBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRotate(false)} disabled={link.isPending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void copyLink(true)} disabled={link.isPending} aria-busy={link.isPending}>
              {link.isPending && <Loader2 className="animate-spin" />}
              {t("rotateConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateTicketDialog open={creating} onOpenChange={setCreating} institutionId={institutionId} onCreated={setOpenId} />
      <TicketDetailDialog ticketId={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}
