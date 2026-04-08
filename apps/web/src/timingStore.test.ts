import { describe, expect, it } from "vitest";

import { mergePersistedThreadStateMap, normalizeTimingNumber } from "./timingStore";

describe("timingStore", () => {
  it("normalizes non-negative finite numbers", () => {
    expect(normalizeTimingNumber(0)).toBe(0);
    expect(normalizeTimingNumber(42)).toBe(42);
    expect(normalizeTimingNumber(-1)).toBeNull();
    expect(normalizeTimingNumber(Number.NaN)).toBeNull();
    expect(normalizeTimingNumber("42")).toBeNull();
  });

  it("merges persisted and current thread ids before delegating entry logic", () => {
    const merged = mergePersistedThreadStateMap({
      persistedState: {
        threadStates: {
          persisted: { value: 2 },
        },
      },
      currentState: {
        threadStates: {
          current: { value: 3 },
        },
      },
      normalizeEntry: (value) => {
        if (typeof value !== "object" || value === null) {
          return null;
        }
        const maybeValue = (value as { value?: unknown }).value;
        return typeof maybeValue === "number" ? { value: maybeValue } : null;
      },
      mergeEntry: (persisted, current) => {
        if (!persisted && !current) {
          return null;
        }
        return {
          value: (persisted?.value ?? 0) + (current?.value ?? 0),
        };
      },
    });

    expect(merged).toEqual({
      threadStates: {
        persisted: { value: 2 },
        current: { value: 3 },
      },
    });
  });
});
