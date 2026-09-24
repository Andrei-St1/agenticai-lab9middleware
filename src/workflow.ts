import "dotenv/config";
import {
  StateGraph,
  START,
  END,
  MessagesAnnotation,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import { travelTools } from "./tools.js";

const model = new ChatAnthropic({ model: "claude-sonnet-4-5" }).bindTools(
  travelTools,
);

// Prebuilt node that executes whatever tools the model requested.
const toolNode = new ToolNode(travelTools);

// this is called by the "agent" node in the graph
async function callModel(s: typeof MessagesAnnotation.State) {
  const res = await model.invoke(s.messages);
  console.log(`  model responded with: ${JSON.stringify(res.content)}`);

  // this for is only for logging the tool calls
  for (const call of res.tool_calls ?? []) {
    console.log(`  → ${call.name}(${JSON.stringify(call.args)})`);
  }
  return { messages: [res] };
}

// Loop back to the tools node while the model keeps requesting tools.
function shouldContinue(s: typeof MessagesAnnotation.State) {
  const last = s.messages[s.messages.length - 1] as AIMessage;
  return last.tool_calls?.length ? "tools" : END;
}

// Construct the state graph for the agent and tools nodes.
//each node represents a step in the agent's reasoning and tool usage
// the edges define the flow between the agent and tools nodes based on the model's requests

// this is the React-like declarative construction of the state graph
const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel) //register the agent node
  .addNode("tools", toolNode) //register the tools node
  .addEdge(START, "agent") //start the graph with the agent node
  .addConditionalEdges("agent", shouldContinue, ["tools", END]) // continue to the tools node if the model requests tools, otherwise end the graph
  .addEdge("tools", "agent") // after executing the tools, go back to the agent node for further reasoning if needed
  .compile(); // compile the state graph

async function main() {
  const question =
    process.argv.slice(2).join(" ") ||
    "What's the weather in Cluj and Iasi and can I exchange 100 euro for 500 ron?";
  console.log(`\n> Question: ${question}\n`);

  const result = await graph.invoke(
    {
      messages: [
        new SystemMessage(
          "You are a travel assistant. Answer briefly and to the point.",
        ),
        new HumanMessage(question),
      ],
    },

    // Limita de pași de graf. Implicit e 25 — suficient aici, dar o punem
    // explicit ca să fie simetrică cu `turn < 5` din workflowlangchain.ts.
    //
    //  NU e același lucru cu numărul de turn-uri: un turn = nodul «agent»
    //    + nodul «tools» = 2 pași. Cu 3 tool-uri și 2 turn-uri ai ~5 pași.
    //    De aceea limita se pune generos: oprește bucla scăpată, de exemplu
    { recursionLimit: 25 }, // o pot pune 2 sa vedem ce se intampla

    //am  trei tool-uri și o întrebare simplă:
    // două-trei turn-uri, deci sub 10 pași.
    // 25 e implicitul și e larg.
  );

  const last = result.messages[result.messages.length - 1]; // last is the final message from the model
  console.log(`< Answer: ${last.content}\n`);
  console.log(`(total messages in the graph: ${result.messages.length})`);
}

main().catch(console.error);
