// Shared control-density classes keep inline buttons and nested menus aligned to
// the same grid as the chat header.
export const THREAD_DETAILS_PANEL_ROW_GAP_CLASS = "gap-1";

export const THREAD_DETAILS_PANEL_ICON_SIZE_CLASS = "size-3.5";

export const THREAD_DETAILS_PANEL_HEADER_CLASS = "text-xs font-medium text-foreground";

export const THREAD_DETAILS_PANEL_MUTED_TEXT_CLASS = "text-xs text-muted-foreground";

export const THREAD_DETAILS_PANEL_ACCENT_TEXT_CLASS = "text-xs text-accent-foreground";

export const THREAD_DETAILS_PANEL_ICON_SLOT_CLASS = "size-4 shrink-0 text-muted-foreground";

// Panel actions share an interactive surface so split-buttons, menus, and single
// buttons match resting tone and elevation within the card.
const THREAD_DETAILS_PANEL_CONTROL_SURFACE_CLASS =
  "interactive-card interactive-hover text-foreground/85 transition-[background-color,border-color,color,opacity,transform] duration-150";

const THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS = `${THREAD_DETAILS_PANEL_CONTROL_SURFACE_CLASS} border-transparent bg-transparent hover:border-border/60 hover:bg-muted/40 hover:text-foreground active:bg-muted/60 data-active:border-border/60 data-active:bg-muted/40 data-active:text-foreground`;

const THREAD_DETAILS_PANEL_SPLIT_GROUP_SURFACE_CLASS =
  "border border-transparent hover:border-border/60 hover:bg-muted/30 has-[[data-popup-open]]:border-border/60 has-[[data-popup-open]]:bg-muted/30 focus-within:border-border/60 focus-within:bg-muted/30";

const THREAD_DETAILS_PANEL_SPLIT_BUTTON_SURFACE_CLASS =
  "border-transparent bg-transparent hover:bg-muted/40 hover:text-foreground active:bg-muted/60 data-active:bg-muted/40 data-active:text-foreground data-popup-open:bg-muted/40 data-popup-open:text-foreground";

export const THREAD_DETAILS_PANEL_CONTROL_CLASS =
  "h-6 rounded-md px-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const THREAD_DETAILS_PANEL_FULL_ROW_CONTROL_CLASS = `w-full justify-start border ${THREAD_DETAILS_PANEL_CONTROL_CLASS} ${THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_ROW_ICON_CONTAINER_CLASS =
  "flex size-6 shrink-0 items-center justify-center -ms-1";

export const THREAD_DETAILS_PANEL_ICON_ACTION_CLASS = `size-6 justify-center rounded-md border-transparent bg-transparent p-0 sm:size-6 ${THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_META_ACTION_CLASS = `h-6 gap-1 rounded-md border-transparent px-1.5 text-xs font-medium text-muted-foreground ${THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS = `group/details-split flex w-full items-center rounded-lg ${THREAD_DETAILS_PANEL_SPLIT_GROUP_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_SPLIT_PRIMARY_CLASS = `${THREAD_DETAILS_PANEL_CONTROL_CLASS} flex-1 justify-start rounded-e-none ${THREAD_DETAILS_PANEL_SPLIT_BUTTON_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_SPLIT_SECONDARY_CLASS = `${THREAD_DETAILS_PANEL_CONTROL_CLASS} w-8 justify-center rounded-s-none px-0 ${THREAD_DETAILS_PANEL_SPLIT_BUTTON_SURFACE_CLASS}`;

// The split hairline shows only while the pair is in use, so resting rows read as plain rows.
export const THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS =
  "h-4 w-px shrink-0 bg-transparent group-hover/details-split:bg-border/65 group-has-[[data-popup-open]]/details-split:bg-border/65";

export const THREAD_DETAILS_CARD_SURFACE_CLASS =
  "dropdown-glass isolate contain-paint overflow-hidden rounded-2xl";
