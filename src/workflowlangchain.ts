import "dotenv/config";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { travelTools } from "./tools.js";

const model = new ChatAnthropic({ model: "claude-sonnet-4-5" }).bindTools(
  travelTools,
);

// Name→tool index, so we can quickly find the tool the model requested.
const toolByName: Record<string, StructuredToolInterface> = Object.fromEntries(
  travelTools.map((t) => [t.name, t]),
);

async function run(question: string): Promise<string> {
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(
      "You are a travel assistant. Answer briefly and to the point.",
    ),
    new HumanMessage(question),
  ];

  // Manual tool-calling loop: the model asks, we execute, we send back.
  for (let turn = 0; turn < 5; turn++) {
    console.log(`\n--- turn ${turn + 1} ---`);
    const res = (await model.invoke(messages)) as AIMessage;
    messages.push(res);

    const toolCalls = res.tool_calls ?? [];
    if (toolCalls.length === 0) {
      console.log("  no tool calls -> final answer");
      return typeof res.content === "string"
        ? res.content
        : JSON.stringify(res.content);
    }

    console.log(`  ${toolCalls.length} tool call(s) requested`);
    for (const call of toolCalls) {
      const tool = toolByName[call.name];
      const result = tool
        ? ((await tool.invoke(call.args)) as string)
        : `Unknown tool: ${call.name}`;
      console.log(`  → ${call.name}(${JSON.stringify(call.args)}) = ${result}`);
      messages.push(
        new ToolMessage({ content: result, tool_call_id: call.id! }),
      );
    }
  }

  return "Reached the step limit without a final answer.";
}

async function main() {
  const question =
    process.argv.slice(2).join(" ") || "What's the weather in Cluj?";
  console.log(`\n> Question: ${question}\n`);
  console.log(`< Answer:   ${await run(question)}\n`);
}

main().catch(console.error);
