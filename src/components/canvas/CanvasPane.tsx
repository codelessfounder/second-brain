import { Button } from "@/components/ui/button"
import { Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "./MarkdownContent"

type CanvasPaneProps = {
  content: string
  /** When set, show this as plain typewriter text instead of rendered Markdown */
  streamingContent?: string | null
  onCopy?: () => void
  className?: string
}

export function CanvasPane({
  content,
  streamingContent = null,
  onCopy,
  className,
}: CanvasPaneProps) {
  const displayContent = streamingContent ?? content
  const isStreaming = streamingContent !== null

  const handleCopy = () => {
    if (displayContent) {
      void navigator.clipboard.writeText(displayContent)
      onCopy?.()
    }
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-brain-canvas",
        className
      )}
    >
      {/* Floating header */}
      <div className="flex shrink-0 items-center justify-between border-b border-brain-muted/20 bg-brain-canvas px-4 py-3">
        <span className="text-sm font-medium text-brain-primary-dark">
          Response
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={!displayContent}
          className="min-h-[44px] gap-1.5 py-2.5 text-brain-muted hover:text-brain-primary-dark"
          aria-label="Copy to clipboard"
        >
          <Copy className="h-4 w-4" />
          Copy
        </Button>
      </div>

      {/* Content area – typewriter (plain) while streaming, then Markdown */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {displayContent ? (
          isStreaming ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-brain-primary-dark">
              {displayContent}
            </pre>
          ) : (
            <MarkdownContent content={content} />
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-brain-muted text-sm">
              Your synthesis will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
