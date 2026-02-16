import { supabase } from "./supabase"

export type ChatSource = { url: string; label?: string }

export type ChatResponse = {
  content: string
  sources: ChatSource[]
}

export type ChatError = {
  error: string
  details?: string
}

const CHAT_FUNCTION = "chat"

/**
 * Call the chat Edge Function (embed → vector search → LLM).
 * Returns content + sources, or throws with error details.
 */
export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke<ChatResponse | ChatError>(CHAT_FUNCTION, {
    body: { message: message.trim() },
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
    sources: Array.isArray(result.sources) ? result.sources : [],
  }
}
