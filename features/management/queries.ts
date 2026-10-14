"use client";

import { useQuery } from "@tanstack/react-query";
import { managementApi } from "./api";

/** Yönetim önbellek anahtarları; bağ değişince (bağla / kaldır) hepsi tazelenir. */
export const managementKeys = {
  all: ["management"] as const,
  session: () => [...managementKeys.all, "session"] as const,
  tasks: () => [...managementKeys.all, "tasks"] as const,
  task: (id: number) => [...managementKeys.all, "task", id] as const,
  meetings: () => [...managementKeys.all, "meetings"] as const,
  meeting: (id: number) => [...managementKeys.all, "meeting", id] as const,
  contacts: () => [...managementKeys.all, "contacts"] as const,
};

/** KCA Panel bağ durumu + Edoras projeleri (her sayfanın kapısı). */
export function useKcaSession() {
  return useQuery({ queryKey: managementKeys.session(), queryFn: ({ signal }) => managementApi.session(signal), staleTime: 60 * 1000 });
}

export function useKcaTasks(enabled = true) {
  return useQuery({ queryKey: managementKeys.tasks(), queryFn: ({ signal }) => managementApi.tasks(signal), enabled, staleTime: 30 * 1000 });
}

export function useKcaTask(id: number | null) {
  return useQuery({
    queryKey: managementKeys.task(id ?? 0),
    queryFn: ({ signal }) => managementApi.task(id!, signal),
    enabled: id !== null,
    staleTime: 15 * 1000,
  });
}

export function useKcaMeetings(enabled = true) {
  return useQuery({ queryKey: managementKeys.meetings(), queryFn: ({ signal }) => managementApi.meetings(signal), enabled, staleTime: 30 * 1000 });
}

export function useKcaMeeting(id: number | null) {
  return useQuery({
    queryKey: managementKeys.meeting(id ?? 0),
    queryFn: ({ signal }) => managementApi.meeting(id!, signal),
    enabled: id !== null,
    staleTime: 15 * 1000,
  });
}

export function useKcaContacts(enabled = true) {
  return useQuery({ queryKey: managementKeys.contacts(), queryFn: ({ signal }) => managementApi.contacts(signal), enabled, staleTime: 30 * 1000 });
}
