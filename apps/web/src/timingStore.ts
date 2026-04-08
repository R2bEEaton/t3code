interface PersistedThreadStateMap<TState> {
  threadStates: Record<string, TState>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function normalizeTimingNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function mergePersistedThreadStateMap<TState>(input: {
  persistedState: unknown;
  currentState: PersistedThreadStateMap<TState>;
  normalizeEntry: (value: unknown) => TState | null;
  mergeEntry: (persisted: TState | null, current: TState | null) => TState | null;
}): PersistedThreadStateMap<TState> {
  const persistedRecord = asRecord(input.persistedState);
  const persistedThreadStates = asRecord(persistedRecord?.threadStates);
  const mergedThreadStates: Record<string, TState> = {};
  const threadIds = new Set<string>([
    ...Object.keys(input.currentState.threadStates),
    ...(persistedThreadStates ? Object.keys(persistedThreadStates) : []),
  ]);

  for (const threadId of threadIds) {
    const persisted = input.normalizeEntry(persistedThreadStates?.[threadId]);
    const current = input.currentState.threadStates[threadId] ?? null;
    const merged = input.mergeEntry(persisted, current);
    if (merged !== null) {
      mergedThreadStates[threadId] = merged;
    }
  }

  return {
    threadStates: mergedThreadStates,
  };
}
