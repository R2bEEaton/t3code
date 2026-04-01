import { ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { useMessageQueueStore } from "./messageQueueStore";

describe("messageQueueStore", () => {
  const threadId = ThreadId.makeUnsafe("thread-queue-a");
  const otherThreadId = ThreadId.makeUnsafe("thread-queue-b");

  beforeEach(() => {
    useMessageQueueStore.setState({
      queuedMessagesByThreadId: {},
      sendWhenDoneMessagesByThreadId: {},
    });
  });

  it("enqueues trimmed messages for the regular queue", () => {
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

  it("enqueues trimmed messages for the send-when-done queue", () => {
    const queuedMessage = useMessageQueueStore
      .getState()
      .enqueueSendWhenDoneMessage(threadId, "  send after this  ");

    expect(queuedMessage).toMatchObject({
      text: "send after this",
    });
    expect(useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({
        text: "send after this",
      }),
    ]);
  });

  it("ignores blank queued messages", () => {
    const queuedMessage = useMessageQueueStore.getState().enqueueMessage(threadId, "   ");
    const sendWhenDoneMessage = useMessageQueueStore
      .getState()
      .enqueueSendWhenDoneMessage(threadId, "   ");

    expect(queuedMessage).toBeNull();
    expect(sendWhenDoneMessage).toBeNull();
    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[threadId]).toBeUndefined();
    expect(
      useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[threadId],
    ).toBeUndefined();
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

  it("moves a send-when-done message back into the regular queue", () => {
    const store = useMessageQueueStore.getState();
    const regular = store.enqueueMessage(threadId, "first");
    const sendWhenDone = store.enqueueSendWhenDoneMessage(threadId, "later");

    expect(regular).not.toBeNull();
    expect(sendWhenDone).not.toBeNull();

    store.moveSendWhenDoneMessageToQueue(threadId, sendWhenDone!.id);

    expect(
      useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[threadId],
    ).toBeUndefined();
    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({ id: regular!.id, text: "first" }),
      expect.objectContaining({ id: sendWhenDone!.id, text: "later" }),
    ]);
  });

  it("moves a regular queued message into send-when-done", () => {
    const store = useMessageQueueStore.getState();
    const regular = store.enqueueMessage(threadId, "first");
    const other = store.enqueueSendWhenDoneMessage(threadId, "later");

    expect(regular).not.toBeNull();
    expect(other).not.toBeNull();

    store.moveQueuedMessageToSendWhenDone(threadId, regular!.id);

    expect(useMessageQueueStore.getState().queuedMessagesByThreadId[threadId]).toBeUndefined();
    expect(useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({ id: other!.id, text: "later" }),
      expect.objectContaining({ id: regular!.id, text: "first" }),
    ]);
  });

  it("consumes the next send-when-done message in order", () => {
    const store = useMessageQueueStore.getState();
    const first = store.enqueueSendWhenDoneMessage(threadId, "first");
    const second = store.enqueueSendWhenDoneMessage(threadId, "second");

    const consumed = store.consumeNextSendWhenDoneMessage(threadId);

    expect(consumed).toMatchObject({ id: first!.id, text: "first" });
    expect(useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({ id: second!.id, text: "second" }),
    ]);
  });

  it("restores a failed send-when-done message to the front of the queue", () => {
    const store = useMessageQueueStore.getState();
    const first = store.enqueueSendWhenDoneMessage(threadId, "first");
    const second = store.enqueueSendWhenDoneMessage(threadId, "second");
    const consumed = store.consumeNextSendWhenDoneMessage(threadId);

    expect(consumed).toMatchObject({ id: first!.id, text: "first" });

    store.restoreSendWhenDoneMessage(threadId, consumed!);

    expect(useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({ id: first!.id, text: "first" }),
      expect.objectContaining({ id: second!.id, text: "second" }),
    ]);
  });

  it("reorders send-when-done messages without affecting other threads", () => {
    const store = useMessageQueueStore.getState();
    const first = store.enqueueSendWhenDoneMessage(threadId, "first");
    const second = store.enqueueSendWhenDoneMessage(threadId, "second");
    store.enqueueSendWhenDoneMessage(otherThreadId, "other");

    store.reorderSendWhenDoneMessages(threadId, second!.id, first!.id);

    expect(useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[threadId]).toEqual([
      expect.objectContaining({ id: second!.id, text: "second" }),
      expect.objectContaining({ id: first!.id, text: "first" }),
    ]);
    expect(useMessageQueueStore.getState().sendWhenDoneMessagesByThreadId[otherThreadId]).toEqual([
      expect.objectContaining({ text: "other" }),
    ]);
  });

  it("clears a thread regular queue without touching others", () => {
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
