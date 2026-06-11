import type { LLMProvider } from "./types";
import { GeminiProvider } from "./gemini";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";

export type { LLMProvider, ChatMessage, ToolCall, ToolSpec, LLMTurn } from "./types";

let cached: LLMProvider | null = null;

/**
 * Resolve the active provider from LLM_PROVIDER (default groq). The agent loop only ever sees the
 * neutral interface, so swapping providers is a one-env-var change with no loop changes.
 *
 * - groq    → the OpenAI-compatible adapter pointed at Groq (the live provider; free + fast).
 * - openai  → the SAME OpenAI-compatible adapter (also Groq by default; override OPENAI_BASE_URL
 *             / OPENAI_API_KEY to hit real OpenAI). No longer a stub.
 * - gemini  → live, but currently quota-limited (still selectable for a one-env-var swap back).
 * - anthropic → typed stub that throws (the interface is the point; deliberate tradeoff).
 */
export function getProvider(): LLMProvider {
  if (cached) return cached;
  const provider = (process.env.LLM_PROVIDER ?? "groq").toLowerCase();

  switch (provider) {
    case "groq":
      cached = new OpenAIProvider({ name: "groq" });
      break;
    case "openai":
      cached = new OpenAIProvider();
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
