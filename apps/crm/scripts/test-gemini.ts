/**
 * Smoke test for the Gemini adapter. Run once:
 *   npx dotenv -e .env.local -e .env -- tsx scripts/test-gemini.ts
 * Expect toolCalls[0].name === "analyse_audience".
 */
import { getProvider } from "../src/lib/llm";

async function main() {
  const provider = getProvider();
  console.log("provider:", provider.name, "| model:", process.env.GEMINI_MODEL);

  const turn = await provider.runTurn({
    system: "You are Loop, a retail marketing agent. Use tools when useful.",
    messages: [{ role: "user", content: "How many dormant customers do we have?" }],
    tools: [
      {
        name: "analyse_audience",
        description: "Query the customer DB for a segment's stats.",
        inputSchema: {
          type: "object",
          properties: {
            persona: { type: "string" },
            minDaysSinceLastOrder: { type: "number" },
          },
        },
      },
    ],
  });

  console.log(JSON.stringify(turn, null, 2));
  if (turn.toolCalls[0]?.name === "analyse_audience") {
    console.log("\n✅ adapter wired correctly — tool call returned");
  } else {
    console.log("\n⚠️  no tool call (model answered directly):", turn.text);
  }
}

main().catch((e) => {
  console.error("✗ smoke test failed:", e);
  process.exit(1);
});
