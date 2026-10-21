import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverCreateHandle } from "../ui/popover";
import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { useChatCanvas } from "./ChatCanvasContext";
import {
  THREAD_DETAILS_CARD_GAP,
  resolveThreadDetailsCardDensity,
  resolveThreadDetailsCardLayout,
} from "./threadDetailsCardLayout";
import { observeResize } from "../../lib/observeResize";
import { THREAD_DETAILS_CARD_SURFACE_CLASS } from "./threadDetailsPanelStyles";

// Keep in sync with the aside's gap-2.
const CARD_STACK_GAP = 8;

export function ThreadDetailsCard({
  threadRef,
  anchor,
  handle,
  onPresentationChange,
  footer = null,
  children,
}: {
  threadRef: ScopedThreadRef;
  anchor: RefObject<Element | null>;
  handle: ReturnType<typeof PopoverCreateHandle>;
  onPresentationChange: (presentation: ThreadPanelPresentation) => void;
  /** A second card stacked under this one. Only the inline layout has room for it. */
  footer?: ReactNode;
  children: (density: "full" | "compact" | "essential") => ReactNode;
}) {
  const canvas = useChatCanvas();
  const preferredPlacement = canvas
    ? resolveThreadDetailsCardLayout({
        container: canvas.container,
        lane: canvas.lane,
        frame: null,
        topInset: canvas.detailsCardTopInset,
      })
    : null;
  const placement = canvas
    ? resolveThreadDetailsCardLayout({
        container: canvas.container,
        lane: canvas.lane,
        frame: canvas.layout.frame,
        overlapsDetailsCard: canvas.layout.overlapsDetailsCard,
        topInset: canvas.detailsCardTopInset,
      })
    : null;
  const mode = placement ? "inline" : "popover";
  const topInset = canvas?.detailsCardTopInset ?? 0;
  const inlineOpen = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "inline"),
  );
  const popoverOpen = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "popover"),
  );
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const measurementKey = `${threadRef.environmentId}:${threadRef.threadId}:${preferredPlacement?.width ?? "popup"}`;
  const [measurements, setMeasurements] = useState({
    key: measurementKey,
    heights: { full: 0, compact: 0 },
    fullContentHeight: 0,
  });
  const inlineFooter = placement ? footer : null;
  const [footerElement, setFooterElement] = useState<HTMLDivElement | null>(null);
  const [measuredFooterHeight, setMeasuredFooterHeight] = useState(0);
  const footerSpace = inlineFooter && measuredFooterHeight > 0 ? measuredFooterHeight : 0;
  // The footer takes its share first: the card's own scroll and density give way, not the footer.
  const stackedFooterSpace = footerSpace > 0 && inlineOpen ? footerSpace + CARD_STACK_GAP : 0;
  const contentHeights =
    measurements.key === measurementKey ? measurements.heights : { full: 0, compact: 0 };
  const availableHeight = placement?.height ?? Math.max(0, (canvas?.container.height ?? 0) - 52);
  const footerHeightLimit =
    availableHeight - (inlineOpen ? Math.min(160, availableHeight / 2) + CARD_STACK_GAP : 0);
  const height = availableHeight - stackedFooterSpace;
  const density = resolveThreadDetailsCardDensity(height, contentHeights);
  const reportDetailsCard = canvas?.reportDetailsCard;
  const cardLeft = preferredPlacement?.x;
  const cardRight = preferredPlacement
    ? preferredPlacement.x + preferredPlacement.width
    : undefined;
  const detailsBottom =
    preferredPlacement && measurements.key === measurementKey && measurements.fullContentHeight > 0
      ? preferredPlacement.y +
        Math.min(
          measurements.fullContentHeight,
          Math.max(0, preferredPlacement.height - stackedFooterSpace),
        )
      : undefined;
  const cardBottom = inlineOpen
    ? detailsBottom === undefined
      ? undefined
      : detailsBottom + stackedFooterSpace
    : preferredPlacement && footerSpace > 0
      ? preferredPlacement.y + footerSpace
      : undefined;
  const cardVisible = inlineOpen || footerSpace > 0;
  useLayoutEffect(() => {
    reportDetailsCard?.(
      cardVisible && cardLeft !== undefined && cardRight !== undefined && cardBottom !== undefined
        ? { left: cardLeft, right: cardRight, bottom: cardBottom }
        : null,
    );
  }, [reportDetailsCard, cardVisible, cardLeft, cardRight, cardBottom]);
  useLayoutEffect(() => () => reportDetailsCard?.(null), [reportDetailsCard]);
  useLayoutEffect(() => {
    onPresentationChange(mode);
    if (mode === "inline" && popoverOpen)
      useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", false);
  }, [mode, onPresentationChange, threadRef, popoverOpen]);
  useLayoutEffect(() => {
    const element = contentElement;
    if (!element || density === "essential") return;
    const measure = () => {
      const frame = element.closest<HTMLElement>("[data-thread-details-card]");
      const next = element.offsetHeight + (frame ? frame.offsetHeight - frame.clientHeight : 0);
      // PR lists and lineage scroll as they expand. Counting them toward density would hide
      // the section and workspace controls when the user asks to see more rows.
      const lists = element.querySelectorAll<HTMLElement>(
        "[data-thread-relationships-panel], [data-thread-details-pr-list]",
      );
      const fittingHeight =
        next - Array.from(lists).reduce((sum, list) => sum + list.offsetHeight, 0);
      setMeasurements((current) => {
        const heights = current.key === measurementKey ? current.heights : { full: 0, compact: 0 };
        const fullContentHeight =
          density === "full"
            ? next
            : current.key === measurementKey
              ? current.fullContentHeight
              : 0;
        return current.key === measurementKey &&
          heights[density] === fittingHeight &&
          current.fullContentHeight === fullContentHeight
          ? current
          : {
              key: measurementKey,
              heights: { ...heights, [density]: fittingHeight },
              fullContentHeight,
            };
      });
    };
    measure();
    return observeResize(element, measure);
  }, [contentElement, density, measurementKey]);
  useLayoutEffect(() => {
    if (!footerElement) return;
    const measure = () => setMeasuredFooterHeight(footerElement.offsetHeight);
    measure();
    return observeResize(footerElement, measure);
  }, [footerElement]);
  const card = (
    <div
      className={cn(
        THREAD_DETAILS_CARD_SURFACE_CLASS,
        "grid max-h-full grid-rows-[minmax(0,1fr)]",
        mode === "popover" &&
          "max-h-[min(calc(100dvh-6.5rem),calc(var(--available-height,100dvh)-1rem))]",
      )}
      style={placement ? { maxHeight: height } : undefined}
      data-thread-details-card
    >
      <ScrollArea scrollFade className="min-h-0">
        <div ref={setContentElement}>{children(density)}</div>
      </ScrollArea>
    </div>
  );
  return (
    <Popover
      handle={handle}
      open={mode === "popover" && popoverOpen}
      onOpenChange={(open, details) => {
        const target =
          details.reason === "focus-out"
            ? (details.event as FocusEvent).relatedTarget
            : details.reason === "outside-press"
              ? details.event.target
              : null;
        if (!open && target instanceof Element && target.closest("[data-thread-find-bar]")) {
          details.cancel();
          return;
        }
        useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", open);
      }}
    >
      {placement ? (
        inlineOpen || inlineFooter ? (
          <aside
            aria-label="Thread details"
            // Slides down to make room for the find bar, but returns in the same frame
            // the bar closes: a floating preview below moves up at once and would
            // otherwise overlap the card mid-slide.
            className={cn(
              "absolute z-20 flex flex-col gap-2",
              topInset > 0 &&
                "transition-[top] duration-150 ease-out motion-reduce:transition-none",
            )}
            style={{
              right: placement.right,
              top: placement.y,
              width: placement.width,
              maxHeight: availableHeight,
            }}
            data-density={density}
            data-thread-details-panel="inline"
          >
            {inlineOpen ? card : null}
            {inlineFooter ? (
              <div
                ref={setFooterElement}
                className="shrink-0"
                style={
                  { "--thread-usage-available-height": `${footerHeightLimit}px` } as CSSProperties
                }
              >
                {inlineFooter}
              </div>
            ) : null}
          </aside>
        ) : null
      ) : (
        <PopoverPopup
          anchor={anchor}
          align="end"
          // Lines the card up with the find bar: the panel pads its card by 8px.
          alignOffset={THREAD_DETAILS_CARD_GAP - 8}
          collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
          side="bottom"
          sideOffset={topInset}
          variant="panel"
          padding="none"
        >
          <div data-density={density} data-thread-details-panel="popover">
            {card}
          </div>
        </PopoverPopup>
      )}
    </Popover>
  );
}
