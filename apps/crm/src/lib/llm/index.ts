import type { LLMProvider } from "./types";
import { GeminiProvider } from "./gemini";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";

export type { LLMProvider, ChatMessage, ToolCall, ToolSpec, LLMTurn } from "./types";

let cached: LLMProvider | null = null;

/**
 * Resolve the active provider from LLM_PROVIDER (default gemini). The agent loop only ever sees
 * the neutral interface, so swapping providers is a one-env-var change with no loop changes.
 */
export function getProvider(): LLMProvider {
  if (cached) return cached;
  const provider = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

  switch (provider) {
    case "gemini": {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is not set");
      cached = new GeminiProvider(key);
      break;
    }
    case "anthropic":
      cached = new AnthropicProvider();
      break;
    case "openai":
      cached = new OpenAIProvider();
      break;
    default:
      throw new Error(`unknown LLM_PROVIDER: ${provider}`);
  }
  return cached;
}
