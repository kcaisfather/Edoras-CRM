"use client";

/**
 * Aday birleştirme penceresi (yalnız ADMIN): seçilen aday KALIR, öbür aday silinir; notları, görevleri, randevuları,
 * anketleri taşınır ve boş alanları doldurulur. Geri alınamaz. İki aday da farklı kurumlara bağlıysa birleştirilemez
 * (önce birinin bağlantısı kaldırılır).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getLeadDisplayName } from "@/lib/domain/crm/utils";
import { useMergeLeads } from "../mutations";

export function CrmMergeDialog({ keep, others, onClose }: { keep: CrmLead; others: CrmLead[]; onClose: () => void }) {
  const t = useTranslations("crm.merge");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const merge = useMergeLeads();
  const [dropId, setDropId] = useState(others[0]?.id ?? "");
  const drop = others.find((o) => o.id === dropId);
  const bothLinked = !!keep.institutionId && !!drop?.institutionId;

  const submit = async () => {
    if (!drop || bothLinked) return;
    try {
      await merge.mutateAsync({ keepId: keep.id, dropId: drop.id });
      toast.success(t("done"));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !merge.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body", { keep: getLeadDisplayName(keep) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("dropLabel")}</p>
          <Select value={dropId} onValueChange={setDropId} disabled={merge.isPending}>
            <SelectTrigger aria-label={t("dropLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {others.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.organizationName || getLeadDisplayName(o)}
                  {o.contactEmail ? ` · ${o.contactEmail}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("moved")}</p>
          {bothLinked && (
            <p role="alert" className="text-sm text-destructive">
              {t("bothLinked")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merge.isPending}>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!drop || bothLinked || merge.isPending} aria-busy={merge.isPending}>
            {merge.isPending && <Loader2 className="animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
