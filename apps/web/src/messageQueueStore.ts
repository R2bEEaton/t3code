import { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { randomUUID } from "./lib/utils";

export const MESSAGE_QUEUE_STORAGE_KEY = "t3code:message-queue:v1";

export interface QueuedMessage {
  id: string;
  text: string;
  createdAt: string;
}

type ThreadMessageQueueMap = Record<ThreadId, QueuedMessage[]>;

interface PersistedMessageQueueState {
  queuedMessagesByThreadId: ThreadMessageQueueMap;
  sendWhenDoneMessagesByThreadId: ThreadMessageQueueMap;
}

interface MessageQueueStoreState extends PersistedMessageQueueState {
  enqueueMessage: (threadId: ThreadId, text: string) => QueuedMessage | null;
  enqueueSendWhenDoneMessage: (threadId: ThreadId, text: string) => QueuedMessage | null;
  removeMessage: (threadId: ThreadId, messageId: string) => void;
  moveQueuedMessageToSendWhenDone: (threadId: ThreadId, messageId: string) => void;
  moveSendWhenDoneMessageToQueue: (threadId: ThreadId, messageId: string) => void;
  consumeNextSendWhenDoneMessage: (threadId: ThreadId) => QueuedMessage | null;
  restoreSendWhenDoneMessage: (threadId: ThreadId, message: QueuedMessage) => void;
  reorderSendWhenDoneMessages: (
    threadId: ThreadId,
    activeMessageId: string,
    overMessageId: string,
  ) => void;
  clearThreadQueue: (threadId: ThreadId) => void;
}

const EMPTY_QUEUE: readonly QueuedMessage[] = Object.freeze([]);
const EMPTY_PERSISTED_STATE: PersistedMessageQueueState = {
  queuedMessagesByThreadId: {},
  sendWhenDoneMessagesByThreadId: {},
};

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
    text: text.trim(),
    createdAt,
  };
}

function normalizeThreadMessageQueueMap(value: unknown): ThreadMessageQueueMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalizedQueues: ThreadMessageQueueMap = {};
  for (const [threadId, rawQueue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof threadId !== "string" || threadId.length === 0 || !Array.isArray(rawQueue)) {
      continue;
    }
    const normalizedQueue = rawQueue.flatMap((entry) => {
      const normalized = normalizeQueuedMessage(entry);
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
    queuedMessagesByThreadId: normalizeThreadMessageQueueMap(rawQueuedMessagesByThreadId),
    sendWhenDoneMessagesByThreadId: normalizeThreadMessageQueueMap(
      rawSendWhenDoneMessagesByThreadId,
    ),
  };
}

function setThreadQueue(
  queuesByThreadId: ThreadMessageQueueMap,
  threadId: ThreadId,
  nextQueue: ReadonlyArray<QueuedMessage>,
): ThreadMessageQueueMap {
  const nextQueuesByThreadId = { ...queuesByThreadId };
  if (nextQueue.length === 0) {
    delete nextQueuesByThreadId[threadId];
  } else {
    nextQueuesByThreadId[threadId] = [...nextQueue];
  }
  return nextQueuesByThreadId;
}

function appendThreadQueueMessage(
  queuesByThreadId: ThreadMessageQueueMap,
  threadId: ThreadId,
  message: QueuedMessage,
): ThreadMessageQueueMap {
  return setThreadQueue(queuesByThreadId, threadId, [
    ...(queuesByThreadId[threadId] ?? []),
    message,
  ]);
}

function prependThreadQueueMessage(
  queuesByThreadId: ThreadMessageQueueMap,
  threadId: ThreadId,
  message: QueuedMessage,
): ThreadMessageQueueMap {
  return setThreadQueue(queuesByThreadId, threadId, [
    message,
    ...(queuesByThreadId[threadId] ?? []),
  ]);
}

function removeThreadQueueMessage(
  queuesByThreadId: ThreadMessageQueueMap,
  threadId: ThreadId,
  messageId: string,
): { nextQueuesByThreadId: ThreadMessageQueueMap; removedMessage: QueuedMessage | null } {
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

function reorderThreadQueueMessages(
  queuesByThreadId: ThreadMessageQueueMap,
  threadId: ThreadId,
  activeMessageId: string,
  overMessageId: string,
): ThreadMessageQueueMap {
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
    text: normalizedText,
    createdAt: new Date().toISOString(),
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
          sendWhenDoneMessagesByThreadId: appendThreadQueueMessage(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            queuedMessage,
          ),
        }));
        return queuedMessage;
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
            sendWhenDoneMessagesByThreadId: appendThreadQueueMessage(
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
          const { nextQueuesByThreadId, removedMessage } = removeThreadQueueMessage(
            state.sendWhenDoneMessagesByThreadId,
            threadId,
            messageId,
          );
          if (!removedMessage) {
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
        let consumedMessage: QueuedMessage | null = null;
        set((state) => {
          const existingQueue = state.sendWhenDoneMessagesByThreadId[threadId] ?? [];
          const [nextMessage, ...remainingQueue] = existingQueue;
          if (!nextMessage) {
            return state;
          }
          consumedMessage = nextMessage;
          return {
            sendWhenDoneMessagesByThreadId: setThreadQueue(
              state.sendWhenDoneMessagesByThreadId,
              threadId,
              remainingQueue,
            ),
          };
        });
        return consumedMessage;
      },
      restoreSendWhenDoneMessage: (threadId, message) => {
        if (threadId.length === 0 || message.id.length === 0 || message.text.trim().length === 0) {
          return;
        }
        set((state) => ({
          sendWhenDoneMessagesByThreadId: prependThreadQueueMessage(
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
          sendWhenDoneMessagesByThreadId: reorderThreadQueueMessages(
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
          queuedMessagesByThreadId: setThreadQueue(state.queuedMessagesByThreadId, threadId, []),
        }));
      },
    }),
    {
      name: MESSAGE_QUEUE_STORAGE_KEY,
      version: 2,
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

export function useThreadSendWhenDoneQueue(threadId: ThreadId): readonly QueuedMessage[] {
  return useMessageQueueStore(
    (state) => state.sendWhenDoneMessagesByThreadId[threadId] ?? EMPTY_QUEUE,
  );
}
