import { useState } from "react"
import { ChatPane, type Message } from "@/components/chat/ChatPane"
import { CanvasPane } from "@/components/canvas/CanvasPane"
import { cn } from "@/lib/utils"

type MobileLayoutProps = {
  messages: Message[]
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  canvasContent: string
  sendDisabled?: boolean
  canvasUpdated?: boolean
  streamingContent?: string | null
}

type TabId = "chat" | "canvas"

export function MobileLayout({
  messages,
  inputValue,
  onInputChange,
  onSend,
  canvasContent,
  sendDisabled = false,
  canvasUpdated = false,
  streamingContent = null,
}: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("chat")

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Segmented control: [ Chat ] [ Canvas ] */}
      <div className="flex min-h-[48px] shrink-0 items-center border-b border-brain-muted/20 bg-brain-white p-2">
        <div className="flex w-full items-center rounded-lg bg-brain-cream p-1">
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex min-h-[44px] flex-1 items-center justify-center rounded-md py-3 text-sm font-medium transition-colors",
              activeTab === "chat"
                ? "bg-brain-white text-brain-primary-dark shadow-sm"
                : "text-brain-muted hover:text-brain-primary-dark"
            )}
            aria-pressed={activeTab === "chat"}
            aria-label="Chat"
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("canvas")}
            className={cn(
              "flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md py-3 text-sm font-medium transition-colors",
              activeTab === "canvas"
                ? "bg-brain-white text-brain-primary-dark shadow-sm"
                : "text-brain-muted hover:text-brain-primary-dark"
            )}
            aria-pressed={activeTab === "canvas"}
            aria-label="Canvas"
          >
            Canvas
            {canvasUpdated && activeTab === "chat" && (
              <span className="h-2 w-2 rounded-full bg-brain-accent" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Single pane for active tab */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "chat" && (
          <ChatPane
            messages={messages}
            inputValue={inputValue}
            onInputChange={onInputChange}
            onSend={onSend}
            disabled={sendDisabled}
            streamingContent={streamingContent}
            className="h-full"
          />
        )}
        {activeTab === "canvas" && (
          <CanvasPane
            content={canvasContent}
            streamingContent={streamingContent}
            className="h-full"
          />
        )}
      </div>
    </div>
  )
}
