import { memo } from "react";
import { type DragEndEvent, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import {
  Clock3Icon,
  GripVerticalIcon,
  PanelRightCloseIcon,
  SendHorizontalIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";

import type { QueuedMessage } from "../messageQueueStore";
import { formatTimestamp } from "../timestampFormat";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface MessageQueueSidebarProps {
  canSendQueuedMessages: boolean;
  queuedMessages: readonly QueuedMessage[];
  sendWhenDoneMessages: readonly QueuedMessage[];
  timestampFormat: TimestampFormat;
  onClose: () => void;
  onMoveQueuedMessageToSendWhenDone: (messageId: string) => void;
  onRemoveMessage: (messageId: string) => void;
  onMoveSendWhenDoneMessageToQueue: (messageId: string) => void;
  onReorderSendWhenDoneMessages: (activeMessageId: string, overMessageId: string) => void;
  onSendMessage: (messageId: string) => void;
}

interface SendWhenDoneCardProps {
  index: number;
  message: QueuedMessage;
  timestampFormat: TimestampFormat;
  onMoveToQueue: (messageId: string) => void;
}

function SendWhenDoneCard({
  index,
  message,
  timestampFormat,
  onMoveToQueue,
}: SendWhenDoneCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: message.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border border-border/60 bg-card/25",
        isDragging && "border-primary/55 bg-accent/35 shadow-lg",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="size-6 shrink-0 cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag send-when-done message ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-3.5" />
        </Button>
        <p className="text-[11px] font-medium text-foreground/85">{`Auto ${index + 1}`}</p>
        <p className="ml-auto text-[10px] text-muted-foreground/55">
          {formatTimestamp(message.createdAt, timestampFormat)}
        </p>
      </div>
      <div className="space-y-3 px-3 py-3">
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/90">
          {message.text}
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-md"
            onClick={() => onMoveToQueue(message.id)}
            aria-label="Move send-when-done message back to the regular queue"
          >
            <Undo2Icon className="size-3.5" />
            Move to queue
          </Button>
        </div>
      </div>
    </article>
  );
}

const MessageQueueSidebar = memo(function MessageQueueSidebar({
  canSendQueuedMessages,
  queuedMessages,
  sendWhenDoneMessages,
  timestampFormat,
  onClose,
  onMoveQueuedMessageToSendWhenDone,
  onMoveSendWhenDoneMessageToQueue,
  onRemoveMessage,
  onReorderSendWhenDoneMessages,
  onSendMessage,
}: MessageQueueSidebarProps) {
  const shouldUseDragRegion = isElectron;
  const totalQueuedCount = queuedMessages.length + sendWhenDoneMessages.length;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleSendWhenDoneDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    onReorderSendWhenDoneMessages(String(active.id), String(over.id));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className={cn("border-b border-border", shouldUseDragRegion && "drag-region")}>
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-4",
            shouldUseDragRegion ? "h-[52px]" : "h-12",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">Queue</h3>
              <span className="text-[11px] text-muted-foreground/60">
                {totalQueuedCount} {totalQueuedCount === 1 ? "message" : "messages"}
              </span>
            </div>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label="Close message queue"
            className="shrink-0 text-muted-foreground/50 hover:text-foreground/70 [-webkit-app-region:no-drag]"
          >
            <PanelRightCloseIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-2">
          <div className="rounded-md border border-border/60 bg-card/25 px-3 py-2">
            <p className="text-[12px] leading-relaxed text-muted-foreground/70">
              Regular queued messages wait here until you send them. Send-when-done messages fire
              automatically as soon as this chat can accept the next turn.
            </p>
          </div>

          {!canSendQueuedMessages ? (
            <div className="rounded-md border border-border/60 bg-card/25 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground/75">
              The active chat is busy. Regular queued messages are paused, and send-when-done
              messages will dispatch automatically once the current response finishes.
            </div>
          ) : null}

          <section className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                Queue
              </p>
              <span className="text-[10px] text-muted-foreground/45">
                {queuedMessages.length} {queuedMessages.length === 1 ? "message" : "messages"}
              </span>
            </div>

            {queuedMessages.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-card/25 px-4 py-5 text-center">
                <p className="text-[12px] text-muted-foreground/55">No regular queued messages.</p>
              </div>
            ) : (
              queuedMessages.map((message, index) => (
                <article key={message.id} className="rounded-md border border-border/60 bg-card/25">
                  <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
                    <p className="text-[11px] font-medium text-foreground/85">{`Queued ${index + 1}`}</p>
                    <p className="ml-auto text-[10px] text-muted-foreground/55">
                      {formatTimestamp(message.createdAt, timestampFormat)}
                    </p>
                  </div>
                  <div className="space-y-3 px-3 py-3">
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/90">
                      {message.text}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        onClick={() => onMoveQueuedMessageToSendWhenDone(message.id)}
                        aria-label="Move queued message to send when done"
                      >
                        <Clock3Icon className="size-3.5" />
                        Send when done
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        onClick={() => onRemoveMessage(message.id)}
                        aria-label="Remove queued message"
                      >
                        <Trash2Icon className="size-3.5" />
                        Remove
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-md"
                        onClick={() => onSendMessage(message.id)}
                        disabled={!canSendQueuedMessages}
                        aria-label="Send queued message"
                      >
                        <SendHorizontalIcon className="size-3.5" />
                        Send now
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Clock3Icon className="size-3.5 text-muted-foreground/55" />
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                Send When Done
              </p>
              <span className="text-[10px] text-muted-foreground/45">
                {sendWhenDoneMessages.length}{" "}
                {sendWhenDoneMessages.length === 1 ? "message" : "messages"}
              </span>
            </div>

            {sendWhenDoneMessages.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-card/25 px-4 py-5 text-center">
                <p className="text-[12px] text-muted-foreground/55">
                  Nothing scheduled to auto-send.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                onDragEnd={handleSendWhenDoneDragEnd}
              >
                <SortableContext
                  items={sendWhenDoneMessages.map((message) => message.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {sendWhenDoneMessages.map((message, index) => (
                      <SendWhenDoneCard
                        key={message.id}
                        index={index}
                        message={message}
                        timestampFormat={timestampFormat}
                        onMoveToQueue={onMoveSendWhenDoneMessageToQueue}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
});

export default MessageQueueSidebar;
export type { MessageQueueSidebarProps };
