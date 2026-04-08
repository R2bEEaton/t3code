import { type ThreadId } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mergePersistedThreadStateMap, normalizeTimingNumber } from "./timingStore";

export const WAIT_TIME_STORAGE_KEY = "t3code:wait-time:v1";

const POLL_INTERVAL_MS = 1_000;

interface WaitThreadState {
  totalMs: number;
  sessionStart: number | null;
}

interface WaitTimeStoreState {
  threadStates: Record<string, WaitThreadState>;
  startWaiting: (threadId: ThreadId, startedAtMs?: number) => void;
  stopWaiting: (threadId: ThreadId) => void;
}

function getThreadState(
  states: Record<string, WaitThreadState>,
  threadId: string,
): WaitThreadState {
  return states[threadId] ?? { totalMs: 0, sessionStart: null };
}

function normalizeWaitThreadState(value: unknown): WaitThreadState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as { totalMs?: unknown; sessionStart?: unknown };
  const totalMs = normalizeTimingNumber(record.totalMs);
  const sessionStart =
    record.sessionStart === null ? null : normalizeTimingNumber(record.sessionStart);
  if (totalMs === null || sessionStart === undefined) {
    return null;
  }
  return { totalMs, sessionStart };
}

function mergeWaitThreadState(
  persisted: WaitThreadState | null,
  current: WaitThreadState | null,
): WaitThreadState | null {
  if (!persisted && !current) {
    return null;
  }
  return {
    totalMs: (persisted?.totalMs ?? 0) + (current?.totalMs ?? 0),
    sessionStart: current?.sessionStart ?? persisted?.sessionStart ?? null,
  };
}

function resolveWaitSessionStart(now: number, startedAtMs?: number): number {
  return typeof startedAtMs === "number" && Number.isFinite(startedAtMs) && startedAtMs <= now
    ? startedAtMs
    : now;
}

export function computeLiveWaitMs(state: WaitThreadState, now: number): number {
  if (state.sessionStart === null) {
    return state.totalMs;
  }
  return state.totalMs + Math.max(0, now - state.sessionStart);
}

const waitTimeStorage =
  typeof localStorage !== "undefined"
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }));

export const useWaitTimeStore = create<WaitTimeStoreState>()(
  persist(
    (set) => ({
      threadStates: {},
      startWaiting: (threadId: ThreadId, startedAtMs?: number) => {
        const now = Date.now();
        const sessionStart = resolveWaitSessionStart(now, startedAtMs);
        set((state) => {
          const previous = getThreadState(state.threadStates, threadId);
          if (previous.sessionStart !== null) {
            if (sessionStart >= previous.sessionStart) {
              return state;
            }
            return {
              threadStates: {
                ...state.threadStates,
                [threadId]: {
                  ...previous,
                  sessionStart,
                },
              },
            };
          }
          return {
            threadStates: {
              ...state.threadStates,
              [threadId]: {
                ...previous,
                sessionStart,
              },
            },
          };
        });
      },
      stopWaiting: (threadId: ThreadId) => {
        const now = Date.now();
        set((state) => {
          const previous = getThreadState(state.threadStates, threadId);
          if (previous.sessionStart === null) {
            return state;
          }
          return {
            threadStates: {
              ...state.threadStates,
              [threadId]: {
                totalMs: previous.totalMs + Math.max(0, now - previous.sessionStart),
                sessionStart: null,
              },
            },
          };
        });
      },
    }),
    {
      name: WAIT_TIME_STORAGE_KEY,
      storage: waitTimeStorage,
      partialize: (state) => ({ threadStates: state.threadStates }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...mergePersistedThreadStateMap({
          persistedState,
          currentState,
          normalizeEntry: normalizeWaitThreadState,
          mergeEntry: mergeWaitThreadState,
        }),
      }),
    },
  ),
);

export function useWaitTime(threadId: ThreadId | null): number {
  const [liveMs, setLiveMs] = useState(0);

  useEffect(() => {
    if (threadId === null) {
      setLiveMs(0);
      return;
    }

    const tick = () => {
      const state = useWaitTimeStore.getState().threadStates[threadId];
      if (!state) {
        setLiveMs(0);
        return;
      }
      setLiveMs(computeLiveWaitMs(state, Date.now()));
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [threadId]);

  return liveMs;
}

export function useWaitSessionStart(threadId: ThreadId | null): number | null {
  return useWaitTimeStore((state) => {
    if (threadId === null) {
      return null;
    }
    return state.threadStates[threadId]?.sessionStart ?? null;
  });
}
