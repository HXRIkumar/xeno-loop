# Gemini Adapter Notes — for the LLMProvider abstraction

This file tells Claude Code exactly how to implement the **Gemini** adapter for the
`LLMProvider` interface defined in the build pack (`lib/llm/types.ts`). Gemini is the ONE live
adapter (free tier). Anthropic and OpenAI stay as typed stubs that throw "not configured".

> Verify the current SDK name, model id, and role conventions at https://ai.google.dev/gemini-api/docs/function-calling
> before shipping — Google changes these. Notes below reflect the `@google/genai` SDK. If the
> install or API surface differs from what you find, follow the live docs and keep the neutral
> interface unchanged.

## SDK + model

```bash
npm install @google/genai
```

```ts
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
// Use a current fast model. Verify the exact id in the docs; e.g. "gemini-2.5-flash"
// or "gemini-2.0-flash". Put the model id in one config constant so it's swappable.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
```

## The mapping (neutral interface → Gemini)

Our neutral types: `ToolSpec { name, description, inputSchema(JSON Schema) }`,
`ChatMessage { role: "user"|"assistant"|"tool", ... }`, `LLMTurn { text, toolCalls, stop }`.

### Tools → Gemini `functionDeclarations`
Gemini groups function declarations under a `tools` array. The `parameters` field is an
OpenAPI-style schema — our JSON Schema maps over almost 1:1.

```ts
const geminiTools = [{
  functionDeclarations: tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema, // JSON Schema; if the SDK rejects it, see "Gotchas" below
  })),
}];
```

### Messages → Gemini `contents`
**Gemini has only TWO roles: `user` and `model`.** Map them:

- our `"user"` → `{ role: "user", parts: [{ text }] }`
- our `"assistant"` (plain text) → `{ role: "model", parts: [{ text }] }`
- our `"assistant"` that made tool calls → `{ role: "model", parts: [{ functionCall: { name, args } }] }`
- our `"tool"` (a tool RESULT) → `{ role: "user", parts: [{ functionResponse: { name, response: <objectResult> } }] }`

> The model's `functionCall` turn MUST be present in history immediately before you send the
> matching `functionResponse`. Don't drop it.

### The call

```ts
const res = await ai.models.generateContent({
  model: MODEL,
  contents,
  config: {
    systemInstruction: system,          // your system prompt goes here, NOT as a message
    tools: geminiTools,
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    // For a marketing-copy demo, relax safety so benign promos aren't blocked:
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  },
});
```

### Reading the response → `LLMTurn`

```ts
const parts = res.candidates?.[0]?.content?.parts ?? [];
const toolCalls = parts
  .filter(p => p.functionCall)
  .map((p, i) => ({
    id: `${p.functionCall!.name}-${i}`,   // Gemini gives no call id; synthesize a stable one
    name: p.functionCall!.name!,
    args: p.functionCall!.args ?? {},     // ALREADY an object — do NOT JSON.parse it
  }));
const text = parts.filter(p => p.text).map(p => p.text).join("") || null;
return {
  text,
  toolCalls,
  stop: toolCalls.length > 0 ? "tool_use" : "end",
};
```

## Gotchas that will bite overnight (handle these explicitly)

1. **`functionCall.args` is already a parsed object.** Unlike OpenAI (JSON string), Gemini gives
   you an object. Never `JSON.parse` it.
2. **Two roles only.** There is no `"system"` or `"assistant"` or `"tool"` role. System prompt
   goes in `config.systemInstruction`. Tool results go back as a `functionResponse` part inside
   a `user`-role content.
3. **Echo the call before the result.** Append the model's `functionCall` content to history,
   THEN append your `functionResponse`. Skipping the call content causes errors.
4. **Schema strictness.** If the SDK rejects `parameters`, simplify the JSON Schema: keep only
   `type`, `properties`, `required`, `description`, `enum`, `items`. Drop `$schema`,
   `additionalProperties`, and exotic keywords. If types must be uppercase in your SDK version
   (`"OBJECT"`, `"STRING"`), uppercase them in the mapping — verify against the docs.
5. **Parallel calls.** Gemini may return multiple `functionCall` parts in one turn. Execute all,
   append all `functionResponse` parts (in one user content), then continue the loop.
6. **Free-tier rate limits (429).** Add a small retry with backoff (e.g. wait 2s, 4s) on 429 in
   the adapter so the overnight run doesn't die on a transient limit.
7. **Empty text + tool call.** When the model only calls a tool, `text` is null — that's normal;
   the loop continues. Only surface text to the UI on the final `stop:"end"` turn.

## Tiny smoke test (write this so you can prove the adapter works)

```ts
// scripts/test-gemini.ts — run once: should print a tool call for analyse_audience
const provider = getProvider(); // LLM_PROVIDER=gemini
const turn = await provider.runTurn({
  system: "You are Loop, a retail marketing agent. Use tools when useful.",
  messages: [{ role: "user", content: "How many dormant customers do we have?" }],
  tools: [{
    name: "analyse_audience",
    description: "Query the customer DB for a segment's stats.",
    inputSchema: {
      type: "object",
      properties: { persona: { type: "string" }, minDaysSinceLastOrder: { type: "number" } },
    },
  }],
});
console.log(JSON.stringify(turn, null, 2)); // expect toolCalls[0].name === "analyse_audience"
```

If that prints a tool call, the adapter is wired correctly and the agent loop will work.
