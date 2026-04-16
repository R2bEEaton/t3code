import {
  EnvironmentId,
  EventId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import {
  buildThreadNotificationChimeSnapshotMap,
  deriveAudioOutputDeviceOptions,
  shouldPlayNotificationChime,
} from "./notificationChime";
import { type QueuedSendWhenDoneEntry } from "./messageQueueStore";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Thread } from "./types";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  const base: Thread = {
    id: ThreadId.make("thread-1"),
    environmentId: EnvironmentId.make("environment-1"),
    codexThreadId: null,
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: {
      provider: "codex",
      model: "gpt-5-codex",
    },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-04-08T00:00:00.000Z",
    archivedAt: null,
    latestTurn: null,
    branch: null,
    worktreePath: null,
  };
  return { ...base, ...overrides };
}

function makeActivity(overrides: {
  id: string;
  createdAt?: string;
  kind: string;
  payload?: Record<string, unknown>;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(overrides.id),
    createdAt: overrides.createdAt ?? "2026-04-08T00:00:00.000Z",
    kind: overrides.kind,
    summary: "activity",
    tone: "info",
    payload: overrides.payload ?? {},
    turnId: null,
  };
}

function shouldPlay(input: {
  previous: ReadonlyMap<
    string,
    ReturnType<typeof buildThreadNotificationChimeSnapshotMap> extends ReadonlyMap<string, infer T>
      ? T
      : never
  >;
  next: ReadonlyMap<
    string,
    ReturnType<typeof buildThreadNotificationChimeSnapshotMap> extends ReadonlyMap<string, infer T>
      ? T
      : never
  >;
  playChimeWithSendWhenDone?: boolean;
  sendWhenDoneEntriesByThreadId?: Readonly<Record<string, readonly QueuedSendWhenDoneEntry[]>>;
}) {
  return shouldPlayNotificationChime({
    previous: input.previous,
    next: input.next,
    playChimeWithSendWhenDone: input.playChimeWithSendWhenDone ?? true,
    sendWhenDoneEntriesByThreadId: input.sendWhenDoneEntriesByThreadId ?? {},
  });
}

describe("thread notification chime transitions", () => {
  it("plays when an existing thread transitions into a settled completed turn", () => {
    const previous = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "running",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: null,
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: TurnId.make("turn-1"),
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:01.000Z",
        },
      }),
    ]);
    const next = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: "2026-04-08T00:00:05.000Z",
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "ready",
          orchestrationStatus: "ready",
          activeTurnId: undefined,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:05.000Z",
        },
      }),
    ]);

    expect(shouldPlay({ previous, next })).toBe(true);
  });

  it("does not play for completed turns that arrive during the first snapshot bootstrap", () => {
    const previous = buildThreadNotificationChimeSnapshotMap([]);
    const next = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: "2026-04-08T00:00:05.000Z",
          assistantMessageId: null,
        },
      }),
    ]);

    expect(shouldPlay({ previous, next })).toBe(false);
  });

  it("plays when a thread begins waiting for structured user input", () => {
    const previous = buildThreadNotificationChimeSnapshotMap([makeThread()]);
    const next = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        activities: [
          makeActivity({
            id: "user-input-open",
            kind: "user-input.requested",
            payload: {
              requestId: "req-user-input-1",
              questions: [
                {
                  id: "mode",
                  header: "Mode",
                  question: "Which mode should be used?",
                  options: [
                    {
                      label: "workspace-write",
                      description: "Allow workspace writes only",
                    },
                  ],
                },
              ],
            },
          }),
        ],
      }),
    ]);

    expect(shouldPlay({ previous, next })).toBe(true);
  });

  it("suppresses completion chimes when the next send-when-done entry is a text message and the setting is disabled", () => {
    const previous = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "running",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: null,
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: TurnId.make("turn-1"),
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:01.000Z",
        },
      }),
    ]);
    const next = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: "2026-04-08T00:00:05.000Z",
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "ready",
          orchestrationStatus: "ready",
          activeTurnId: undefined,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:05.000Z",
        },
      }),
    ]);

    expect(
      shouldPlay({
        previous,
        next,
        playChimeWithSendWhenDone: false,
        sendWhenDoneEntriesByThreadId: {
          "thread-1": [
            {
              id: "queued-message-1",
              type: "message",
              text: "follow up",
              createdAt: "2026-04-08T00:00:05.500Z",
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("still plays completion chimes when the setting is enabled even if a text send-when-done entry is queued next", () => {
    const previous = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "running",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: null,
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: TurnId.make("turn-1"),
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:01.000Z",
        },
      }),
    ]);
    const next = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: "2026-04-08T00:00:05.000Z",
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "ready",
          orchestrationStatus: "ready",
          activeTurnId: undefined,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:05.000Z",
        },
      }),
    ]);

    expect(
      shouldPlay({
        previous,
        next,
        playChimeWithSendWhenDone: true,
        sendWhenDoneEntriesByThreadId: {
          "thread-1": [
            {
              id: "queued-message-1",
              type: "message",
              text: "follow up",
              createdAt: "2026-04-08T00:00:05.500Z",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("still plays completion chimes when the next send-when-done entry is a project script", () => {
    const previous = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "running",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: null,
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: TurnId.make("turn-1"),
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:01.000Z",
        },
      }),
    ]);
    const next = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: "2026-04-08T00:00:05.000Z",
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "ready",
          orchestrationStatus: "ready",
          activeTurnId: undefined,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:05.000Z",
        },
      }),
    ]);

    expect(
      shouldPlay({
        previous,
        next,
        playChimeWithSendWhenDone: false,
        sendWhenDoneEntriesByThreadId: {
          "thread-1": [
            {
              id: "queued-script-1",
              type: "project-script",
              createdAt: "2026-04-08T00:00:05.500Z",
              scriptId: "build",
              scriptName: "Build",
              scriptCommand: "bun run build",
              scriptIcon: "build",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("ignores stale completed turns while the session still reports running", () => {
    const snapshot = buildThreadNotificationChimeSnapshotMap([
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-08T00:00:00.000Z",
          startedAt: "2026-04-08T00:00:01.000Z",
          completedAt: "2026-04-08T00:00:05.000Z",
          assistantMessageId: null,
        },
        session: {
          provider: "codex",
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: TurnId.make("turn-2"),
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:05.000Z",
        },
      }),
    ]);

    expect(snapshot.get("thread-1")).toEqual({
      completedTurnId: null,
      pendingUserInputRequestId: null,
    });
  });
});

describe("deriveAudioOutputDeviceOptions", () => {
  it("includes the system default option and synthesizes fallback labels", () => {
    expect(
      deriveAudioOutputDeviceOptions(
        [
          { deviceId: "speaker-usb", kind: "audiooutput", label: "USB Speakers" },
          { deviceId: "speaker-blank", kind: "audiooutput", label: "" },
        ],
        "",
      ),
    ).toEqual([
      {
        deviceId: "",
        label: "System default",
        available: true,
      },
      {
        deviceId: "speaker-usb",
        label: "USB Speakers",
        available: true,
      },
      {
        deviceId: "speaker-blank",
        label: "Audio output 2",
        available: true,
      },
    ]);
  });

  it("keeps an unavailable selected device visible so the setting can be changed back", () => {
    const options = deriveAudioOutputDeviceOptions([], "missing-device");

    expect(options).toContainEqual({
      deviceId: "missing-device",
      label: "Previously selected device (unavailable)",
      available: false,
    });
  });
});
