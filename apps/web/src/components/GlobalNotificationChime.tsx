import { useEffect, useEffectEvent, useRef } from "react";
import { useSettings } from "../hooks/useSettings";
import {
  buildThreadNotificationChimeSnapshotMap,
  playNotificationChime,
  shouldPlayNotificationChime,
  type ThreadNotificationChimeSnapshot,
} from "../notificationChime";
import { useShallow } from "zustand/react/shallow";
import { selectThreadsAcrossEnvironments, useStore } from "../store";
import { useMessageQueueStore } from "../messageQueueStore";

export function GlobalNotificationChime() {
  const threads = useStore(useShallow(selectThreadsAcrossEnvironments));
  const sendWhenDoneEntriesByThreadId = useMessageQueueStore(
    (state) => state.sendWhenDoneMessagesByThreadId,
  );
  const settings = useSettings();
  const previousSnapshotsRef = useRef<ReadonlyMap<string, ThreadNotificationChimeSnapshot> | null>(
    null,
  );

  const triggerChime = useEffectEvent((outputDeviceId: string) => {
    void playNotificationChime(outputDeviceId).catch(() => undefined);
  });

  useEffect(() => {
    const nextSnapshots = buildThreadNotificationChimeSnapshotMap(threads);
    const previousSnapshots = previousSnapshotsRef.current;
    previousSnapshotsRef.current = nextSnapshots;

    if (!settings.agentChimeEnabled || previousSnapshots === null) {
      return;
    }
    if (
      !shouldPlayNotificationChime({
        previous: previousSnapshots,
        next: nextSnapshots,
        playChimeWithSendWhenDone: settings.agentChimeWithSendWhenDone,
        sendWhenDoneEntriesByThreadId,
      })
    ) {
      return;
    }

    triggerChime(settings.agentChimeOutputDeviceId);
  }, [
    sendWhenDoneEntriesByThreadId,
    settings.agentChimeEnabled,
    settings.agentChimeOutputDeviceId,
    settings.agentChimeWithSendWhenDone,
    threads,
  ]);

  return null;
}
