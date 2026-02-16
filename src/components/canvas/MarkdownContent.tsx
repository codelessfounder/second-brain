import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import "highlight.js/styles/github.css"
import { cn } from "@/lib/utils"

type MarkdownContentProps = {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "markdown-content text-base leading-relaxed text-brain-primary-dark",
        "[&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight",
        "[&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight",
        "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-tight",
        "[&_p]:mb-4 [&_p]:leading-relaxed",
        "[&_ul]:mb-4 [&_ul]:list-inside [&_ul]:list-disc [&_ul]:leading-relaxed [&_ul]:space-y-1",
        "[&_ol]:mb-4 [&_ol]:list-inside [&_ol]:list-decimal [&_ol]:leading-relaxed [&_ol]:space-y-1",
        "[&_li]:mb-1",
        "[&_pre]:text-sm",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => (
            <pre className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-brain-muted/20 p-4 text-sm leading-relaxed sm:p-5">
              {children}
            </pre>
          ),
          code: ({ node, className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName
            if (isInline) {
              return (
                <code
                  className="rounded bg-brain-cream px-1.5 py-0.5 font-mono text-base text-brain-accent"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
