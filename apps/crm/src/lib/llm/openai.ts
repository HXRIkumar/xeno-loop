import type { ChatMessage, LLMProvider, LLMTurn, ToolSpec } from "./types";

/**
 * OpenAI-compatible adapter — now LIVE, pointed at Groq by default.
 *
 * Groq's API is OpenAI-compatible (identical /chat/completions shape, identical `tools` /
 * `tool_calls`), so this ONE adapter serves both LLM_PROVIDER=groq and LLM_PROVIDER=openai —
 * no Groq-specific adapter needed. It speaks the wire protocol with `fetch` (no SDK dependency,
 * which also dodges this box's flaky non-443 network). The neutral contract maps cleanly:
 *   - system            → a leading { role:"system" } message
 *   - assistant.toolCalls→ message.tool_calls (function.arguments is serialized to a JSON STRING)
 *   - tool result        → { role:"tool", tool_call_id } message
 *   - ToolSpec.inputSchema→ tools[].function.parameters (JSON Schema — OpenAI's native shape, the
 *                           common denominator, so NO sanitization needed unlike Gemini)
 *
 * KEY DIFFERENCE FROM GEMINI: on read-back, tool_calls[].function.arguments arrives as a JSON
 * STRING — we JSON.parse it into our neutral object args (Gemini gives an object already).
 */

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_RETRIES = 3; // on HTTP 429, respecting Retry-After

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAIResponse = {
  error?: { message?: string };
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
};

/** Map neutral messages → OpenAI chat messages (system is prepended by the caller). */
function buildMessages(system: string, messages: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      // echo the model's tool calls so the provider can pair them with the tool results below
      const toolCalls: OpenAIToolCall[] = (m.toolCalls ?? []).map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
      }));
      out.push({
        role: "assistant",
        content: m.content,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    } else {
      // tool result — tool_call_id MUST match the assistant's tool_calls[].id (the loop threads it)
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

/** OpenAI sends args as a JSON STRING; parse defensively (tolerate empty / already-parsed). */
function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly model: string;

  constructor(opts?: { apiKey?: string; baseURL?: string; model?: string; name?: string }) {
    this.name = opts?.name ?? "openai";
    this.apiKey = opts?.apiKey ?? process.env.GROQ_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
    this.baseURL = (opts?.baseURL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = opts?.model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL;
    if (!this.apiKey) {
      throw new Error(
        "GROQ_API_KEY is not set (the OpenAI-compatible adapter points at Groq — set GROQ_API_KEY in .env)"
      );
    }
  }

  async runTurn(input: {
    system: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
  }): Promise<LLMTurn> {
    const tools =
      input.tools.length > 0
        ? input.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          }))
        : undefined;

    const body = {
      model: this.model,
      messages: buildMessages(input.system, input.messages),
      ...(tools && { tools, tool_choice: "auto" as const }),
    };

    let lastErr: unknown;
    // up to MAX_RETRIES retries; 429s respect Retry-After, transient network errors back off exponentially
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseURL}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastErr = e;
        if (attempt < MAX_RETRIES) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw e;
      }

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = res.headers.get("retry-after");
        const fromHeader = retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000) : NaN;
        const waitMs = Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 1000 * 2 ** attempt;
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`${this.name} API error ${res.status}: ${errText.slice(0, 500)}`);
      }

      const data = (await res.json()) as OpenAIResponse;
      const msg = data.choices?.[0]?.message ?? {};
      const rawCalls = msg.tool_calls ?? [];

      const toolCalls = rawCalls
        .filter((c) => c.function?.name)
        .map((c, i) => ({
          id: c.id ?? `${c.function!.name}-${i}`, // OpenAI/Groq supply ids; synthesize if ever missing
          name: c.function!.name as string,
          args: parseArgs(c.function!.arguments), // JSON STRING → object
        }));

      const text = typeof msg.content === "string" && msg.content.length > 0 ? msg.content : null;
      return { text, toolCalls, stop: toolCalls.length > 0 ? "tool_use" : "end" };
    }
    throw lastErr ?? new Error(`${this.name}: exhausted retries`);
  }
}
