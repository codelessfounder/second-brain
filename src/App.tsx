import { useState, useCallback, useRef, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { SecondBrainLayout } from "@/components/layout/SecondBrainLayout"
import { LandingView } from "@/components/landing/LandingView"
import { Logo } from "@/components/icons/Logo"
import type { Message, Source } from "@/components/chat/ChatPane"
import { sendChatMessage } from "@/lib/chatApi"

const THINKING_MS = 3000
const TYPEWRITER_CHUNK = 2
const TYPEWRITER_INTERVAL_MS = 28

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [canvasContent, setCanvasContent] = useState("")
  const [canvasUpdated, setCanvasUpdated] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const typewriterRef = useRef<{
    intervalId: ReturnType<typeof setInterval> | null
    index: number
    full: string
  } | null>(null)

  useEffect(() => {
    return () => {
      if (typewriterRef.current?.intervalId) {
        clearInterval(typewriterRef.current.intervalId)
      }
    }
  }, [])

  const runTypewriter = useCallback((fullContent: string, sources: Source[]) => {
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: fullContent,
      sources,
    }
    setMessages((prev) => [...prev, assistantMessage])
    setStreaming(false)

    if (fullContent.length === 0) {
      setCanvasContent("")
      setCanvasUpdated(true)
      return
    }

    let index = 0
    setStreamingContent("")
    const intervalId = setInterval(() => {
      index += TYPEWRITER_CHUNK
      if (index >= fullContent.length) {
        if (typewriterRef.current?.intervalId) {
          clearInterval(typewriterRef.current.intervalId)
          typewriterRef.current = null
        }
        setStreamingContent(null)
        setCanvasContent(fullContent)
        setCanvasUpdated(true)
        return
      }
      setStreamingContent(fullContent.slice(0, index))
    }, TYPEWRITER_INTERVAL_MS)
    typewriterRef.current = { intervalId, index, full: fullContent }
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || streaming || streamingContent !== null) return

    setInputValue("")
    setStreaming(true)
    setStreamingContent(null)

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    }
    setMessages((prev) => [...prev, userMessage])

    Promise.all([sendChatMessage(trimmed), delay(THINKING_MS)])
      .then(([res]) => {
        runTypewriter(res.content, res.sources)
      })
      .catch((err) => {
        setStreaming(false)
        const errorContent =
          err instanceof Error ? err.message : "Something went wrong. Try again."
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorContent,
        }
        setMessages((prev) => [...prev, assistantMessage])
        setCanvasContent(errorContent)
        setCanvasUpdated(true)
      })
  }, [inputValue, streaming, streamingContent, runTypewriter])

  const showLanding = messages.length === 0

  return (
    <AppLayout>
      {showLanding ? (
        <LandingView
          inputValue={inputValue}
          onInputChange={(v) => setInputValue(v)}
          onSend={handleSend}
          disabled={streaming}
        />
      ) : (
        <div className="flex h-screen flex-col bg-brain-canvas animate-in fade-in duration-300">
          <header className="flex min-w-0 shrink-0 items-center gap-2 bg-brain-canvas px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3">
            <Logo size={20} className="shrink-0" />
            <h1 className="min-w-0 truncate font-spotify text-lg font-semibold text-brain-primary-dark">
              Second Brain
            </h1>
          </header>
          <main className="min-h-0 flex-1">
            <SecondBrainLayout
              messages={messages}
              inputValue={inputValue}
              onInputChange={(v) => setInputValue(v)}
              onSend={handleSend}
              sendDisabled={streaming || streamingContent !== null}
              streamingContent={streamingContent}
            />
          </main>
        </div>
      )}
    </AppLayout>
  )
}

export default App