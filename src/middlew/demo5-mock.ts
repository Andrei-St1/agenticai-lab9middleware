// lab9/demo5-mock.ts
//
// costGuard cu model SCUMP MOCK + model IEFTIN real (qwen prin c3po).
// Mock-ul nu plateste tokeni: intoarce un raspuns fix si numere de tokeni
// inventate, ca auditLogger sa poata afisa un cost realist de «sonnet».
//
// Rulare:  pnpm demo5mock
//          pnpm demo5mock "Compara vremea din Roma si Atena"
//
// Ce ar trebui sa vezi:
//   - intrebare SIMPLA   → [cost] ... ieftin, raspuns de la qwen
//   - intrebare COMPLEXA → [cost] ... scump,  raspuns «[MOCK scump]»

import "dotenv/config";
import { createAgent } from "langchain";
import { createModel } from "../lib/llm.js";
import { MockModel } from "./mock-model.js";
import { toolCalatorie } from "./tools/calatorie.js";
import { toolAgentie } from "./tools/agentie.js";
import { auditLogger, resetJurnal } from "./middleware/audit.js";
import { costGuard } from "./middleware/cost-guard.js";

const ieftin = createModel("qwen");

const agent = createAgent({
  model: ieftin,
  tools: [...toolCalatorie, ...toolAgentie],
  systemPrompt:
    "Esti asistentul unei agentii de turism. Raspunzi scurt, in romana.",
  middleware: [
    auditLogger({ verbose: true }),
    costGuard({ modelIeftin: ieftin, modelScump: new MockModel("scump", "claude-sonnet-4-5") }),
  ] as const,
});

async function main() {
  resetJurnal();

  const intrebari = process.argv.slice(2).length
    ? [process.argv.slice(2).join(" ")]
    : ["Cat e ceasul in Tokyo?", "Compara vremea din Roma si Atena"];

  for (const intrebare of intrebari) {
    console.log(`\n> Intrebare: ${intrebare}\n`);
    const rezultat = await agent.invoke(
      { messages: [{ role: "user", content: intrebare }] },
      { recursionLimit: 25 },
    );
    const ultimul = rezultat.messages[rezultat.messages.length - 1];
    console.log(`< Raspuns: ${ultimul.content}\n`);
  }
}

main().catch(console.error);
