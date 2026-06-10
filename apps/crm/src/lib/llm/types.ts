/**
 * The neutral LLM contract. The agent loop talks ONLY to this; thin adapters translate it to
 * each vendor's function-calling shape. Tools are described with JSON Schema — the common
 * denominator across Anthropic / OpenAI / Gemini. Swap providers with one env var; the loop is
 * identical. (This interface is the point — only Gemini is implemented live.)
 */

export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
};

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

// A conversation turn in neutral form. The assistant variant carries the tool calls it made so
// adapters can echo them back to the provider (required by Gemini/Anthropic) before the results.
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type LLMTurn = {
  text: string | null;
  toolCalls: ToolCall[];
  stop: "tool_use" | "end";
};

export interface LLMProvider {
  readonly name: string;
  runTurn(input: {
    system: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
  }): Promise<LLMTurn>;
}
