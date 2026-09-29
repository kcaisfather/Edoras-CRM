import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  expanded: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      expanded: true,
      toggle: () => set((s) => ({ expanded: !s.expanded })),
    }),
    { name: "sidebar-expanded" }
  )
);
