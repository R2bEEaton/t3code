import { ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { useMessageQueueStore } from "./messageQueueStore";

describe("messageQueueStore", () => {
  const threadId = ThreadId.makeUnsafe("thread-queue-a");
  const otherThreadId = ThreadId.makeUnsafe("thread-queue-b");

  beforeEach(() => {
    useMessageQueueStore.setState({
      queuedMessagesByThreadId: {},
    });
  });

  it("enqueues trimmed messages for a thread", () => {
    const queuedMessage = useMessageQueueStore
      .getState()
      .enqueueMessage(threadId, "  queued follow-up  ");

    expect(queuedMessage).toMatchObject({
      text: "queued follow-up",
    });
    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({
        text: "queued follow-up",
      }),
    ]);
  });

  it("ignores blank queued messages", () => {
    const queuedMessage = useMessageQueueStore.getState().enqueueMessage(threadId, "   ");

    expect(queuedMessage).toBeNull();
    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[threadId]).toBeUndefined();
  });

  it("removes only the targeted queued message", () => {
    const store = useMessageQueueStore.getState();
    const first = store.enqueueMessage(threadId, "first");
    const second = store.enqueueMessage(threadId, "second");
    store.enqueueMessage(otherThreadId, "other");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    store.removeMessage(threadId, first!.id);

    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({ id: second!.id, text: "second" }),
    ]);
    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[otherThreadId]).toEqual([
      expect.objectContaining({ text: "other" }),
    ]);
  });

  it("clears a thread queue without touching others", () => {
    const store = useMessageQueueStore.getState();
    store.enqueueMessage(threadId, "first");
    store.enqueueMessage(otherThreadId, "other");

    store.clearThreadQueue(threadId);

    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[threadId]).toBeUndefined();
    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[otherThreadId]).toEqual([
      expect.objectContaining({ text: "other" }),
    ]);
  });
});
