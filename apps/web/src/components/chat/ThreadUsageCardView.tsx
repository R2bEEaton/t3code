import {
  displayLimitWindows,
  formatDuration,
  paceRemainingPercent,
  type LimitPool,
  type LimitPoolWindow,
} from "@t3tools/shared/usageLimits";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { providerClients } from "../settings/providerDriverMeta";
import { PaceIcon, barColor } from "../usage/UsageLimits";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { THREAD_DETAILS_CARD_SURFACE_CLASS } from "./threadDetailsPanelStyles";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

function timeUntilReset(window: LimitPoolWindow, now: number): string | null {
  const nextReset = window.resets.find((reset) => reset.at > now);
  return nextReset ? formatDuration(nextReset.at - now) : null;
}

function paceMarkStyles(timeLeft: number | null) {
  if (timeLeft === null) return null;
  const at = `clamp(3px, ${timeLeft}%, calc(100% - 3px))`;
  const [left, right] = [`calc(${at} - 3px)`, `calc(${at} + 3px)`];
  const [near, far] = ["-1px", "calc(100% + 1px)"];
  return {
    tick: { left: at },
    gap: {
      clipPath: `polygon(${near} ${near}, ${left} ${near}, ${left} ${far}, ${right} ${far}, ${right} ${near}, ${far} ${near}, ${far} ${far}, ${near} ${far})`,
    },
  };
}

function windowTimeLeftPercent(window: LimitPoolWindow, now: number): number | null {
  for (const member of window.members) {
    const pace = paceRemainingPercent(member.window, now);
    if (pace !== null) return pace;
  }
  const nextReset = window.resets.find((reset) => reset.at > now);
  if (nextReset) {
    const memberDuration = window.members.find((m) => m.window?.windowDurationMins !== undefined)
      ?.window.windowDurationMins;
    const durationMins =
      memberDuration ?? (window.kind === "session" ? 300 : window.kind === "weekly" ? 10080 : null);
    if (durationMins && durationMins > 0) {
      const lengthMs = durationMins * 60_000;
      const remainingMs = Math.max(0, Math.min(lengthMs, nextReset.at - now));
      return Math.round((remainingMs / lengthMs) * 100);
    }
  }
  return null;
}

function LimitRow({
  window,
  color,
  now,
}: {
  readonly window: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
}) {
  const timeLeft = windowTimeLeftPercent(window, now);
  const pace = paceMarkStyles(timeLeft);
  const resetsIn = timeUntilReset(window, now);
  return (
    <div className="flex flex-col gap-1 py-1.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between text-2xs">
        <span className="font-medium text-foreground">{window.label}</span>
        <div className="flex items-center gap-1.5 tabular-nums">
          <span className="font-semibold text-foreground">{window.remainingPercent}%</span>
          {window.pace ? <PaceIcon pace={window.pace} /> : null}
          {resetsIn ? (
            <span className="shrink-0 text-muted-foreground/70 text-2xs">
              · resets in {resetsIn}
            </span>
          ) : null}
        </div>
      </div>
      <div
        role="meter"
        aria-label={`${window.label} remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={window.remainingPercent}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="absolute inset-0" style={pace?.gap}>
          <div
            className="h-full opacity-40 transition-all"
            style={{
              width: `${window.remainingPercent}%`,
              backgroundColor: color,
            }}
          />
        </div>
        {pace ? (
          <span
            aria-hidden
            className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={pace.tick}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProviderLimits({ pool, now }: { readonly pool: LimitPool; readonly now: number }) {
  const color = barColor(pool.driver);
  const label = providerClients.get(pool.driver)?.label ?? String(pool.driver);
  return (
    <div className="flex flex-col gap-1 border-b border-border/40 py-2.5 first:pt-1 last:border-b-0 last:pb-1">
      <div className="flex items-center gap-2 pb-0.5">
        <ProviderInstanceIcon
          driverKind={pool.driver}
          displayName={label}
          indicatorBackground="var(--popover)"
          className="size-4"
          iconClassName="size-3.5 text-foreground/80"
        />
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
      {displayLimitWindows(pool).map((window) => (
        <LimitRow key={`${window.kind}:${window.id}`} window={window} color={color} now={now} />
      ))}
    </div>
  );
}

function leastRemaining(windows: readonly LimitPoolWindow[]) {
  return windows.reduce<LimitPoolWindow | undefined>(
    (least, window) =>
      !least || window.remainingPercent < least.remainingPercent ? window : least,
    undefined,
  );
}

function CompactBar({
  window,
  color,
  now,
  pace,
  label,
}: {
  readonly window: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
  readonly pace: ReturnType<typeof paceMarkStyles>;
  readonly label: string;
}) {
  const isDepleted = window.remainingPercent === 0;
  const resetTime = isDepleted ? timeUntilReset(window, now) : null;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={window.remainingPercent}
      className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="absolute inset-0" style={pace?.gap}>
        <div
          className="h-full opacity-40 transition-all"
          style={{
            width: `${window.remainingPercent}%`,
            backgroundColor: color,
          }}
          data-usage-session-fill={window.kind === "session" ? "" : undefined}
          data-usage-weekly-fill={window.kind === "weekly" ? "" : undefined}
        />
      </div>
      {pace ? (
        <span
          aria-hidden
          className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={pace.tick}
          data-usage-session-pace={window.kind === "session" ? "" : undefined}
          data-usage-weekly-pace={window.kind === "weekly" ? "" : undefined}
        />
      ) : null}
      {resetTime ? (
        <span
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-1 font-sans text-3xs font-semibold leading-none tabular-nums text-white select-none drop-shadow-sm"
          data-usage-compact-reset
        >
          ⟳ {resetTime}
        </span>
      ) : null}
    </div>
  );
}

function CompactProviderLimits({ pool, now }: { readonly pool: LimitPool; readonly now: number }) {
  const windows = displayLimitWindows(pool);
  const sessions = windows.filter((window) => window.kind === "session");
  const weekly = leastRemaining(windows.filter((window) => window.kind === "weekly"));
  const session = leastRemaining(sessions);
  const fallback = leastRemaining(windows);
  const primary = session ?? weekly ?? fallback;
  if (!primary) return null;

  const hasBoth = Boolean(session && weekly);
  const label = providerClients.get(pool.driver)?.label ?? String(pool.driver);
  const summary = hasBoth
    ? `${session!.label}: ${session!.remainingPercent}% left · ${weekly!.label}: ${weekly!.remainingPercent}% left`
    : `${primary.label}: ${primary.remainingPercent}% left`;

  const sessionTimeLeft = session ? windowTimeLeftPercent(session, now) : null;
  const weeklyTimeLeft = weekly ? windowTimeLeftPercent(weekly, now) : null;
  const primaryTimeLeft = !hasBoth ? windowTimeLeftPercent(primary, now) : null;

  const sessionPace = paceMarkStyles(sessionTimeLeft);
  const weeklyPace = paceMarkStyles(weeklyTimeLeft);
  const primaryPace = paceMarkStyles(primaryTimeLeft);

  const sessionResetsIn = session ? timeUntilReset(session, now) : null;
  const weeklyResetsIn = weekly ? timeUntilReset(weekly, now) : null;

  const color = barColor(pool.driver);

  return (
    <div className="px-1.5 pb-1.5 last:pb-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              tabIndex={0}
              aria-label={`${label}: ${summary}`}
              className="relative flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-usage-compact-provider
            />
          }
        >
          <ProviderInstanceIcon
            driverKind={pool.driver}
            displayName={label}
            indicatorBackground="var(--popover)"
            className="size-4 shrink-0"
            iconClassName="size-3.5 text-foreground/80"
          />
          <div
            className="relative flex flex-1 min-w-0 flex-col gap-1 justify-center"
            data-usage-compact-pill
          >
            {hasBoth ? (
              <>
                <CompactBar
                  window={session!}
                  color={color}
                  now={now}
                  pace={sessionPace}
                  label={`${label} ${session!.label} remaining`}
                />
                <CompactBar
                  window={weekly!}
                  color={color}
                  now={now}
                  pace={weeklyPace}
                  label={`${label} ${weekly!.label} remaining`}
                />
              </>
            ) : (
              <CompactBar
                window={primary}
                color={color}
                now={now}
                pace={primaryPace}
                label={`${label} ${primary.label} remaining`}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipPopup side="top">
          {session ? (
            <span className="block">
              {session.label}: {session.remainingPercent}% left
              {sessionResetsIn ? (
                <span className="text-muted-foreground"> · resets in {sessionResetsIn}</span>
              ) : null}
            </span>
          ) : null}
          {weekly ? (
            <span className="block">
              {weekly.label}: {weekly.remainingPercent}% left
              {weeklyResetsIn ? (
                <span className="text-muted-foreground"> · resets in {weeklyResetsIn}</span>
              ) : null}
            </span>
          ) : null}
          {!session && !weekly && fallback ? (
            <span className="block">
              {fallback.label}: {fallback.remainingPercent}% left
              {timeUntilReset(fallback, now) ? (
                <span className="text-muted-foreground">
                  {" "}
                  · resets in {timeUntilReset(fallback, now)}
                </span>
              ) : null}
            </span>
          ) : null}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function ThreadUsageCardView({
  pools,
  now,
  refreshing,
  onRefresh: refresh,
  compact,
  onToggleCompact,
}: {
  pools: readonly LimitPool[];
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  compact: boolean;
  onToggleCompact: () => void;
}) {
  return (
    <div
      className={cn(
        THREAD_DETAILS_CARD_SURFACE_CLASS,
        "grid max-h-[min(var(--thread-usage-available-height,100dvh),calc(100dvh-6.5rem),calc(var(--available-height,100dvh)-1rem))] grid-rows-[minmax(0,1fr)]",
      )}
      data-thread-usage-card
    >
      <ScrollArea scrollFade className="min-h-0">
        <ThreadDetailsSection
          headingId="thread-usage-limits-heading"
          title="Usage limits"
          separated={false}
          actions={
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={
                        compact ? "Show detailed usage limits" : "Show compact usage limits"
                      }
                      aria-pressed={compact}
                      onClick={onToggleCompact}
                    >
                      {compact ? (
                        <Maximize2Icon className="size-3.5" />
                      ) : (
                        <Minimize2Icon className="size-3.5" />
                      )}
                    </Button>
                  }
                />
                <TooltipPopup side="top">
                  {compact ? "Show detailed usage limits" : "Show compact usage limits"}
                </TooltipPopup>
              </Tooltip>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Refresh limits"
                aria-busy={refreshing}
                disabled={refreshing}
                onClick={refresh}
              >
                <RefreshIcon size="sm" refreshing={refreshing} />
              </Button>
            </>
          }
        >
          {pools.length === 0 ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No connected provider reports subscription limits.
            </p>
          ) : (
            <div className="flex flex-col">
              {pools.map((pool) =>
                compact ? (
                  <CompactProviderLimits key={pool.driver} pool={pool} now={now} />
                ) : (
                  <ProviderLimits key={pool.driver} pool={pool} now={now} />
                ),
              )}
            </div>
          )}
        </ThreadDetailsSection>
      </ScrollArea>
    </div>
  );
}
