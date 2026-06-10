import type { LLMProvider, LLMTurn } from "./types";

/**
 * Anthropic adapter — typed STUB (deliberate tradeoff: only the provider whose key we have is
 * implemented live; the interface is the point). To make it live: install @anthropic-ai/sdk, map
 * ChatMessage→messages with tool_use/tool_result blocks, ToolSpec→tools (input_schema is JSON
 * Schema, which is already our common denominator), and parse content blocks into LLMTurn.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  async runTurn(): Promise<LLMTurn> {
    throw new Error("provider not configured: anthropic adapter is a stub (set LLM_PROVIDER=gemini)");
  }
}
