import { Group, Panel, Separator } from "react-resizable-panels"
import { ChatPane, type Message } from "@/components/chat/ChatPane"
import { CanvasPane } from "@/components/canvas/CanvasPane"

type ResizableLayoutProps = {
  messages: Message[]
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  canvasContent: string
  sendDisabled?: boolean
  streamingContent?: string | null
}

export function ResizableLayout({
  messages,
  inputValue,
  onInputChange,
  onSend,
  canvasContent,
  sendDisabled = false,
  streamingContent = null,
}: ResizableLayoutProps) {
  return (
    <Group
      orientation="horizontal"
      className="h-full min-h-0"
    >
      <Panel id="chat" defaultSize={40} minSize={25} maxSize={60}>
        <ChatPane
          messages={messages}
          inputValue={inputValue}
          onInputChange={onInputChange}
          onSend={onSend}
          disabled={sendDisabled}
          streamingContent={streamingContent}
          className="h-full"
        />
      </Panel>
      <Separator
        id="resize"
        className="w-2 shrink-0 cursor-col-resize bg-brain-muted/20 transition-colors hover:bg-brain-accent/30 data-[separator]:hover:bg-brain-accent/30 data-[separator][data-resize-handle-active]:bg-brain-accent/50"
      />
      <Panel id="canvas" defaultSize={60} minSize={35} maxSize={75}>
        <CanvasPane
        content={canvasContent}
        streamingContent={streamingContent}
        className="h-full"
      />
      </Panel>
    </Group>
  )
}
