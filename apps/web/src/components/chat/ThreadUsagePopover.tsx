import { useLayoutEffect, type RefObject } from "react";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { useUsagePanelStore } from "../../usagePanelStore";
import { Popover, PopoverCreateHandle, PopoverPopup } from "../ui/popover";
import { useChatCanvas } from "./ChatCanvasContext";
import { THREAD_DETAILS_CARD_GAP } from "./threadDetailsCardLayout";
import { ThreadUsageCard } from "./ThreadUsageCard";

export function ThreadUsagePopover({
  anchor,
  handle,
  presentation,
}: {
  anchor: RefObject<Element | null>;
  handle: ReturnType<typeof PopoverCreateHandle>;
  presentation: ThreadPanelPresentation;
}) {
  const open = useUsagePanelStore((state) => state.popoverOpen);
  const setOpen = useUsagePanelStore((state) => state.setPopoverOpen);
  const canvas = useChatCanvas();
  useLayoutEffect(() => {
    if (presentation === "inline") setOpen(false);
  }, [presentation, setOpen]);
  return (
    <Popover handle={handle} open={presentation === "popover" && open} onOpenChange={setOpen}>
      <PopoverPopup
        anchor={anchor}
        align="end"
        alignOffset={THREAD_DETAILS_CARD_GAP - 8}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        side="bottom"
        sideOffset={canvas?.detailsCardTopInset ?? 0}
        variant="panel"
        padding="none"
      >
        <div data-thread-usage-panel="popover">
          <ThreadUsageCard />
        </div>
      </PopoverPopup>
    </Popover>
  );
}
