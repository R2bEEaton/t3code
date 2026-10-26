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
      memberDuration ??
      (window.kind === "session" ? 300 : window.kind === "weekly" ? 10080 : null);
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
  const resetsIn = timeUntilReset(window, now);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">{window.label}</span>
        {resetsIn ? (
          <span className="shrink-0 text-2xs text-muted-foreground/70 tabular-nums">
            ⟳ {resetsIn}
          </span>
        ) : null}
        <span className="ms-auto flex shrink-0 items-center gap-1.5 font-medium text-foreground tabular-nums">
          {window.pace ? <PaceIcon pace={window.pace} /> : null}
          {window.remainingPercent}%
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${window.label}: ${window.remainingPercent}% left`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={window.remainingPercent}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${window.remainingPercent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function ProviderLimits({ pool, now }: { readonly pool: LimitPool; readonly now: number }) {
  const label = providerClients.get(pool.driver)?.label ?? String(pool.driver);
  const color = barColor(pool.driver);
  return (
    <div className="flex flex-col gap-2 px-1.5 pb-2 last:pb-0">
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/80">
        <ProviderInstanceIcon
          driverKind={pool.driver}
          displayName={label}
          indicatorBackground="var(--popover)"
          className="size-4"
          iconClassName="size-3.5 text-foreground/80"
        />
        <span className="truncate">{label}</span>
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

  const isUsedUp =
    (session && session.remainingPercent === 0) ||
    (weekly && weekly.remainingPercent === 0) ||
    (!session && !weekly && fallback && fallback.remainingPercent === 0);

  const usedUpWindow =
    (session && session.remainingPercent === 0 ? session : null) ??
    (weekly && weekly.remainingPercent === 0 ? weekly : null) ??
    (fallback && fallback.remainingPercent === 0 ? fallback : null);

  const usedUpResetTime = isUsedUp && usedUpWindow ? timeUntilReset(usedUpWindow, now) : null;

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
    <div className="px-1.5 pb-2 last:pb-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              tabIndex={0}
              aria-label={`${label}: ${summary}`}
              className="relative flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <div className="relative flex-1 min-w-0" data-usage-compact-pill>
            <div className="relative flex h-7 flex-col overflow-hidden rounded-full bg-muted">
              {hasBoth ? (
                <>
                  <div
                    role="meter"
                    aria-label={`${label} ${session!.label} remaining`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={session!.remainingPercent}
                    className="relative h-1/2 w-full overflow-hidden border-b border-background/25"
                  >
                    <div className="absolute inset-0" style={sessionPace?.gap}>
                      <div
                        className="h-full opacity-40"
                        style={{
                          width: `${session!.remainingPercent}%`,
                          backgroundColor: color,
                        }}
                        data-usage-session-fill
                      />
                    </div>
                    {sessionPace ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                        style={sessionPace.tick}
                        data-usage-session-pace
                      />
                    ) : null}
                  </div>
                  <div
                    role="meter"
                    aria-label={`${label} ${weekly!.label} remaining`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={weekly!.remainingPercent}
                    className="relative h-1/2 w-full overflow-hidden"
                  >
                    <div className="absolute inset-0" style={weeklyPace?.gap}>
                      <div
                        className="h-full opacity-40"
                        style={{
                          width: `${weekly!.remainingPercent}%`,
                          backgroundColor: color,
                        }}
                        data-usage-weekly-fill
                      />
                    </div>
                    {weeklyPace ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                        style={weeklyPace.tick}
                        data-usage-weekly-pace
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <div
                  role="meter"
                  aria-label={`${label} ${primary.label} remaining`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={primary.remainingPercent}
                  className="relative h-full w-full overflow-hidden"
                >
                  <div className="absolute inset-0" style={primaryPace?.gap}>
                    <div
                      className="h-full opacity-40"
                      style={{
                        width: `${primary.remainingPercent}%`,
                        backgroundColor: color,
                      }}
                      data-usage-session-fill={primary.kind === "session" ? "" : undefined}
                      data-usage-weekly-fill={primary.kind === "weekly" ? "" : undefined}
                    />
                  </div>
                  {primaryPace ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                      style={primaryPace.tick}
                      data-usage-session-pace={primary.kind === "session" ? "" : undefined}
                      data-usage-weekly-pace={primary.kind === "weekly" ? "" : undefined}
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
          {usedUpResetTime ? (
            <span
              className="shrink-0 text-2xs font-normal text-muted-foreground tabular-nums"
              data-usage-compact-reset
            >
              ⟳ {usedUpResetTime}
            </span>
          ) : null}
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
                <span className="text-muted-foreground"> · resets in {timeUntilReset(fallback, now)}</span>
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
