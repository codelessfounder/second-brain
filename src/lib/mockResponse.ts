/**
 * Phase 3: mock assistant response (Markdown + code).
 * Replaced in Phase 4 by Edge Function RAG.
 */
export function getMockAssistantResponse(userMessage: string): string {
  return `Here’s a **mock response** to your question.

### Your question
> ${userMessage}

### Summary
This is placeholder content. In Phase 4, the real RAG pipeline will:
1. Embed your question with \`text-embedding-3-small\`
2. Run vector search on \`notion_content\`
3. Build context from matched chunks
4. Generate an answer with an LLM

### Example code (syntax-highlighted)

\`\`\`typescript
const query = "What did I write about project X?"
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: query,
})
const matches = await supabase.rpc("match_notion_content", {
  query_embedding: embedding.data[0].embedding,
  match_count: 5,
})
\`\`\`

*Canvas renders Markdown; source pills link to Notion.*`
}

/** Mock Notion page URLs for source pills */
export const MOCK_SOURCES = [
  { url: "https://www.notion.so/example-page-1", label: "Project overview" },
  { url: "https://www.notion.so/example-page-2", label: "Meeting notes" },
]
