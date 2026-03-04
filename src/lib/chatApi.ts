import { supabase } from "./supabase"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export type ChatSource = { url: string; label?: string }

export type ChatHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

export type ChatResponse = {
  content: string
  reasoning?: string
  sources: ChatSource[]
}

export type ChatError = {
  error: string
  details?: string
}

const CHAT_FUNCTION = "chat"
const HISTORY_MAX_TURNS = 5
const STREAM_RETRY_ATTEMPTS = 2
const STREAM_RETRY_DELAY_MS = 500

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 429
}

async function parseErrorResponse(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const errBody = JSON.parse(text)
    return errBody.details ?? errBody.error ?? (text ? text : "Request failed")
  } catch {
    return text || "Request failed"
  }
}

/**
 * Build history array from messages (last 5 turns, user + assistant).
 */
export function buildChatHistory(messages: { role: string; content: string }[]): ChatHistoryMessage[] {
  const turns: ChatHistoryMessage[] = []
  let count = 0
  for (let i = messages.length - 1; i >= 0 && count < HISTORY_MAX_TURNS * 2; i--) {
    const m = messages[i]
    if (m.role === "user" || m.role === "assistant") {
      turns.unshift({ role: m.role as "user" | "assistant", content: m.content })
      count++
    }
  }
  return turns
}

/**
 * Call the chat Edge Function (embed → vector search → LLM).
 * Passes optional history for conversational context.
 * Returns content + reasoning (if any) + sources, or throws with error details.
 */
export async function sendChatMessage(
  message: string,
  history?: ChatHistoryMessage[]
): Promise<ChatResponse> {
  const body: { message: string; history?: ChatHistoryMessage[] } = { message: message.trim() }
  if (history && history.length > 0) {
    body.history = history
  }

  const { data, error } = await supabase.functions.invoke<ChatResponse | ChatError>(CHAT_FUNCTION, {
    body,
  })

  if (error) {
    throw new Error(error.message || "Request failed")
  }

  if (data && "error" in data) {
    throw new Error((data as ChatError).details ?? (data as ChatError).error)
  }

  const result = data as ChatResponse
  if (!result || typeof result.content !== "string") {
    throw new Error("Invalid response from chat")
  }

  return {
    content: result.content,
    reasoning: typeof result.reasoning === "string" ? result.reasoning : undefined,
    sources: Array.isArray(result.sources) ? result.sources : [],
  }
}

export type StreamCallbacks = {
  onReasoning?: (reasoning: string) => void
  onChunk?: (delta: string) => void
  onDone?: (sources: ChatSource[]) => void
  onError?: (err: Error) => void
}

/**
 * Stream chat response from the Edge Function.
 * Uses direct fetch (Supabase invoke does not stream).
 * Calls onReasoning, onChunk, onDone as events arrive.
 * Retries up to STREAM_RETRY_ATTEMPTS on transient failures (502, 503, 504, 429).
 */
export async function sendMessageStreaming(
  message: string,
  callbacks: StreamCallbacks,
  history?: ChatHistoryMessage[]
): Promise<void> {
  const body: { message: string; history?: ChatHistoryMessage[]; stream: boolean } = {
    message: message.trim(),
    stream: true,
  }
  if (history && history.length > 0) {
    body.history = history
  }

  const url = `${SUPABASE_URL}/functions/v1/chat`
  const request = () =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    })

  let res: Response | null = null
  let lastErr: Error | null = null

  for (let attempt = 0; attempt <= STREAM_RETRY_ATTEMPTS; attempt++) {
    try {
      res = await request()
      if (res.ok) break

      const errMsg = await parseErrorResponse(res)
      const err = new Error(errMsg)
      if (isRetryableStatus(res.status) && attempt < STREAM_RETRY_ATTEMPTS) {
        await delay(STREAM_RETRY_DELAY_MS * (attempt + 1))
        res = null
        continue
      }
      callbacks.onError?.(err)
      return
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (attempt < STREAM_RETRY_ATTEMPTS) {
        await delay(STREAM_RETRY_DELAY_MS * (attempt + 1))
      } else {
        callbacks.onError?.(lastErr)
        return
      }
    }
  }

  if (!res) {
    callbacks.onError?.(lastErr ?? new Error("Request failed"))
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    callbacks.onError?.(new Error("No response body"))
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""
  let receivedDone = false

  const processEvent = (evt: string) => {
    let eventType = ""
    let dataStr = ""
    for (const line of evt.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7).trim()
      if (line.startsWith("data: ")) dataStr = line.slice(6)
    }
    if (!eventType || !dataStr) return
    try {
      const obj = JSON.parse(dataStr)
      if (eventType === "reasoning" && typeof obj.reasoning === "string") {
        callbacks.onReasoning?.(obj.reasoning)
      } else if (eventType === "chunk" && typeof obj.delta === "string") {
        callbacks.onChunk?.(obj.delta)
      } else if (eventType === "done" && Array.isArray(obj.sources)) {
        receivedDone = true
        callbacks.onDone?.(obj.sources)
      }
    } catch {
      // skip
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split("\n\n")
      buffer = events.pop() ?? ""

      for (const evt of events) {
        if (evt.trim()) processEvent(evt)
      }
    }
    if (buffer.trim()) processEvent(buffer)

    if (!receivedDone) {
      callbacks.onError?.(new Error("Stream ended unexpectedly. Please try again."))
    }
  } catch (err) {
    callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}
