import { ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeLiveMs, useTypingTimeStore } from "./typingTimeStore";

describe("typingTimeStore", () => {
  const threadId = ThreadId.makeUnsafe("thread-typing-a");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
    useTypingTimeStore.setState({
      threadStates: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops an active typing session at the send time", () => {
    const store = useTypingTimeStore.getState();

    store.recordTyping(threadId);
    vi.advanceTimersByTime(5_000);
    store.recordTyping(threadId);
    vi.advanceTimersByTime(10_000);
    store.stopTyping(threadId);

    expect(useTypingTimeStore.getState().threadStates[threadId]).toEqual({
      totalMs: 15_000,
      sessionStart: null,
      lastActivity: null,
    });
  });

  it("keeps the accrued typing time after an explicit stop", () => {
    const store = useTypingTimeStore.getState();

    store.recordTyping(threadId);
    vi.advanceTimersByTime(3_000);
    store.stopTyping(threadId);
    vi.advanceTimersByTime(10_000);

    const state = useTypingTimeStore.getState().threadStates[threadId];
    expect(state).toBeDefined();
    expect(computeLiveMs(state!, Date.now())).toBe(3_000);
  });

  it("preserves a live in-memory typing session during hydration merge", () => {
    useTypingTimeStore.setState({
      threadStates: {
        [threadId]: {
          totalMs: 2_000,
          sessionStart: 30_000,
          lastActivity: 31_000,
        },
      },
    });

    const persistApi = useTypingTimeStore.persist as unknown as {
      getOptions: () => {
        merge: (
          persistedState: unknown,
          currentState: ReturnType<typeof useTypingTimeStore.getState>,
        ) => ReturnType<typeof useTypingTimeStore.getState>;
      };
    };
    const mergedState = persistApi.getOptions().merge(
      {
        threadStates: {
          [threadId]: {
            totalMs: 8_000,
            sessionStart: 10_000,
            lastActivity: 11_000,
          },
        },
      },
      useTypingTimeStore.getState(),
    );

    expect(mergedState.threadStates[threadId]).toEqual({
      totalMs: 10_000,
      sessionStart: 30_000,
      lastActivity: 31_000,
    });
  });

  it("restores a persisted active typing session when current state is blank", () => {
    const persistApi = useTypingTimeStore.persist as unknown as {
      getOptions: () => {
        merge: (
          persistedState: unknown,
          currentState: ReturnType<typeof useTypingTimeStore.getState>,
        ) => ReturnType<typeof useTypingTimeStore.getState>;
      };
    };
    const mergedState = persistApi.getOptions().merge(
      {
        threadStates: {
          [threadId]: {
            totalMs: 8_000,
            sessionStart: 10_000,
            lastActivity: 11_000,
          },
        },
      },
      useTypingTimeStore.getInitialState(),
    );

    expect(mergedState.threadStates[threadId]).toEqual({
      totalMs: 8_000,
      sessionStart: 10_000,
      lastActivity: 11_000,
    });
  });

  it("ignores malformed persisted typing timing entries during hydration merge", () => {
    const persistApi = useTypingTimeStore.persist as unknown as {
      getOptions: () => {
        merge: (
          persistedState: unknown,
          currentState: ReturnType<typeof useTypingTimeStore.getState>,
        ) => ReturnType<typeof useTypingTimeStore.getState>;
      };
    };
    const mergedState = persistApi.getOptions().merge(
      {
        threadStates: {
          bad: {
            totalMs: "oops",
            sessionStart: {},
            lastActivity: [],
          },
        },
      },
      useTypingTimeStore.getInitialState(),
    );

    expect(mergedState.threadStates.bad).toBeUndefined();
  });
});
