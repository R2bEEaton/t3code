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

interface PersistedMessageQueueState {
  queuedMessagesByThreadId: Record<ThreadId, QueuedMessage[]>;
}

interface MessageQueueStoreState extends PersistedMessageQueueState {
  enqueueMessage: (threadId: ThreadId, text: string) => QueuedMessage | null;
  removeMessage: (threadId: ThreadId, messageId: string) => void;
  clearThreadQueue: (threadId: ThreadId) => void;
}

const EMPTY_QUEUE: readonly QueuedMessage[] = Object.freeze([]);
const EMPTY_PERSISTED_STATE: PersistedMessageQueueState = {
  queuedMessagesByThreadId: {},
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

function normalizePersistedMessageQueueState(value: unknown): PersistedMessageQueueState {
  if (!value || typeof value !== "object") {
    return EMPTY_PERSISTED_STATE;
  }
  const candidate = value as Record<string, unknown>;
  const rawQueuedMessagesByThreadId =
    "queuedMessagesByThreadId" in candidate ? candidate.queuedMessagesByThreadId : value;
  if (!rawQueuedMessagesByThreadId || typeof rawQueuedMessagesByThreadId !== "object") {
    return EMPTY_PERSISTED_STATE;
  }

  const queuedMessagesByThreadId: Record<ThreadId, QueuedMessage[]> = {};
  for (const [threadId, rawQueue] of Object.entries(
    rawQueuedMessagesByThreadId as Record<string, unknown>,
  )) {
    if (typeof threadId !== "string" || threadId.length === 0 || !Array.isArray(rawQueue)) {
      continue;
    }
    const normalizedQueue = rawQueue.flatMap((entry) => {
      const normalized = normalizeQueuedMessage(entry);
      return normalized ? [normalized] : [];
    });
    if (normalizedQueue.length > 0) {
      queuedMessagesByThreadId[threadId as ThreadId] = normalizedQueue;
    }
  }

  return { queuedMessagesByThreadId };
}

export const useMessageQueueStore = create<MessageQueueStoreState>()(
  persist(
    (set) => ({
      queuedMessagesByThreadId: {},
      enqueueMessage: (threadId, text) => {
        const normalizedThreadId = threadId.trim();
        const normalizedText = text.trim();
        if (normalizedThreadId.length === 0 || normalizedText.length === 0) {
          return null;
        }

        const queuedMessage: QueuedMessage = {
          id: randomUUID(),
          text: normalizedText,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          queuedMessagesByThreadId: {
            ...state.queuedMessagesByThreadId,
            [normalizedThreadId as ThreadId]: [
              ...(state.queuedMessagesByThreadId[normalizedThreadId as ThreadId] ?? []),
              queuedMessage,
            ],
          },
        }));

        return queuedMessage;
      },
      removeMessage: (threadId, messageId) => {
        if (threadId.length === 0 || messageId.length === 0) {
          return;
        }
        set((state) => {
          const existingQueue = state.queuedMessagesByThreadId[threadId];
          if (!existingQueue) {
            return state;
          }
          const nextQueue = existingQueue.filter((message) => message.id !== messageId);
          if (nextQueue.length === existingQueue.length) {
            return state;
          }
          const nextQueuedMessagesByThreadId = { ...state.queuedMessagesByThreadId };
          if (nextQueue.length === 0) {
            delete nextQueuedMessagesByThreadId[threadId];
          } else {
            nextQueuedMessagesByThreadId[threadId] = nextQueue;
          }
          return { queuedMessagesByThreadId: nextQueuedMessagesByThreadId };
        });
      },
      clearThreadQueue: (threadId) => {
        if (threadId.length === 0) {
          return;
        }
        set((state) => {
          if (!state.queuedMessagesByThreadId[threadId]) {
            return state;
          }
          const nextQueuedMessagesByThreadId = { ...state.queuedMessagesByThreadId };
          delete nextQueuedMessagesByThreadId[threadId];
          return { queuedMessagesByThreadId: nextQueuedMessagesByThreadId };
        });
      },
    }),
    {
      name: MESSAGE_QUEUE_STORAGE_KEY,
      version: 1,
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
