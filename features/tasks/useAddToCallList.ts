"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiErrorCode } from "@/lib/api/errors";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { todayIso } from "@/lib/domain/institutions/rules";
import type { CrmLead } from "@/lib/domain/crm/types";
import { useAssignTask } from "./mutations";

/**
 * "Arama listesine ekle" (DeepSport useAddToCallList): adaya bugüne, amaç "Arama", notsuz ve atanmamış (ekip havuzu)
 * görev — "Görev ata"yla aynı uç (POST /api/crm/tasks). Mükerrer görev açılmaz: aynı aday için bu istek sürerken
 * ikinci tıklama yok sayılır; bugünün aynı görevi zaten açıksa sunucu 409 TASK_DUPLICATE döner ve "zaten listede"
 * bildirilir. Hata olursa bildirim burada gösterilir.
 */
export function useAddToCallList() {
  const t = useTranslations("crm.tasks.assign");
  const assign = useAssignTask();
  const errorMessage = useApiErrorMessage();
  const inFlight = useRef(new Set<string>());

  /** Eklendiyse true; zaten listedeyse ya da hata olduysa false. */
  const add = async (lead: CrmLead): Promise<boolean> => {
    if (inFlight.current.has(lead.id)) return false;
    inFlight.current.add(lead.id);
    try {
      await assign.mutateAsync({ leadId: lead.id, dueDate: todayIso(), type: "arama", assigneeId: null });
      toast.success(t("callListSuccess"));
      return true;
    } catch (err) {
      if (apiErrorCode(err) === "TASK_DUPLICATE") toast.info(t("callListExists"));
      else toast.error(errorMessage(err, t("error")));
      return false;
    } finally {
      inFlight.current.delete(lead.id);
    }
  };

  return { add, isPending: assign.isPending };
}
