// lab9/demo5-mock-ieftin.ts
//
// costGuard cu DOUA modele mock, complet offline (fara cheie, fara retea).
//   ieftin = mock prezentat ca gemini-2.5-flash-lite
//   scump  = mock prezentat ca claude-sonnet-4-5
//
// Rulare:  pnpm demo5ieftin
//          pnpm demo5ieftin "Compara vremea din Roma si Atena"
//
// Ce ar trebui sa vezi: aceleasi tokeni (1000 in / 500 out), dar costul de pe
// ramura SIMPLA e de ~50x mai mic decat cel de pe ramura COMPLEXA.

import { createAgent } from "langchain";
import { MockModel } from "./mock-model.js";
import { auditLogger, resetJurnal } from "./middleware/audit.js";
import { costGuard } from "./middleware/cost-guard.js";

const ieftin = new MockModel("ieftin", "gemini-2.5-flash-lite");
const scump = new MockModel("scump", "claude-sonnet-4-5");

const agent = createAgent({
  model: ieftin,
  tools: [],
  systemPrompt: "Esti asistentul unei agentii de turism. Raspunzi scurt, in romana.",
  middleware: [
    auditLogger({ verbose: true }),
    costGuard({ modelIeftin: ieftin, modelScump: scump }),
  ] as const,
});

async function main() {
  resetJurnal();

  const intrebari = process.argv.slice(2).length
    ? [process.argv.slice(2).join(" ")]
    : ["La ce ora e check-in?", "Compara vremea din Roma si Atena"];

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
