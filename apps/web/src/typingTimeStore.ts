import { type ThreadId } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mergePersistedThreadStateMap, normalizeTimingNumber } from "./timingStore";

export const TYPING_TIME_STORAGE_KEY = "t3code:typing-time:v1";

/** How long (ms) of inactivity before the current session is considered ended. */
const COOLDOWN_MS = 60_000;

/** How often the live-display hook re-renders (ms). */
const POLL_INTERVAL_MS = 1_000;

// ---------------------------------------------------------------------------
// Per-thread persisted state
// ---------------------------------------------------------------------------

interface TypingThreadState {
  /** Accumulated ms across all completed sessions for this thread. */
  totalMs: number;
  /** Wall-clock ms when the current typing session began (null = no active session). */
  sessionStart: number | null;
  /** Wall-clock ms of the most recent typing event in the current session. */
  lastActivity: number | null;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface TypingTimeStoreState {
  threadStates: Record<string, TypingThreadState>;
  recordTyping: (threadId: ThreadId) => void;
  stopTyping: (threadId: ThreadId) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getThreadState(
  states: Record<string, TypingThreadState>,
  threadId: string,
): TypingThreadState {
  return states[threadId] ?? { totalMs: 0, sessionStart: null, lastActivity: null };
}

function normalizeTypingThreadState(value: unknown): TypingThreadState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as { totalMs?: unknown; sessionStart?: unknown; lastActivity?: unknown };
  const totalMs = normalizeTimingNumber(record.totalMs);
  const sessionStart =
    record.sessionStart === null ? null : normalizeTimingNumber(record.sessionStart);
  const lastActivity =
    record.lastActivity === null ? null : normalizeTimingNumber(record.lastActivity);
  if (totalMs === null || sessionStart === undefined || lastActivity === undefined) {
    return null;
  }
  return { totalMs, sessionStart, lastActivity };
}

function mergeTypingThreadState(
  persisted: TypingThreadState | null,
  current: TypingThreadState | null,
): TypingThreadState | null {
  if (!persisted && !current) {
    return null;
  }
  const activeSession =
    current !== null && (current.sessionStart !== null || current.lastActivity !== null)
      ? current
      : persisted;
  return {
    totalMs: (persisted?.totalMs ?? 0) + (current?.totalMs ?? 0),
    sessionStart: activeSession?.sessionStart ?? null,
    lastActivity: activeSession?.lastActivity ?? null,
  };
}

/**
 * Compute the live total ms for a thread, including any in-progress session.
 * Must be called with the current wall-clock time passed in so the result is
 * deterministic and can be called outside the store.
 */
export function computeLiveMs(state: TypingThreadState, now: number): number {
  const { totalMs, sessionStart, lastActivity } = state;
  if (sessionStart === null || lastActivity === null) {
    return totalMs;
  }
  // If the last activity was more than COOLDOWN_MS ago the session has
  // expired — freeze the total at the last keystroke, don't count the idle gap.
  if (now - lastActivity > COOLDOWN_MS) {
    return totalMs + Math.max(0, lastActivity - sessionStart);
  }
  return totalMs + (now - sessionStart);
}

// ---------------------------------------------------------------------------
// SSR-safe storage
// ---------------------------------------------------------------------------

const typingTimeStorage =
  typeof localStorage !== "undefined"
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }));

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTypingTimeStore = create<TypingTimeStoreState>()(
  persist(
    (set) => ({
      threadStates: {},

      recordTyping: (threadId: ThreadId) => {
        const now = Date.now();
        set((state) => {
          const prev = getThreadState(state.threadStates, threadId);

          // No active session — start one.
          if (prev.sessionStart === null || prev.lastActivity === null) {
            return {
              threadStates: {
                ...state.threadStates,
                [threadId]: {
                  totalMs: prev.totalMs,
                  sessionStart: now,
                  lastActivity: now,
                },
              },
            };
          }

          // Gap since last activity exceeded the cooldown — flush the old
          // session into totalMs and start a fresh one.
          if (now - prev.lastActivity > COOLDOWN_MS) {
            const sessionDuration = prev.lastActivity - prev.sessionStart;
            return {
              threadStates: {
                ...state.threadStates,
                [threadId]: {
                  totalMs: prev.totalMs + Math.max(0, sessionDuration),
                  sessionStart: now,
                  lastActivity: now,
                },
              },
            };
          }

          // Active session within the cooldown window — just advance lastActivity.
          return {
            threadStates: {
              ...state.threadStates,
              [threadId]: {
                ...prev,
                lastActivity: now,
              },
            },
          };
        });
      },
      stopTyping: (threadId: ThreadId) => {
        const now = Date.now();
        set((state) => {
          const prev = getThreadState(state.threadStates, threadId);
          if (prev.sessionStart === null || prev.lastActivity === null) {
            return state;
          }
          return {
            threadStates: {
              ...state.threadStates,
              [threadId]: {
                totalMs: prev.totalMs + Math.max(0, now - prev.sessionStart),
                sessionStart: null,
                lastActivity: null,
              },
            },
          };
        });
      },
    }),
    {
      name: TYPING_TIME_STORAGE_KEY,
      storage: typingTimeStorage,
      // Only persist the raw thread states — actions are not serializable.
      partialize: (state) => ({ threadStates: state.threadStates }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...mergePersistedThreadStateMap({
          persistedState,
          currentState,
          normalizeEntry: normalizeTypingThreadState,
          mergeEntry: mergeTypingThreadState,
        }),
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the live typing time in milliseconds for the given thread,
 * updating once per second. Returns 0 when threadId is null.
 */
export function useTypingTime(threadId: ThreadId | null): number {
  const [liveMs, setLiveMs] = useState<number>(0);

  useEffect(() => {
    if (threadId === null) {
      setLiveMs(0);
      return;
    }

    const tick = () => {
      const state = useTypingTimeStore.getState().threadStates[threadId];
      if (!state) {
        setLiveMs(0);
        return;
      }
      setLiveMs(computeLiveMs(state, Date.now()));
    };

    // Run immediately so there is no 1-second lag on mount.
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [threadId]);

  return liveMs;
}
