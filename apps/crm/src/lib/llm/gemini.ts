/**
 * Gemini adapter — the ONE live LLM provider. Maps the neutral LLMProvider contract to the
 * @google/genai function-calling shape. See docs/gemini-adapter-notes.md for the gotchas this
 * handles: two roles only (system → systemInstruction), tool results as functionResponse parts
 * inside a user turn, the model's functionCall echoed before its result, args already parsed
 * (never JSON.parse), schema simplification, and 429 backoff.
 */
import { GoogleGenAI } from "@google/genai";
import type { ChatMessage, LLMProvider, LLMTurn, ToolSpec } from "./types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// Gemini's schema validator rejects some JSON Schema keywords — keep only the safe subset.
const ALLOWED_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "description",
  "enum",
  "items",
  "nullable",
]);

function sanitizeSchema(schema: unknown): Record<string, unknown> {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema) as unknown as Record<string, unknown>;
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (!ALLOWED_SCHEMA_KEYS.has(k)) continue;
      if (k === "properties" && v && typeof v === "object") {
        const props: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) props[pk] = sanitizeSchema(pv);
        out[k] = props;
      } else if (k === "items") {
        out[k] = sanitizeSchema(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return schema as Record<string, unknown>;
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

/** Map neutral messages → Gemini contents, merging consecutive tool results into one user turn. */
function buildContents(messages: ChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  let pendingToolParts: GeminiPart[] = [];

  const flushTools = () => {
    if (pendingToolParts.length) {
      contents.push({ role: "user", parts: pendingToolParts });
      pendingToolParts = [];
    }
  };

  for (const m of messages) {
    if (m.role === "tool") {
      let response: Record<string, unknown>;
      try {
        const parsed = JSON.parse(m.content);
        response = parsed && typeof parsed === "object" ? parsed : { result: parsed };
      } catch {
        response = { result: m.content };
      }
      pendingToolParts.push({ functionResponse: { name: m.name, response } });
      continue;
    }
    flushTools();
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else {
      // assistant: echo any tool calls as functionCall parts (must precede their results)
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) parts.push({ functionCall: { name: tc.name, args: tc.args } });
      if (parts.length) contents.push({ role: "model", parts });
    }
  }
  flushTools();
  return contents;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function is429(e: unknown): boolean {
  const s = e instanceof Error ? e.message : String(e);
  return s.includes("429") || s.includes("RESOURCE_EXHAUSTED") || s.toLowerCase().includes("rate");
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async runTurn(input: {
    system: string;
    messages: ChatMessage[];
    tools: ToolSpec[];
  }): Promise<LLMTurn> {
    const geminiTools =
      input.tools.length > 0
        ? [
            {
              functionDeclarations: input.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: sanitizeSchema(t.inputSchema),
              })),
            },
          ]
        : undefined;

    const request = {
      model: MODEL,
      contents: buildContents(input.messages),
      config: {
        systemInstruction: input.system,
        ...(geminiTools && { tools: geminiTools, toolConfig: { functionCallingConfig: { mode: "AUTO" } } }),
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      },
    };

    // free-tier 429s are transient — back off and retry
    const backoffs = [2000, 4000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await this.ai.models.generateContent(request as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = res.candidates?.[0]?.content?.parts ?? [];

        const toolCalls = parts
          .filter((p) => p.functionCall)
          .map((p, i) => ({
            id: `${p.functionCall.name}-${i}`, // Gemini gives no call id — synthesize a stable one
            name: p.functionCall.name as string,
            args: (p.functionCall.args ?? {}) as Record<string, unknown>, // ALREADY an object
          }));

        const text = parts
          .filter((p) => typeof p.text === "string")
          .map((p) => p.text)
          .join("") || null;

        return { text, toolCalls, stop: toolCalls.length > 0 ? "tool_use" : "end" };
      } catch (e) {
        lastErr = e;
        if (is429(e) && attempt < backoffs.length) {
          await sleep(backoffs[attempt]);
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }
}
