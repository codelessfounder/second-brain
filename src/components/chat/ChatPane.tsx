import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "@/components/canvas/MarkdownContent"

export type Source = { url: string; label?: string }

export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  /** Source pills (Notion page URLs) for assistant messages */
  sources?: Source[]
}

type ChatPaneProps = {
  messages: Message[]
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  /** When set, last assistant message and canvas show this (typewriter effect) */
  streamingContent?: string | null
  className?: string
}

const sourcePillClass =
  "inline-flex items-center rounded-full bg-brain-accent/15 px-2 py-0.5 text-[10px] font-medium text-brain-accent hover:bg-brain-accent/25 md:min-h-[36px] md:px-3 md:py-1.5 md:text-xs"

export function ChatPane({
  messages,
  inputValue,
  onInputChange,
  onSend,
  disabled = false,
  streamingContent = null,
  className,
}: ChatPaneProps) {
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(new Set())
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const updateFadeVisibility = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 16
    const scrolled = el.scrollTop > threshold
    const moreBelow = el.scrollTop + el.clientHeight < el.scrollHeight - threshold
    setShowTopFade(scrolled)
    setShowBottomFade(moreBelow)
  }, [])

  useEffect(() => {
    updateFadeVisibility()
  }, [messages.length, streamingContent, updateFadeVisibility])

  const toggleSources = (messageId: string) => {
    setExpandedSourceIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  const copyForMessage = (msg: Message, idx: number) => {
    const isLast =
      msg.role === "assistant" &&
      idx === messages.length - 1 &&
      streamingContent !== undefined
    return isLast && streamingContent !== null ? streamingContent : msg.content
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-brain-canvas",
        className
      )}
    >
      {/* Scrollable area with top/bottom fade (no hard borders) */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto"
          onScroll={updateFadeVisibility}
        >
          {/* Centered column for content (desktop only) */}
          <div className="px-4 pt-4 pb-6 md:mx-auto md:max-w-2xl">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-brain-muted text-base">
              Ask a question about your Notion content…
            </p>
          </div>
        ) : (
          <ul className="space-y-6">
            {messages.map((msg, idx) => {
              const isLastAssistant =
                msg.role === "assistant" &&
                idx === messages.length - 1 &&
                streamingContent !== undefined
              const displayContent =
                isLastAssistant && streamingContent !== null
                  ? streamingContent
                  : msg.content
              return (
                <li
                  key={msg.id}
                  className={cn(
                    "flex flex-col gap-2",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "text-base leading-relaxed",
                      msg.role === "user"
                        ? "max-w-[85%] rounded-lg bg-brain-cream px-4 py-2.5 text-brain-primary-dark"
                        : "w-full max-w-full py-1.5 text-brain-primary-dark"
                    )}
                  >
                    {msg.role === "user"
                      ? msg.content
                      : isLastAssistant && streamingContent !== null ? (
                          <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
                            {displayContent}
                          </pre>
                        ) : (
                          <MarkdownContent content={msg.content} />
                        )}
                  </div>
                  {msg.role === "assistant" &&
                    msg.sources &&
                    msg.sources.length > 0 &&
                    !(isLastAssistant && streamingContent !== null) && (
                      <div className="flex max-w-[85%] flex-wrap gap-1.5">
                        {msg.sources.length === 1 ? (
                          <a
                            href={msg.sources[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={sourcePillClass}
                          >
                            {msg.sources[0].label ?? "Source 1"}
                          </a>
                        ) : expandedSourceIds.has(msg.id) ? (
                          <>
                            {msg.sources.map((src, i) => (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={sourcePillClass}
                              >
                                {src.label ?? `Source ${i + 1}`}
                              </a>
                            ))}
                            <button
                              type="button"
                              onClick={() => toggleSources(msg.id)}
                              className={cn(sourcePillClass, "cursor-pointer border-0")}
                              aria-label="Collapse sources"
                            >
                              −
                            </button>
                          </>
                        ) : (
                          <>
                            <a
                              href={msg.sources[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={sourcePillClass}
                            >
                              {msg.sources[0].label ?? "Source 1"}
                            </a>
                            <button
                              type="button"
                              onClick={() => toggleSources(msg.id)}
                              className={cn(sourcePillClass, "cursor-pointer border-0")}
                              aria-label={`Show ${msg.sources.length - 1} more sources`}
                            >
                              +{msg.sources.length - 1}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  {msg.role === "assistant" && (() => {
                    const text = copyForMessage(msg, idx)
                    if (!text) return null
                    return (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void navigator.clipboard.writeText(text)}
                        className="h-auto gap-1.5 py-1.5 text-brain-muted hover:text-brain-primary-dark"
                        aria-label="Copy to clipboard"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                    )
                  })()}
                </li>
              )
            })}
            {disabled && messages.length > 0 && messages[messages.length - 1].role === "user" && (
              <li className="flex flex-col gap-2 items-start">
                <div className="flex max-w-[85%] items-center gap-1 rounded-lg bg-brain-cream px-4 py-2.5 text-base text-brain-muted">
                  <span>Thinking</span>
                  <span className="thinking-dots inline-flex gap-0.5">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </div>
              </li>
            )}
          </ul>
        )}
          </div>
        </div>
        {/* Top fade – only visible when scrolled down */}
        <div
          className={cn(
            "pointer-events-none absolute top-0 left-0 right-0 z-10 h-12 bg-gradient-to-b from-[#FAF9F5] to-transparent transition-opacity duration-200",
            showTopFade ? "opacity-100" : "opacity-0"
          )}
          aria-hidden
        />
        {/* Bottom fade – only visible when more content below */}
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-12 bg-gradient-to-t from-[#FAF9F5] to-transparent transition-opacity duration-200",
            showBottomFade ? "opacity-100" : "opacity-0"
          )}
          aria-hidden
        />
      </div>

      {/* Fixed input row – full width, content centered on desktop (no border line) */}
      <div className="shrink-0 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:px-0">
        <div className="md:mx-auto md:max-w-2xl md:px-4">
        <div className="flex h-[44px] items-stretch gap-2 md:h-auto md:min-h-0">
          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="Message second brain…"
            rows={1}
            className="scrollbar-hide h-full min-h-0 flex-1 resize-none rounded-lg border border-brain-muted/30 bg-brain-white px-4 py-2.5 text-base text-brain-primary-dark placeholder:text-brain-muted focus:outline-none focus:ring-2 focus:ring-brain-accent focus:ring-offset-2 sm:text-sm md:min-h-[44px] md:max-h-32 md:py-3"
            disabled={disabled}
          />
          <div className="flex h-[44px] w-[44px] shrink-0 md:h-full md:min-h-[44px] md:w-auto md:aspect-square md:self-stretch">
            <Button
              type="button"
              variant="terracotta"
              size="icon"
              onClick={onSend}
              disabled={disabled || !inputValue.trim()}
              className="h-full w-full rounded-lg min-h-0 min-w-0"
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-brain-muted md:mt-3">
          Your second brain can make mistakes.
          <br className="md:hidden" />
          Please use your own brain for important things.
        </p>
        </div>
      </div>
    </div>
  )
}
