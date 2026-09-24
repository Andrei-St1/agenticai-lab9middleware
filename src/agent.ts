import "dotenv/config";
import { createAgent } from "langchain";
import { travelTools } from "./tools.js";
import type { Graph } from "@langchain/core/runnables/graph";

const agent = createAgent({
  model: "anthropic:claude-sonnet-4-5",
  tools: travelTools,
  systemPrompt: "You are a travel assistant. Answer briefly and to the point.",
});

async function main() {
  const question =
    process.argv.slice(2).join(" ") || "What's the weather in Cluj?";
  console.log(`\n> Question: ${question}\n`);

  const g = (await agent.getGraphAsync()) as Graph;
  console.log("\n── graful construit de createAgent ──");
  for (const linie of g.drawMermaid().split("\n")) {
    if (linie.includes("-->") || linie.includes("-.->")) {
      console.log("  " + linie.trim().replace(";", ""));
    }

    console.log("");
  }

  const result = await agent.invoke(
    { messages: [{ role: "user", content: question }] },
    { recursionLimit: 25 }, //the default recursion limit for the agent is the same number
    // recursion is limited to prevent infinite loops in the agent's reasoning.
    // recursion has a cost in terms of computation and potential API usage.
  );

  const toolMessages = result.messages.filter(
    (m) => m.getType() === "tool",
  ).length;
  const aiMessages = result.messages.filter((m) => m.getType() === "ai").length;

  console.log(
    `(${result.messages.length} messages · ${aiMessages} turns · ` +
      `${toolMessages} tool calls)`,
  );

  const lastMessage = result.messages[result.messages.length - 1];
  console.log(`< Answer: ${lastMessage.content}\n`);
  console.log(`(total messages in the loop: ${result.messages.length})`);
}

main().catch(console.error);
