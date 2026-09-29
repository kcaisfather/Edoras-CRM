import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Sunucu render'ında false, istemcide true — token/localStorage'a bağlı içerikte hidrasyon uyumu için. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
