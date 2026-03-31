import { memo } from "react";
import { type TimestampFormat } from "../appSettings";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { formatTimestamp } from "../timestampFormat";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { PanelRightCloseIcon, SendHorizontalIcon, Trash2Icon } from "lucide-react";

import type { QueuedMessage } from "../messageQueueStore";

interface MessageQueueSidebarProps {
  canSendQueuedMessages: boolean;
  queuedMessages: readonly QueuedMessage[];
  timestampFormat: TimestampFormat;
  onClose: () => void;
  onRemoveMessage: (messageId: string) => void;
  onSendMessage: (messageId: string) => void;
}

const MessageQueueSidebar = memo(function MessageQueueSidebar({
  canSendQueuedMessages,
  queuedMessages,
  timestampFormat,
  onClose,
  onRemoveMessage,
  onSendMessage,
}: MessageQueueSidebarProps) {
  const shouldUseDragRegion = isElectron;

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
                {queuedMessages.length} {queuedMessages.length === 1 ? "message" : "messages"}
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
        <div className="space-y-2 p-2">
          <div className="rounded-md border border-border/60 bg-card/25 px-3 py-2">
            <p className="text-[12px] leading-relaxed text-muted-foreground/70">
              Queued messages stay in this chat until you send or remove them.
            </p>
          </div>

          {!canSendQueuedMessages ? (
            <div className="rounded-md border border-border/60 bg-card/25 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground/75">
              Queued messages can be sent once the active chat is ready for a normal message.
            </div>
          ) : null}

          {queuedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-card/25 px-4 py-12 text-center">
              <p className="text-[13px] text-muted-foreground/55">No queued messages.</p>
              <p className="mt-1 text-[11px] text-muted-foreground/30">
                Use the queue button in the composer to stage one.
              </p>
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
        </div>
      </ScrollArea>
    </div>
  );
});

export default MessageQueueSidebar;
export type { MessageQueueSidebarProps };
