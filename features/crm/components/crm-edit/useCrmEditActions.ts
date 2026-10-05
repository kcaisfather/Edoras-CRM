"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useDeleteCrmLead } from "../../mutations";

/** Aday panelinin silme akışı: onay penceresi, silme, bildirim. Silince `onDeleted` (panel kapanır). */
export function useCrmEditActions({ leadId, onDeleted }: { leadId: string; onDeleted: () => void }) {
  const t = useTranslations("crm.edit");
  const errorMessage = useApiErrorMessage();
  const remove = useDeleteCrmLead();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDelete = () => {
    remove.mutate(leadId, {
      onSuccess: () => {
        toast.success(t("deleteSuccess"));
        setDeleteConfirmOpen(false);
        onDeleted();
      },
      onError: (err) => toast.error(errorMessage(err, t("deleteError"))),
    });
  };

  return { deleteConfirmOpen, setDeleteConfirmOpen, isDeleting: remove.isPending, handleDelete };
}
