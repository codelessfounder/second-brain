import { useCallback, useRef, useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { SecondBrainLayout } from "@/components/layout/SecondBrainLayout"
import { LandingView } from "@/components/landing/LandingView"
import { Logo } from "@/components/icons/Logo"
import type { Message } from "@/components/chat/ChatPane"
import { buildChatHistory, sendChatMessage, sendMessageStreaming } from "@/lib/chatApi"

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const streamingAssistantIdRef = useRef<string | null>(null)
  const contentAccumRef = useRef("")

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || streaming || streamingContent !== null) return

    setInputValue("")
    setStreaming(true)
    setStreamingContent(null)
    contentAccumRef.current = ""

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    }
    setMessages((prev) => [...prev, userMessage])

    const assistantId = crypto.randomUUID()
    streamingAssistantIdRef.current = assistantId
    const placeholderAssistant: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
    }
    setMessages((prev) => [...prev, placeholderAssistant])

    const history = buildChatHistory(messages)

    sendMessageStreaming(
      trimmed,
      {
        onReasoning: (reasoning) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, reasoning: reasoning.trim() } : m
            )
          )
        },
        onChunk: (delta) => {
          contentAccumRef.current += delta
          setStreamingContent(contentAccumRef.current)
        },
        onDone: (sources) => {
          const finalContent = contentAccumRef.current.trim() || "There is nothing in your second brain that relates to your question."
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: finalContent, sources }
                : m
            )
          )
          setStreamingContent(null)
          setStreaming(false)
          streamingAssistantIdRef.current = null
        },
        onError: async (err) => {
          try {
            const res = await sendChatMessage(trimmed, history)
            const finalContent = res.content.trim() || "There is nothing in your second brain that relates to your question."
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: finalContent,
                      reasoning: res.reasoning?.trim() || undefined,
                      sources: res.sources,
                    }
                  : m
              )
            )
          } catch {
            const errorContent = err.message || "Something went wrong. Try again."
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: errorContent, isError: true } : m
              )
            )
          } finally {
            setStreamingContent(null)
            setStreaming(false)
            streamingAssistantIdRef.current = null
          }
        },
      },
      history
    )
  }, [inputValue, streaming, streamingContent, messages])

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