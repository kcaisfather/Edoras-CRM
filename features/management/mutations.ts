"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  KcaContactCreateInput,
  KcaContactPatchInput,
  KcaLinkInput,
  KcaMeetingCreateInput,
  KcaMeetingDetailDto,
  KcaMeetingPatchInput,
  KcaSessionDto,
  KcaTaskCreateInput,
  KcaTaskDetailDto,
  KcaTaskPatchInput,
} from "@/lib/domain/kca/types";
import { managementApi } from "./api";
import { managementKeys } from "./queries";

/**
 * Bağla / kaldır: görev, toplantı ve network önbelleği kişiye özel olduğundan atılır. Oturum sorgusu ATILMAZ (sayfanın
 * kapısı onu izliyor; silinip yeniden yazılırsa gözlemci eski sorguda kalır) — üzerine yazılır / tazelenir.
 */
const notSession = { queryKey: managementKeys.all, predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[1] !== "session" };

export function useLinkKca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: KcaLinkInput) => managementApi.link(body),
    onSuccess: (session: KcaSessionDto) => {
      qc.removeQueries(notSession);
      qc.setQueryData(managementKeys.session(), session);
    },
  });
}

export function useUnlinkKca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => managementApi.unlink(),
    onSuccess: () => {
      qc.removeQueries(notSession);
      void qc.invalidateQueries({ queryKey: managementKeys.session() });
    },
  });
}

/** Görev yazımları güncel ayrıntıyı önbelleğe koyar; liste ve toplantılar (görev sayısı) tazelenir. */
function useTaskRefresh() {
  const qc = useQueryClient();
  return {
    detail: (d: KcaTaskDetailDto) => {
      qc.setQueryData(managementKeys.task(d.task.id), d);
      void qc.invalidateQueries({ queryKey: managementKeys.tasks() });
      if (d.task.meetingId) void qc.invalidateQueries({ queryKey: managementKeys.meeting(d.task.meetingId) });
      void qc.invalidateQueries({ queryKey: managementKeys.meetings() });
    },
    /** Hata: görev bu arada başka panelden değişmiş / silinmiş olabilir. */
    settle: () => void qc.invalidateQueries({ queryKey: managementKeys.tasks() }),
  };
}

export function useCreateKcaTask() {
  const r = useTaskRefresh();
  return useMutation({ mutationFn: (body: KcaTaskCreateInput) => managementApi.createTask(body), onSuccess: r.detail });
}

export function usePatchKcaTask(id: number) {
  const r = useTaskRefresh();
  return useMutation({ mutationFn: (body: KcaTaskPatchInput) => managementApi.patchTask(id, body), onSuccess: r.detail, onError: r.settle });
}

export function useCommentKcaTask(id: number) {
  const r = useTaskRefresh();
  return useMutation({ mutationFn: (body: string) => managementApi.commentTask(id, body), onSuccess: r.detail });
}

export function useApproveKcaTask(id: number) {
  const r = useTaskRefresh();
  return useMutation({ mutationFn: (note: string | null) => managementApi.approveTask(id, note), onSuccess: r.detail, onError: r.settle });
}

export function useRequestKcaChanges(id: number) {
  const r = useTaskRefresh();
  return useMutation({ mutationFn: (note: string) => managementApi.requestChanges(id, note), onSuccess: r.detail, onError: r.settle });
}

export function useDeleteKcaTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => managementApi.deleteTask(id),
    onSettled: (_r, _e, id) => {
      qc.removeQueries({ queryKey: managementKeys.task(id) });
      void qc.invalidateQueries({ queryKey: managementKeys.tasks() });
      void qc.invalidateQueries({ queryKey: managementKeys.meetings() });
    },
  });
}

function useMeetingRefresh() {
  const qc = useQueryClient();
  return (d: KcaMeetingDetailDto) => {
    qc.setQueryData(managementKeys.meeting(d.meeting.id), d);
    void qc.invalidateQueries({ queryKey: managementKeys.meetings() });
  };
}

export function useCreateKcaMeeting() {
  const refresh = useMeetingRefresh();
  return useMutation({ mutationFn: (body: KcaMeetingCreateInput) => managementApi.createMeeting(body), onSuccess: refresh });
}

export function usePatchKcaMeeting(id: number) {
  const refresh = useMeetingRefresh();
  return useMutation({ mutationFn: (body: KcaMeetingPatchInput) => managementApi.patchMeeting(id, body), onSuccess: refresh });
}

export function useSetKcaMeetingProcessed(id: number) {
  const refresh = useMeetingRefresh();
  return useMutation({
    mutationFn: (vars: { done: boolean; result: string | null }) => managementApi.setProcessed(id, vars.done, vars.result),
    onSuccess: refresh,
  });
}

export function useDeleteKcaMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => managementApi.deleteMeeting(id),
    onSettled: (_r, _e, id) => {
      qc.removeQueries({ queryKey: managementKeys.meeting(id) });
      void qc.invalidateQueries({ queryKey: managementKeys.meetings() });
      void qc.invalidateQueries({ queryKey: managementKeys.tasks() });
    },
  });
}

export function useCreateKcaContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: KcaContactCreateInput) => managementApi.createContact(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: managementKeys.contacts() }),
  });
}

export function usePatchKcaContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; body: KcaContactPatchInput }) => managementApi.patchContact(vars.id, vars.body),
    onSettled: () => void qc.invalidateQueries({ queryKey: managementKeys.contacts() }),
  });
}

export function useDeleteKcaContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => managementApi.deleteContact(id),
    onSettled: () => void qc.invalidateQueries({ queryKey: managementKeys.contacts() }),
  });
}
