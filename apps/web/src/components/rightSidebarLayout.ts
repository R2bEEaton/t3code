export const INLINE_RIGHT_SIDEBAR_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
export const INLINE_RIGHT_SIDEBAR_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

export function shouldAcceptInlineSidebarWidth(input: {
  nextWidth: number;
  wrapper: HTMLElement;
}): boolean {
  const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
  if (!composerForm) return true;
  const composerViewport = composerForm.parentElement;
  if (!composerViewport) return true;
  const previousSidebarWidth = input.wrapper.style.getPropertyValue("--sidebar-width");
  input.wrapper.style.setProperty("--sidebar-width", `${input.nextWidth}px`);

  const viewportStyle = window.getComputedStyle(composerViewport);
  const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
  const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
  const viewportContentWidth = Math.max(
    0,
    composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
  );
  const formRect = composerForm.getBoundingClientRect();
  const composerFooter = composerForm.querySelector<HTMLElement>(
    "[data-chat-composer-footer='true']",
  );
  const composerRightActions = composerForm.querySelector<HTMLElement>(
    "[data-chat-composer-actions='right']",
  );
  const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
  const composerFooterGap = composerFooter
    ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
      Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
      0
    : 0;
  const minimumComposerWidth =
    COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
  const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
  const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
  const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

  if (previousSidebarWidth.length > 0) {
    input.wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
  } else {
    input.wrapper.style.removeProperty("--sidebar-width");
  }

  return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
}
