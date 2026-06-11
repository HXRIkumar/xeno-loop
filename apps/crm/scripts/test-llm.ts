/**
 * Provider-agnostic LLM smoke test. Resolves the active LLM_PROVIDER, runs ONE turn with ONE
 * tool, and prints the resulting tool call — proof the adapter maps tools out and reads tool_calls
 * back (for Groq/OpenAI, that means args were parsed from the JSON-STRING arguments field).
 *
 * Run:
 *   npx dotenv -e .env.local -e .env -- tsx scripts/test-llm.ts
 * Expect toolCalls[0].name === "analyse_audience".
 */
import { getProvider } from "../src/lib/llm";

async function main() {
  const provider = getProvider();
  const model = process.env.GROQ_MODEL ?? process.env.GEMINI_MODEL ?? "(provider default)";
  console.log(`LLM_PROVIDER=${process.env.LLM_PROVIDER} | provider.name=${provider.name} | model=${model}`);

  const turn = await provider.runTurn({
    system: "You are Loop, a retail marketing agent. Use the provided tools when they help answer.",
    messages: [{ role: "user", content: "How many dormant customers do we have? Use the tool to check." }],
    tools: [
      {
        name: "analyse_audience",
        description: "Query the customer DB for a segment's stats.",
        inputSchema: {
          type: "object",
          properties: {
            persona: { type: "string", description: "e.g. DORMANT, HIGH_SPENDER, NEW" },
            minDaysSinceLastOrder: { type: "number", description: "only customers idle at least this many days" },
          },
        },
      },
    ],
  });

  console.log(JSON.stringify(turn, null, 2));
  if (turn.toolCalls[0]?.name === "analyse_audience") {
    console.log(`\n✅ ${provider.name} adapter wired correctly — tool call returned (args parsed to an object)`);
  } else {
    console.log(`\n⚠️  no tool call (model answered directly):`, turn.text);
  }
}

main().catch((e) => {
  console.error("✗ smoke test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
