import type { LLMProvider } from "./types";
import { GeminiProvider } from "./gemini";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";

export type { LLMProvider, ChatMessage, ToolCall, ToolSpec, LLMTurn } from "./types";

let cached: LLMProvider | null = null;

/**
 * Resolve the active provider from LLM_PROVIDER (default openai). The agent loop only ever sees the
 * neutral interface, so swapping providers is a one-env-var change with no loop changes. The
 * OpenAI-compatible adapter serves both `openai` and `groq` — only the base URL / key / model differ.
 *
 * - openai  → real OpenAI API (paid; reliable, faithful tool grounding). The LIVE provider.
 * - groq    → same adapter pointed at Groq (free; the 8B hallucinates audience numbers, 70B rate-limits).
 * - gemini  → live, but currently quota-limited (still selectable).
 * - anthropic → typed stub that throws (the interface is the point; deliberate tradeoff).
 */
export function getProvider(): LLMProvider {
  if (cached) return cached;
  const provider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();

  switch (provider) {
    case "openai":
      cached = new OpenAIProvider({
        name: "openai",
        baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      });
      break;
    case "groq":
      cached = new OpenAIProvider({
        name: "groq",
        baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      });
      break;
    case "gemini": {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is not set");
      cached = new GeminiProvider(key);
      break;
    }
    case "anthropic":
      cached = new AnthropicProvider();
      break;
    default:
      throw new Error(`unknown LLM_PROVIDER: ${provider}`);
  }
  return cached;
}
