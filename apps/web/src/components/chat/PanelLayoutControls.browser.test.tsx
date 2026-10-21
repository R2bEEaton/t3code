import { useState } from "react";
import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { Popover, PopoverCreateHandle, PopoverPopup } from "../ui/popover";
import { PanelLayoutControls } from "./PanelLayoutControls";

function UsageControls({ presentation }: { presentation: "inline" | "popover" }) {
  const [open, setOpen] = useState(false);
  const [handle] = useState(PopoverCreateHandle);
  const [threadHandle] = useState(PopoverCreateHandle);
  return (
    <>
      <PanelLayoutControls
        terminalAvailable={false}
        terminalOpen={false}
        terminalShortcutLabel={null}
        threadPanelOpen={false}
        threadPanelPresentation={presentation}
        threadPanelPopoverHandle={threadHandle}
        threadPanelShortcutLabel={null}
        rightPanelAvailable={false}
        rightPanelOpen={false}
        rightPanelShortcutLabel={null}
        usagePanelOpen={open}
        usagePanelPopoverHandle={handle}
        onToggleUsagePanel={() => setOpen((value) => !value)}
        onToggleTerminal={() => {}}
        onToggleThreadPanel={() => {}}
        onToggleRightPanel={() => {}}
      />
      <Popover handle={threadHandle} />
      <Popover handle={handle} open={presentation === "popover" && open} onOpenChange={setOpen}>
        <PopoverPopup>Floating usage limits</PopoverPopup>
      </Popover>
      {presentation === "inline" && open ? <aside>Docked usage limits</aside> : null}
    </>
  );
}

it.each(["inline", "popover"] as const)(
  "opens usage limits in %s presentation",
  async (presentation) => {
    await using screen = await render(<UsageControls presentation={presentation} />);
    const toggle = screen.getByRole("button", { name: "Toggle usage limits", exact: true });
    await expect.element(toggle).toBeVisible();
    await toggle.click();
    const card = page.getByText(
      presentation === "inline" ? "Docked usage limits" : "Floating usage limits",
      { exact: true },
    );
    await expect.element(card).toBeVisible();
    await toggle.click();
    await expect.element(card).not.toBeInTheDocument();
  },
);
