import { ThreadId, type ProjectScript, type ProjectScriptIcon } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { randomUUID } from "./lib/utils";

export const MESSAGE_QUEUE_STORAGE_KEY = "t3code:message-queue:v1";

export interface QueuedMessage {
  id: string;
  type: "message";
  text: string;
  createdAt: string;
}

export interface QueuedProjectScript {
  id: string;
  type: "project-script";
  createdAt: string;
  scriptId: string;
  scriptName: string;
  scriptCommand: string;
  scriptIcon: ProjectScriptIcon;
}

export type QueuedSendWhenDoneEntry = QueuedMessage | QueuedProjectScript;

type ThreadMessageQueueMap = Record<ThreadId, QueuedMessage[]>;
type ThreadSendWhenDoneQueueMap = Record<ThreadId, QueuedSendWhenDoneEntry[]>;

interface PersistedMessageQueueState {
  queuedMessagesByThreadId: ThreadMessageQueueMap;
  sendWhenDoneMessagesByThreadId: ThreadSendWhenDoneQueueMap;
}

interface MessageQueueStoreState extends PersistedMessageQueueState {
  enqueueMessage: (threadId: ThreadId, text: string) => QueuedMessage | null;
  enqueueSendWhenDoneMessage: (threadId: ThreadId, text: string) => QueuedMessage | null;
  enqueueSendWhenDoneProjectScript: (
    threadId: ThreadId,
    script: ProjectScript,
  ) => QueuedProjectScript | null;
  removeMessage: (threadId: ThreadId, messageId: string) => void;
  removeSendWhenDoneMessage: (threadId: ThreadId, messageId: string) => void;
  moveQueuedMessageToSendWhenDone: (threadId: ThreadId, messageId: string) => void;
  moveSendWhenDoneMessageToQueue: (threadId: ThreadId, messageId: string) => void;
  consumeNextSendWhenDoneMessage: (threadId: ThreadId) => QueuedSendWhenDoneEntry | null;
  restoreSendWhenDoneMessage: (threadId: ThreadId, message: QueuedSendWhenDoneEntry) => void;
  reorderSendWhenDoneMessages: (
    threadId: ThreadId,
    activeMessageId: string,
    overMessageId: string,
  ) => void;
  clearThreadQueue: (threadId: ThreadId) => void;
}

const EMPTY_QUEUE: readonly QueuedMessage[] = Object.freeze([]);
const EMPTY_SEND_WHEN_DONE_QUEUE: readonly QueuedSendWhenDoneEntry[] = Object.freeze([]);
const EMPTY_PERSISTED_STATE: PersistedMessageQueueState = {
  queuedMessagesByThreadId: {},
  sendWhenDoneMessagesByThreadId: {},
};
const PROJECT_SCRIPT_ICONS: ReadonlySet<ProjectScriptIcon> = new Set([
  "play",
  "test",
  "lint",
  "configure",
  "build",
  "debug",
]);

function normalizeQueuedMessage(value: unknown): QueuedMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const id = candidate.id;
  const text = candidate.text;
  const createdAt = candidate.createdAt;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof text !== "string" ||
    text.trim().length === 0 ||
    typeof createdAt !== "string" ||
    createdAt.length === 0
  ) {
    return null;
  }
  return {
    id,
    type: "message",
    text: text.trim(),
    createdAt,
  };
}

function normalizeQueuedProjectScript(value: unknown): QueuedProjectScript | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "project-script") {
    return null;
  }
  const id = candidate.id;
  const createdAt = candidate.createdAt;
  const scriptId = candidate.scriptId;
  const scriptName = candidate.scriptName;
  const scriptCommand = candidate.scriptCommand;
  const scriptIcon = candidate.scriptIcon;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof scriptId !== "string" ||
    scriptId.length === 0 ||
    typeof scriptName !== "string" ||
    scriptName.trim().length === 0 ||
    typeof scriptCommand !== "string" ||
    scriptCommand.trim().length === 0 ||
    typeof scriptIcon !== "string" ||
    !PROJECT_SCRIPT_ICONS.has(scriptIcon as ProjectScriptIcon)
  ) {
    return null;
  }
  return {
    id,
    type: "project-script",
    createdAt,
    scriptId,
    scriptName: scriptName.trim(),
    scriptCommand: scriptCommand.trim(),
    scriptIcon: scriptIcon as ProjectScriptIcon,
  };
}

function normalizeThreadMessageQueueMap<T extends { id: string }>(
  value: unknown,
  normalizeEntry: (entry: unknown) => T | null,
): Record<ThreadId, T[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalizedQueues: Record<ThreadId, T[]> = {};
  for (const [threadId, rawQueue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof threadId !== "string" || threadId.length === 0 || !Array.isArray(rawQueue)) {
      continue;
    }
    const normalizedQueue = rawQueue.flatMap((entry) => {
      const normalized = normalizeEntry(entry);
      return normalized ? [normalized] : [];
    });
    if (normalizedQueue.length > 0) {
      normalizedQueues[threadId as ThreadId] = normalizedQueue;
    }
  }
  return normalizedQueues;
}

function normalizePersistedMessageQueueState(value: unknown): PersistedMessageQueueState {
  if (!value || typeof value !== "object") {
    return EMPTY_PERSISTED_STATE;
  }
  const candidate = value as Record<string, unknown>;
  const rawQueuedMessagesByThreadId =
    "queuedMessagesByThreadId" in candidate ? candidate.queuedMessagesByThreadId : value;
  const rawSendWhenDoneMessagesByThreadId =
    "sendWhenDoneMessagesByThreadId" in candidate ? candidate.sendWhenDoneMessagesByThreadId : {};

  return {
    queuedMessagesByThreadId: normalizeThreadMessageQueueMap(
      rawQueuedMessagesByThreadId,
      normalizeQueuedMessage,
    ),
    sendWhenDoneMessagesByThreadId: normalizeThreadMessageQueueMap(
      rawSendWhenDoneMessagesByThreadId,
      (entry) => normalizeQueuedProjectScript(entry) ?? normalizeQueuedMessage(entry),
    ),
  };
}

function setThreadQueue<T extends { id: string }>(
  queuesByThreadId: Record<ThreadId, T[]>,
  threadId: ThreadId,
  nextQueue: ReadonlyArray<T>,
): Record<ThreadId, T[]> {
  const nextQueuesByThreadId = { ...queuesByThreadId };
  if (nextQueue.length === 0) {
    delete nextQueuesByThreadId[threadId];
  } else {
    nextQueuesByThreadId[threadId] = [...nextQueue];
  }
  return nextQueuesByThreadId;
}

function appendThreadQueueMessage<T extends { id: string }>(
  queuesByThreadId: Record<ThreadId, T[]>,
  threadId: ThreadId,
  message: T,
): Record<ThreadId, T[]> {
  return setThreadQueue(queuesByThreadId, threadId, [
    ...(queuesByThreadId[threadId] ?? []),
    message,
  ]);
}

function prependThreadQueueMessage<T extends { id: string }>(
  queuesByThreadId: Record<ThreadId, T[]>,
  threadId: ThreadId,
  message: T,
): Record<ThreadId, T[]> {
  return setThreadQueue(queuesByThreadId, threadId, [
    message,
    ...(queuesByThreadId[threadId] ?? []),
  ]);
}

function findThreadQueueMessage<T extends { id: string }>(
  queuesByThreadId: Record<ThreadId, T[]>,
  threadId: ThreadId,
  messageId: string,
): T | null {
  return queuesByThreadId[threadId]?.find((message) => message.id === messageId) ?? null;
}

function removeThreadQueueMessage<T extends { id: string }>(
  queuesByThreadId: Record<ThreadId, T[]>,
  threadId: ThreadId,
  messageId: string,
): { nextQueuesByThreadId: Record<ThreadId, T[]>; removedMessage: T | null } {
  const existingQueue = queuesByThreadId[threadId];
  if (!existingQueue) {
    return { nextQueuesByThreadId: queuesByThreadId, removedMessage: null };
  }
  const removedMessage = existingQueue.find((message) => message.id === messageId) ?? null;
  if (!removedMessage) {
    return { nextQueuesByThreadId: queuesByThreadId, removedMessage: null };
  }
  const nextQueue = existingQueue.filter((message) => message.id !== messageId);
  return {
    nextQueuesByThreadId: setThreadQueue(queuesByThreadId, threadId, nextQueue),
    removedMessage,
  };
}

function reorderThreadQueueMessages<T extends { id: string }>(
  queuesByThreadId: Record<ThreadId, T[]>,
  threadId: ThreadId,
  activeMessageId: string,
  overMessageId: string,
): Record<ThreadId, T[]> {
  const existingQueue = queuesByThreadId[threadId];
  if (!existingQueue) {
    return queuesByThreadId;
  }
  const fromIndex = existingQueue.findIndex((message) => message.id === activeMessageId);
  const toIndex = existingQueue.findIndex((message) => message.id === overMessageId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return queuesByThreadId;
  }
  const nextQueue = [...existingQueue];
  const [movedMessage] = nextQueue.splice(fromIndex, 1);
  if (!movedMessage) {
    return queuesByThreadId;
  }
  nextQueue.splice(toIndex, 0, movedMessage);
  return setThreadQueue(queuesByThreadId, threadId, nextQueue);
}

function buildQueuedMessage(threadId: ThreadId, text: string): QueuedMessage | null {
  const normalizedThreadId = threadId.trim();
  const normalizedText = text.trim();
  if (normalizedThreadId.length === 0 || normalizedText.length === 0) {
    return null;
  }
  return {
    id: randomUUID(),
    type: "message",
    text: normalizedText,
    createdAt: new Date().toISOString(),
  };
}

function buildQueuedProjectScript(
  threadId: ThreadId,
  script: ProjectScript,
): QueuedProjectScript | null {
  const normalizedThreadId = threadId.trim();
  const normalizedScriptId = script.id.trim();
  const normalizedScriptName = script.name.trim();
  const normalizedScriptCommand = script.command.trim();
  if (
    normalizedThreadId.length === 0 ||
    normalizedScriptId.length === 0 ||
    normalizedScriptName.length === 0 ||
    normalizedScriptCommand.length === 0
  ) {
    return null;
  }
  return {
    id: randomUUID(),
    type: "project-script",
    createdAt: new Date().toISOString(),
    scriptId: normalizedScriptId,
    scriptName: normalizedScriptName,
    scriptCommand: normalizedScriptCommand,
    scriptIcon: script.icon,
  };
}

export const useMessageQueueStore = create<MessageQueueStoreState>()(
  persist(
    (set) => ({
      queuedMessagesByThreadId: {},
      sendWhenDoneMessagesByThreadId: {},
      enqueueMessage: (threadId, text) => {
        const queuedMessage = buildQueuedMessage(threadId, text);
        if (!queuedMessage) {
          return null;
        }
        set((state) => ({
          queuedMessagesByThreadId: appendThreadQueueMessage(
            state.queuedMessagesByThreadId,
            threadId,
            queuedMessage,
          ),
        }));
        return queuedMessage;
      },
      enqueueSendWhenDoneMessage: (threadId, text) => {
        const queuedMessage = buildQueuedMessage(threadId, text);
        if (!queuedMessage) {
          return null;
        }
        set((state) => ({
          sendWhenDoneMessagesByThreadId: appendThreadQueueMessage<QueuedSendWhenDoneEntry>(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            queuedMessage,
          ),
        }));
        return queuedMessage;
      },
      enqueueSendWhenDoneProjectScript: (threadId, script) => {
        const queuedScript = buildQueuedProjectScript(threadId, script);
        if (!queuedScript) {
          return null;
        }
        set((state) => ({
          sendWhenDoneMessagesByThreadId: appendThreadQueueMessage<QueuedSendWhenDoneEntry>(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            queuedScript,
          ),
        }));
        return queuedScript;
      },
      removeMessage: (threadId, messageId) => {
        if (threadId.length === 0 || messageId.length === 0) {
          return;
        }
        set((state) => ({
          queuedMessagesByThreadId: removeThreadQueueMessage(
            state.queuedMessagesByThreadId,
            threadId,
            messageId,
          ).nextQueuesByThreadId,
        }));
      },
      removeSendWhenDoneMessage: (threadId, messageId) => {
        if (threadId.length === 0 || messageId.length === 0) {
          return;
        }
        set((state) => ({
          sendWhenDoneMessagesByThreadId: removeThreadQueueMessage(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            messageId,
          ).nextQueuesByThreadId,
        }));
      },
      moveQueuedMessageToSendWhenDone: (threadId, messageId) => {
        if (threadId.length === 0 || messageId.length === 0) {
          return;
        }
        set((state) => {
          const { nextQueuesByThreadId, removedMessage } = removeThreadQueueMessage(
            state.queuedMessagesByThreadId,
            threadId,
            messageId,
          );
          if (!removedMessage) {
            return state;
          }
          return {
            queuedMessagesByThreadId: nextQueuesByThreadId,
            sendWhenDoneMessagesByThreadId: appendThreadQueueMessage<QueuedSendWhenDoneEntry>(
              state.sendWhenDoneMessagesByThreadId,
              threadId,
              removedMessage,
            ),
          };
        });
      },
      moveSendWhenDoneMessageToQueue: (threadId, messageId) => {
        if (threadId.length === 0 || messageId.length === 0) {
          return;
        }
        set((state) => {
          const existingMessage = findThreadQueueMessage(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            messageId,
          );
          if (!existingMessage || existingMessage.type !== "message") {
            return state;
          }
          const { nextQueuesByThreadId, removedMessage } = removeThreadQueueMessage(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            messageId,
          );
          if (!removedMessage || removedMessage.type !== "message") {
            return state;
          }
          return {
            sendWhenDoneMessagesByThreadId: nextQueuesByThreadId,
            queuedMessagesByThreadId: appendThreadQueueMessage(
              state.queuedMessagesByThreadId,
              threadId,
              removedMessage,
            ),
          };
        });
      },
      consumeNextSendWhenDoneMessage: (threadId) => {
        if (threadId.length === 0) {
          return null;
        }
        let consumedMessage: QueuedSendWhenDoneEntry | null = null;
        set((state) => {
          const existingQueue = state.sendWhenDoneMessagesByThreadId[threadId] ?? [];
          const [nextMessage, ...remainingQueue] = existingQueue;
          if (!nextMessage) {
            return state;
          }
          consumedMessage = nextMessage;
          return {
            sendWhenDoneMessagesByThreadId: setThreadQueue<QueuedSendWhenDoneEntry>(
              state.sendWhenDoneMessagesByThreadId,
              threadId,
              remainingQueue,
            ),
          };
        });
        return consumedMessage;
      },
      restoreSendWhenDoneMessage: (threadId, message) => {
        if (threadId.length === 0 || message.id.length === 0) {
          return;
        }
        if (message.type === "message" && message.text.trim().length === 0) {
          return;
        }
        if (
          message.type === "project-script" &&
          (message.scriptId.length === 0 ||
            message.scriptName.trim().length === 0 ||
            message.scriptCommand.trim().length === 0)
        ) {
          return;
        }
        set((state) => ({
          sendWhenDoneMessagesByThreadId: prependThreadQueueMessage<QueuedSendWhenDoneEntry>(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            message,
          ),
        }));
      },
      reorderSendWhenDoneMessages: (threadId, activeMessageId, overMessageId) => {
        if (threadId.length === 0 || activeMessageId.length === 0 || overMessageId.length === 0) {
          return;
        }
        set((state) => ({
          sendWhenDoneMessagesByThreadId: reorderThreadQueueMessages<QueuedSendWhenDoneEntry>(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            activeMessageId,
            overMessageId,
          ),
        }));
      },
      clearThreadQueue: (threadId) => {
        if (threadId.length === 0) {
          return;
        }
        set((state) => ({
          queuedMessagesByThreadId: setThreadQueue<QueuedMessage>(
            state.queuedMessagesByThreadId,
            threadId,
            [],
          ),
        }));
      },
    }),
    {
      name: MESSAGE_QUEUE_STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() =>
        typeof localStorage !== "undefined"
          ? localStorage
          : {
              getItem: () => null,
              removeItem: () => {},
              setItem: () => {},
            },
      ),
      partialize: (state) => ({
        queuedMessagesByThreadId: state.queuedMessagesByThreadId,
        sendWhenDoneMessagesByThreadId: state.sendWhenDoneMessagesByThreadId,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedMessageQueueState(persistedState),
      }),
    },
  ),
);

export function useThreadMessageQueue(threadId: ThreadId): readonly QueuedMessage[] {
  return useMessageQueueStore((state) => state.queuedMessagesByThreadId[threadId] ?? EMPTY_QUEUE);
}

export function useThreadSendWhenDoneQueue(threadId: ThreadId): readonly QueuedSendWhenDoneEntry[] {
  return useMessageQueueStore(
    (state) => state.sendWhenDoneMessagesByThreadId[threadId] ?? EMPTY_SEND_WHEN_DONE_QUEUE,
  );
}
