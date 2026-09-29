"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PanelRole } from "@/lib/domain/auth/types";
import type { StaffStatus } from "@/lib/domain/staff/logic";
import { teamApi, teamKeys } from "./api";

/** Yalnız onay diyaloğundan çağrılır (CRM'de hesap açar). */
export function useInviteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: teamApi.invite,
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

/** Yalnız onay diyaloğundan çağrılır. */
export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; role?: PanelRole; status?: StaffStatus }) => teamApi.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useResetStaffPassword() {
  return useMutation({ mutationFn: (id: string) => teamApi.resetPassword(id) });
}
