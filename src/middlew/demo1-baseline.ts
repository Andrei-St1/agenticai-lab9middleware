// lab9/demo1-baseline.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DEMO 1 — PUNCTUL ZERO: agentul din Lab 7, cu doua tool-uri noi
// ═══════════════════════════════════════════════════════════════════════════
//
// Rulare:  npx tsx lab9/demo1-baseline.ts
//          npx tsx lab9/demo1-baseline.ts "Cat e ceasul in Tokyo?"
//
// Ce vrem sa se vada AICI, inainte de orice middleware:
//   1. Graful are exact doua noduri: model_request si tools. Atat.
//   2. Agentul poate chema rezervaHotel fara sa intrebe pe nimeni.
//   3. Datele clientului (email, card) pleaca nefiltrate catre provider.
//
// Punctele 2 si 3 nu sunt bug-uri de cod. Sunt lucruri care LIPSESC.
// Middleware-ul e locul unde le adaugi, fara sa umbli la agent.

import "dotenv/config";
import { createAgent } from "langchain";
import { createModel, readProviderFromEnv } from "../lib/llm.js";
import { toolCalatorie } from "./tools/calatorie.js";
import { toolAgentie, rezervariFacute } from "./tools/agentie.js";
import type { Graph } from "@langchain/core/runnables/graph";

const toateToolurile = [...toolCalatorie, ...toolAgentie];

const agent = createAgent({
  model: createModel(readProviderFromEnv()),
  tools: toateToolurile,
  systemPrompt:
    "Esti asistentul unei agentii de turism. Raspunzi scurt, la obiect, in " +
    "romana. Cand ai nevoie de date despre un client, il cauti cu cautaClient.",
  // Fara `middleware`. Asta e tot rostul demo-ului.
});

async function main() {
  const intrebare =
    process.argv.slice(2).join(" ") ||
    "Rezerva 3 nopti la Roma pentru clientul ionel.popescu.";

  console.log(`\n> Intrebare: ${intrebare}\n`);

  // Graful, inainte de middleware. Tine minte forma asta — o comparam
  // cu cea de la demo3 si demo5.
  const g = (await agent.getGraphAsync()) as Graph;
  console.log("── graful, fara middleware ──");
  for (const linie of g.drawMermaid().split("\n")) {
    if (linie.includes("-->") || linie.includes("-.->")) {
      console.log("  " + linie.trim().replace(";", ""));
    }
  }

  const rezultat = await agent.invoke(
    { messages: [{ role: "user", content: intrebare }] },
    { recursionLimit: 25 },
  );

  const ultimul = rezultat.messages[rezultat.messages.length - 1];
  console.log(`\n< Raspuns: ${ultimul.content}\n`);

  // Dovada ca s-a intamplat ceva ireversibil, fara ca nimeni sa aprobe.
  console.log(`Rezervari facute in rularea asta: ${rezervariFacute.length}`);
  for (const r of rezervariFacute) console.log(`  ${r}`);
  console.log(
    "\nIntrebarea pentru sala: cine a aprobat rezervarea asta? Raspuns: nimeni.\n",
  );
}

main().catch(console.error);
