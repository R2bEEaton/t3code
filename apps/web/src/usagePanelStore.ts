import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

interface UsagePanelStoreState {
  open: boolean;
  compact: boolean;
  popoverOpen: boolean;
  setPopoverOpen: (open: boolean) => void;
  toggle: () => void;
  toggleCompact: () => void;
}

export const toggleUsagePanel = () => useUsagePanelStore.getState().toggle();

/** Whether the usage limits card sits under the thread details card. One choice for every thread. */
export const useUsagePanelStore = create<UsagePanelStoreState>()(
  persist(
    (set) => ({
      open: false,
      compact: false,
      popoverOpen: false,
      setPopoverOpen: (popoverOpen) => set({ popoverOpen }),
      toggle: () => set((state) => ({ open: !state.open })),
      toggleCompact: () => set((state) => ({ compact: !state.compact })),
    }),
    {
      name: "t3code:usage-panel:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ open: state.open, compact: state.compact }),
    },
  ),
);
