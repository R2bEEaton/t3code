import { useAtomValue } from "@effect/atom-react";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import { collectLimitAccounts, collectLimitPools } from "@t3tools/shared/usageLimits";
import { useEffect, useEffectEvent, useState } from "react";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ThreadUsageCardView } from "./ThreadUsageCardView";
import { useUsagePanelStore } from "../../usagePanelStore";
const CLOCK_TICK_MS = 60_000;

export function ThreadUsageCard() {
  const compact = useUsagePanelStore((state) => state.compact);
  const toggleCompact = useUsagePanelStore((state) => state.toggleCompact);
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const connections = useAtomValue(environmentPresentations.presentationsAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const [now, setNow] = useState(() => Date.now());
  // The card opens with its first refresh already in flight.
  const [refreshing, setRefreshing] = useState(true);
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);

  const runRefresh = (automatic: boolean) =>
    settlePromise(() =>
      Promise.all(
        Array.from(connections, ([environmentId, presentation]) => {
          if (presentation.connection.phase === "connected" && presentation.serverConfig !== null) {
            return refreshUsageLimits(
              environmentId,
              () => refreshProviders({ environmentId, input: {} }),
              automatic,
            );
          }
        }),
      ),
    ).then(() => {
      setNow(Date.now());
      setRefreshing(false);
    });
  const refresh = () => {
    setRefreshing(true);
    void runRefresh(false);
  };
  const autoRefresh = useEffectEvent(() => void runRefresh(true));
  useEffect(() => {
    autoRefresh();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <ThreadUsageCardView
      pools={pools}
      now={now}
      refreshing={refreshing}
      onRefresh={refresh}
      compact={compact}
      onToggleCompact={toggleCompact}
    />
  );
}
