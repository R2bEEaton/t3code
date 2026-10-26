import type { LimitPool, LimitPoolWindow } from "@t3tools/shared/usageLimits";
import { type CSSProperties, useState } from "react";
import { describe, expect, it } from "vitest";
import "../../index.css";
import { render } from "../../../test/render";
import { ThreadUsageCardView } from "./ThreadUsageCardView";

const window = (kind: LimitPoolWindow["kind"], remainingPercent: number): LimitPoolWindow => ({
  id: `${kind}-1`,
  kind,
  label: kind === "session" ? "Session" : "Weekly",
  remainingPercent,
  members: [],
  columns: [],
  pace: null,
  resets: [],
});

const pools: LimitPool[] = ["codex", "claudeAgent", "cursor", "opencode"].map((driver) => ({
  driver: driver as LimitPool["driver"],
  accounts: [],
  windows: [window("session", 55), window("weekly", 76)],
}));

function Card({ providers = pools }: { providers?: readonly LimitPool[] }) {
  const [compact, setCompact] = useState(false);
  return (
    <div style={{ width: 280 }}>
      <ThreadUsageCardView
        pools={providers}
        now={0}
        refreshing={false}
        onRefresh={() => {}}
        compact={compact}
        onToggleCompact={() => setCompact((value) => !value)}
      />
    </div>
  );
}

it("grows past 320px to fit providers when there is room", async () => {
  await using screen = await render(<Card />);
  const card = screen.container.querySelector<HTMLElement>("[data-thread-usage-card]")!;
  const viewport = card.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
  expect(card.getBoundingClientRect().height).toBeGreaterThan(320);
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight + 1);
});

it("scrolls only after reaching the space available beside project actions", async () => {
  await using screen = await render(
    <div style={{ "--thread-usage-available-height": "200px" } as CSSProperties}>
      <Card />
    </div>,
  );
  const card = screen.container.querySelector<HTMLElement>("[data-thread-usage-card]")!;
  const viewport = card.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
  expect(card.getBoundingClientRect().height).toBe(200);
  expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
  await screen.getByRole("button", { name: "Show compact usage limits", exact: true }).click();
  expect(card.getBoundingClientRect().height).toBeLessThan(200);
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight + 1);
});

it("stacks compact split session and weekly bars per provider and restores details", async () => {
  await using screen = await render(<Card />);
  const fullHeight = screen.container.getBoundingClientRect().height;
  await screen.getByRole("button", { name: "Show compact usage limits", exact: true }).click();
  const rows = [...screen.container.querySelectorAll<HTMLElement>("[data-usage-compact-provider]")];
  expect(rows).toHaveLength(4);
  expect(screen.container.innerText).not.toContain("Codex");
  expect(screen.container.innerText).not.toContain("%");
  expect(screen.container.getBoundingClientRect().height).toBeLessThan(fullHeight);
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i]!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      rows[i - 1]!.getBoundingClientRect().bottom,
    );
  }
  await expect
    .element(screen.getByRole("meter", { name: "Codex Session remaining", exact: true }))
    .toHaveAttribute("aria-valuenow", "55");
  await expect
    .element(screen.getByRole("meter", { name: "Codex Weekly remaining", exact: true }))
    .toHaveAttribute("aria-valuenow", "76");
  const sessionFill = rows[0]!.querySelector<HTMLElement>("[data-usage-session-fill]")!;
  const weeklyFill = rows[0]!.querySelector<HTMLElement>("[data-usage-weekly-fill]")!;
  const pill = rows[0]!.querySelector<HTMLElement>("[data-usage-compact-pill]")!;
  expect(sessionFill.getBoundingClientRect().width / pill.getBoundingClientRect().width).toBeCloseTo(
    0.55,
    1,
  );
  expect(weeklyFill.getBoundingClientRect().width / pill.getBoundingClientRect().width).toBeCloseTo(
    0.76,
    1,
  );
  expect(rows[0]!.querySelector("[data-usage-weekly-marker]")).toBeNull();
  expect(rows[0]!.querySelector("[data-usage-compact-reset]")).toBeNull();
  await screen.getByRole("button", { name: "Show detailed usage limits", exact: true }).click();
  expect(screen.container.querySelector("[data-usage-compact-provider]")).toBeNull();
  expect(screen.container.innerText).toContain("55%");
  expect(screen.container.innerText).toContain("Codex");
});

it("shows when each window resets on the compact bar and its hover", async () => {
  const resetsIn = (minutes: number): LimitPoolWindow["resets"] => [
    { member: undefined as never, at: minutes * 60_000, restoresPercent: 100 },
  ];
  const providers = [
    {
      ...pools[0]!,
      windows: [
        { ...window("session", 0), resets: resetsIn(3 * 60 + 58) },
        { ...window("weekly", 76), resets: resetsIn(5 * 24 * 60 + 20 * 60) },
      ],
    },
  ];
  await using screen = await render(<Card providers={providers} />);
  await screen.getByRole("button", { name: "Show compact usage limits", exact: true }).click();
  const countdown = screen.container.querySelector("[data-usage-compact-reset]");
  expect(countdown?.textContent).toBe("⟳ 3h 58m");
  const sessionPace = screen.container.querySelector("[data-usage-session-pace]");
  expect(sessionPace).not.toBeNull();
  const weeklyPace = screen.container.querySelector("[data-usage-weekly-pace]");
  expect(weeklyPace).not.toBeNull();
  await screen
    .getByLabelText("Codex: Session: 0% left · Weekly: 76% left", { exact: true })
    .hover();
  await expect.element(screen.getByText("· resets in 3h 58m", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("· resets in 5d 20h", { exact: true })).toBeVisible();
  expect(document.body.innerText).not.toMatch(/Fill|Caret/);
});

it("shows a weekly-only allowance as the bar without inventing a session or marker", async () => {
  await using screen = await render(
    <Card providers={[{ ...pools[0]!, windows: [window("weekly", 0)] }]} />,
  );
  await screen.getByRole("button", { name: "Show compact usage limits", exact: true }).click();
  await expect
    .element(screen.getByRole("meter", { name: "Codex Weekly remaining", exact: true }))
    .toHaveAttribute("aria-valuenow", "0");
  expect(screen.container.querySelector("[data-usage-weekly-marker]")).toBeNull();
});
