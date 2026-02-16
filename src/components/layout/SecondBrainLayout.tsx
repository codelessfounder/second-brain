import { ChatPane, type Message } from "@/components/chat/ChatPane"

type SecondBrainLayoutProps = {
  messages: Message[]
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  sendDisabled?: boolean
  streamingContent?: string | null
}

/**
 * Single-pane layout: messages and formatted output (Markdown) with Copy in one column.
 */
export function SecondBrainLayout({
  messages,
  inputValue,
  onInputChange,
  onSend,
  sendDisabled = false,
  streamingContent = null,
}: SecondBrainLayoutProps) {
  return (
    <div className="h-full min-h-0">
      <ChatPane
        messages={messages}
        inputValue={inputValue}
        onInputChange={onInputChange}
        onSend={onSend}
        disabled={sendDisabled}
        streamingContent={streamingContent}
        className="h-full"
      />
    </div>
  )
}
