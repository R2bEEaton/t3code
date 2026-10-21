import {
  displayLimitWindows,
  formatDuration,
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
            ↻ {resetsIn}
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
  const primary = leastRemaining(sessions) ?? weekly ?? leastRemaining(windows);
  if (!primary) return null;
  const marker = weekly !== primary ? weekly : undefined;
  const label = providerClients.get(pool.driver)?.label ?? String(pool.driver);
  const summary = `${primary.label}: ${primary.remainingPercent}% left${marker ? ` · ${marker.label}: ${marker.remainingPercent}% left` : ""}`;
  const primaryResetsIn = timeUntilReset(primary, now);
  return (
    <div className="px-1.5 pb-2 last:pb-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              tabIndex={0}
              aria-label={`${label}: ${summary}`}
              className="relative h-7 rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              data-usage-compact-provider
            />
          }
        >
          <div
            role="meter"
            aria-label={`${label} ${primary.label} remaining`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={primary.remainingPercent}
            className="absolute inset-0 overflow-hidden rounded-full"
          >
            <div
              className="h-full opacity-35"
              style={{
                width: `${primary.remainingPercent}%`,
                backgroundColor: barColor(pool.driver),
              }}
              data-usage-session-fill
            />
          </div>
          <div className="pointer-events-none relative flex h-full min-w-0 items-center gap-2 px-2.5 text-xs font-medium">
            <ProviderInstanceIcon
              driverKind={pool.driver}
              displayName={label}
              indicatorBackground="var(--popover)"
              className="size-3.5 shrink-0"
              iconClassName="size-3.5 text-foreground/80"
            />
            <span className="truncate">{label}</span>
            {primaryResetsIn ? (
              <span
                className="ms-auto shrink-0 text-2xs font-normal text-muted-foreground tabular-nums"
                data-usage-compact-reset
              >
                ↻ {primaryResetsIn}
              </span>
            ) : null}
          </div>
          {marker ? (
            <span
              role="meter"
              aria-label={`${label} ${marker.label} remaining`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={marker.remainingPercent}
              className="pointer-events-none absolute top-0 -translate-x-1/2 text-foreground"
              style={{ left: `clamp(5px, ${marker.remainingPercent}%, calc(100% - 5px))` }}
              data-usage-weekly-marker
            >
              <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor" aria-hidden>
                <path d="M0 0H10L5 6Z" />
              </svg>
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="top">
          {[primary, marker].map((window) => {
            if (!window) return null;
            const resetsIn = timeUntilReset(window, now);
            return (
              <span key={window.id} className="block">
                {window.label}: {window.remainingPercent}% left
                {resetsIn ? (
                  <span className="text-muted-foreground"> · resets in {resetsIn}</span>
                ) : null}
              </span>
            );
          })}
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
