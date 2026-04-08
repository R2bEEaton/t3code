import { ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeLiveWaitMs, useWaitTimeStore } from "./waitTimeStore";

describe("waitTimeStore", () => {
  const threadId = ThreadId.makeUnsafe("thread-wait-a");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
    useWaitTimeStore.setState({
      threadStates: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts and stops a wait session", () => {
    const store = useWaitTimeStore.getState();

    store.startWaiting(threadId);
    vi.advanceTimersByTime(5_000);
    store.stopWaiting(threadId);

    expect(useWaitTimeStore.getState().threadStates[threadId]).toEqual({
      totalMs: 5_000,
      sessionStart: null,
    });
  });

  it("does not restart an already active wait session", () => {
    const store = useWaitTimeStore.getState();

    store.startWaiting(threadId);
    vi.advanceTimersByTime(2_000);
    store.startWaiting(threadId);
    vi.advanceTimersByTime(3_000);
    store.stopWaiting(threadId);

    expect(useWaitTimeStore.getState().threadStates[threadId]?.totalMs).toBe(5_000);
  });

  it("computes live wait time for an active session", () => {
    storeStart(threadId);
    vi.advanceTimersByTime(7_000);

    const state = useWaitTimeStore.getState().threadStates[threadId];
    expect(state).toBeDefined();
    expect(computeLiveWaitMs(state!, Date.now())).toBe(7_000);
  });

  it("uses an inferred earlier start time and does not restart a newer active session", () => {
    const store = useWaitTimeStore.getState();

    vi.advanceTimersByTime(5_000);
    store.startWaiting(threadId, Date.now() - 4_000);
    vi.advanceTimersByTime(1_000);
    store.startWaiting(threadId, Date.now());
    store.stopWaiting(threadId);

    expect(useWaitTimeStore.getState().threadStates[threadId]).toEqual({
      totalMs: 5_000,
      sessionStart: null,
    });
  });

  it("preserves a live in-memory wait session during hydration merge", () => {
    const store = useWaitTimeStore.getState();
    vi.advanceTimersByTime(2_000);
    store.startWaiting(threadId);

    const persistApi = useWaitTimeStore.persist as unknown as {
      getOptions: () => {
        merge: (
          persistedState: unknown,
          currentState: ReturnType<typeof useWaitTimeStore.getState>,
        ) => ReturnType<typeof useWaitTimeStore.getState>;
      };
    };
    const mergedState = persistApi.getOptions().merge(
      {
        threadStates: {
          [threadId]: {
            totalMs: 10_000,
            sessionStart: null,
          },
        },
      },
      useWaitTimeStore.getState(),
    );

    expect(mergedState.threadStates[threadId]).toEqual({
      totalMs: 10_000,
      sessionStart: Date.parse("2026-04-01T12:00:02.000Z"),
    });
  });

  it("preserves persisted totals while keeping a live current wait session", () => {
    useWaitTimeStore.setState({
      threadStates: {
        [threadId]: {
          totalMs: 2_000,
          sessionStart: 30_000,
        },
      },
    });

    const persistApi = useWaitTimeStore.persist as unknown as {
      getOptions: () => {
        merge: (
          persistedState: unknown,
          currentState: ReturnType<typeof useWaitTimeStore.getState>,
        ) => ReturnType<typeof useWaitTimeStore.getState>;
      };
    };
    const mergedState = persistApi.getOptions().merge(
      {
        threadStates: {
          [threadId]: {
            totalMs: 8_000,
            sessionStart: 10_000,
          },
        },
      },
      useWaitTimeStore.getState(),
    );

    expect(mergedState.threadStates[threadId]).toEqual({
      totalMs: 10_000,
      sessionStart: 30_000,
    });
  });

  it("restores a persisted active wait session when current state is blank", () => {
    const persistApi = useWaitTimeStore.persist as unknown as {
      getOptions: () => {
        merge: (
          persistedState: unknown,
          currentState: ReturnType<typeof useWaitTimeStore.getState>,
        ) => ReturnType<typeof useWaitTimeStore.getState>;
      };
    };
    const mergedState = persistApi.getOptions().merge(
      {
        threadStates: {
          [threadId]: {
            totalMs: 8_000,
            sessionStart: 10_000,
          },
        },
      },
      useWaitTimeStore.getInitialState(),
    );

    expect(mergedState.threadStates[threadId]).toEqual({
      totalMs: 8_000,
      sessionStart: 10_000,
    });
  });

  it("ignores malformed persisted wait timing entries during hydration merge", () => {
    const persistApi = useWaitTimeStore.persist as unknown as {
      getOptions: () => {
        merge: (
          persistedState: unknown,
          currentState: ReturnType<typeof useWaitTimeStore.getState>,
        ) => ReturnType<typeof useWaitTimeStore.getState>;
      };
    };
    const mergedState = persistApi.getOptions().merge(
      {
        threadStates: {
          bad: {
            totalMs: "oops",
            sessionStart: {},
          },
        },
      },
      useWaitTimeStore.getInitialState(),
    );

    expect(mergedState.threadStates.bad).toBeUndefined();
  });
});

function storeStart(threadId: ThreadId) {
  useWaitTimeStore.getState().startWaiting(threadId);
}
