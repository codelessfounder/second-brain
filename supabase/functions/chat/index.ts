import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_RESPONSES_MODEL = "o3-mini";
const NO_MATCH_MESSAGE =
  "There is nothing in your second brain that relates to your question.";
const HISTORY_MAX_TURNS = 5;
const MAX_OUTPUT_TOKENS = 4096;

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  message: string;
  history?: HistoryMessage[];
  stream?: boolean;
}

interface Source {
  url: string;
  label?: string;
}

interface ResponseBody {
  content: string;
  reasoning?: string;
  sources: Source[];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  try {
    const body: RequestBody = await req.json();
    const { message, history = [], stream: wantStream = false } = body;
    if (!message || typeof message !== "string") {
      return json(
        { error: "Missing or invalid message" },
        400
      );
    }

    const trimmedHistory = Array.isArray(history)
      ? history
          .filter(
            (m): m is HistoryMessage =>
              m && typeof m.role === "string" && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")
          )
          .slice(-HISTORY_MAX_TURNS * 2)
      : [];

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return json(
        { error: "OPENAI_API_KEY not configured" },
        500
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json(
        { error: "Supabase config missing" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const embeddingRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: message.trim(),
      }),
    });
    if (!embeddingRes.ok) {
      const err = await embeddingRes.text();
      console.error("OpenAI embedding error:", err);
      return json(
        { error: "Embedding failed", details: err },
        502
      );
    }
    const embeddingData = await embeddingRes.json();
    const queryEmbedding = embeddingData.data?.[0]?.embedding;
    if (!Array.isArray(queryEmbedding)) {
      return json(
        { error: "Invalid embedding response" },
        502
      );
    }

    const { data: matches, error: rpcError } = await supabase.rpc(
      "match_notion_content",
      {
        query_embedding: queryEmbedding,
        match_count: 5,
      }
    );
    if (rpcError) {
      console.error("RPC error:", rpcError);
      return json(
        { error: "Search failed", details: rpcError.message },
        502
      );
    }

    if (!matches || matches.length === 0) {
      if (wantStream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ delta: NO_MATCH_MESSAGE })}\n\n`));
            ctrl.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sources: [] })}\n\n`));
            ctrl.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...corsHeaders(),
          },
        });
      }
      return json<ResponseBody>({
        content: NO_MATCH_MESSAGE,
        sources: [],
      });
    }

    const context = matches
      .map((r: { content?: string }) => r.content ?? "")
      .join("\n\n---\n\n");
    const sources: Source[] = matches
      .filter((r: { page_url?: string; metadata?: { page_url?: string } }) => r.page_url ?? r.metadata?.page_url)
      .map((r: { page_url?: string; page_header?: string; metadata?: { page_url?: string } }) => ({
        url: r.page_url ?? r.metadata?.page_url ?? "",
        label: (r.page_header && r.page_header.trim()) ? r.page_header.trim() : "Source",
      }));

    const systemPrompt = `You are a helpful assistant that answers only from the provided context (the user's "second brain" — notes from their Notion). Use only the context below. If the context does not contain enough information to answer the question, say so clearly. Do not make up information. Answer concisely in a helpful tone.`;

    let userPrompt = `Context from the user's notes:\n\n${context}\n\n---\n\n`;
    if (trimmedHistory.length > 0) {
      userPrompt += "Previous conversation:\n";
      for (const m of trimmedHistory) {
        userPrompt += `${m.role === "user" ? "User" : "Assistant"}: ${m.content}\n\n`;
      }
      userPrompt += "---\n\n";
    }
    userPrompt += `Current question: ${message.trim()}`;

    const inputItems: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: userPrompt },
    ];

    const openaiBody = {
      model: OPENAI_RESPONSES_MODEL,
      instructions: systemPrompt,
      input: inputItems,
      reasoning: { effort: "medium", summary: "auto" } as const,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      stream: wantStream,
    };

    const responsesRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(openaiBody),
    });
    if (!responsesRes.ok) {
      const err = await responsesRes.text();
      console.error("OpenAI Responses API error:", err);
      return json(
        { error: "Answer generation failed", details: err },
        502
      );
    }

    if (wantStream && responsesRes.body) {
      return streamResponse(responsesRes, sources);
    }

    const responsesData = await responsesRes.json();

    let content = "";
    let reasoning: string | undefined;

    const output = responsesData.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item?.type === "reasoning" && Array.isArray(item.summary)) {
          const texts = item.summary
            .filter((s: { type?: string; text?: string }) => s?.type === "summary_text" && typeof s.text === "string")
            .map((s: { text: string }) => s.text);
          if (texts.length > 0) {
            reasoning = texts.join("\n\n").trim();
          }
        }
        if (item?.type === "message" && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part?.type === "output_text" && typeof part.text === "string") {
              content += part.text;
            }
          }
        }
      }
    }

    content = content.trim() || NO_MATCH_MESSAGE;

    return json<ResponseBody>({
      content,
      ...(reasoning && { reasoning }),
      sources,
    });
  } catch (e) {
    console.error(e);
    return json(
      { error: "Internal error", details: String(e) },
      500
    );
  }
});

function streamResponse(res: Response, sources: Source[]): Response {
  const encoder = new TextEncoder();
  let reasoning = "";
  let buffer = "";

  const stream = res.body!.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, Uint8Array>({
      transform(chunk, ctrl) {
        buffer += chunk;
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const t = obj?.type;
            if (t === "response.reasoning_summary_text.delta" && typeof obj.delta === "string") {
              reasoning += obj.delta;
            } else if (t === "response.reasoning_summary_text.done" && reasoning.trim()) {
              ctrl.enqueue(encoder.encode(`event: reasoning\ndata: ${JSON.stringify({ reasoning: reasoning.trim() })}\n\n`));
              reasoning = "";
            } else if (t === "response.output_text.delta" && typeof obj.delta === "string") {
              ctrl.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ delta: obj.delta })}\n\n`));
            } else if (t === "response.completed") {
              ctrl.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sources })}\n\n`));
            }
          } catch {
            // skip
          }
        }
      },
      flush(ctrl) {
        if (reasoning.trim()) {
          ctrl.enqueue(encoder.encode(`event: reasoning\ndata: ${JSON.stringify({ reasoning: reasoning.trim() })}\n\n`));
        }
        ctrl.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sources })}\n\n`));
      },
    })
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders(),
    },
  });
}

function json<T>(body: T, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  };
}
