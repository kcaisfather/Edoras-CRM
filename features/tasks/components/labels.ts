"use client";

import { useTranslations } from "next-intl";
import type { CrmTaskDto } from "@/lib/domain/tasks/types";

/** Görev etiketi: atanan görevde amaç (ör. "Yenileme görüşmesi"), kural görevinde kural adı. */
export function useTaskKindLabel(): (task: Pick<CrmTaskDto, "kind" | "type">) => string {
  const tKind = useTranslations("crm.tasks.kind");
  const tType = useTranslations("crm.tasks.assign.types");
  return (task) => (task.kind === "assigned" && task.type ? tType(task.type) : tKind(task.kind));
}
