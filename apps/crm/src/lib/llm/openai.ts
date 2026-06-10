import type { LLMProvider, LLMTurn } from "./types";

/**
 * OpenAI adapter — typed STUB (deliberate tradeoff; only Gemini is live). To make it live:
 * install openai, map ChatMessage→messages (role:"tool" with tool_call_id), ToolSpec→tools
 * (function.parameters is JSON Schema), parse choices[0].message.tool_calls (args are a JSON
 * STRING here — JSON.parse them, unlike Gemini) into LLMTurn.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  async runTurn(): Promise<LLMTurn> {
    throw new Error("provider not configured: openai adapter is a stub (set LLM_PROVIDER=gemini)");
  }
}
