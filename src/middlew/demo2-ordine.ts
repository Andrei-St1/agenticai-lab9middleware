// lab9/demo2-ordine.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DEMO 2 — ORDINEA. Demo-ul cel mai important din lab.
// ═══════════════════════════════════════════════════════════════════════════
//
// Rulare:  npx tsx lab9/demo2-ordine.ts
//          NU consuma tokeni si NU are nevoie de cheie de API.
//
// De ce fara model real: vrem sa se vada ORDINEA, iar un model real ar aduce
// latenta si variatie in output. Folosim FakeToolCallingModel, care vine in
// pachetul `langchain` si intoarce tool call-uri scrise de noi.
//
// ELEMENT NOU: FakeToolCallingModel
//   Din ce pachet:  "langchain"
//   Ce e:           un model fals care intoarce exact tool call-urile pe care
//                   i le dai in constructor, in ordine, tura dupa tura.
//   La ce e bun:    teste si demo-uri deterministe. Il folosesti si cand scrii
//                   teste pentru middleware-urile tale, ca sa nu platesti
//                   tokeni la fiecare rulare de CI.
//
// CE DEMONSTRAM
//   1. Ordinea de executie a hook-urilor: e o CEAPA, nu o lista.
//   2. wrapModelCall si wrapToolCall NU adauga noduri in graf.
//      beforeModel / afterModel / beforeAgent / afterAgent adauga.

import { createAgent, createMiddleware, tool, FakeToolCallingModel } from "langchain";
import { z } from "zod";
import type { Graph } from "@langchain/core/runnables/graph";

// Un tool banal — nu conteaza ce face, conteaza doar ca e chemat.
const ping = tool(async () => "pong", {
  name: "ping",
  description: "Intoarce pong.",
  schema: z.object({}),
});

const urme: string[] = [];

/**
 * Fabrica un middleware care isi striga numele la fiecare hook.
 * Toate cele sase hook-uri, ca sa le vezi pe toate in aceeasi rulare.
 */
function spion(nume: string) {
  return createMiddleware({
    name: nume,
    beforeAgent: async () => {
      urme.push(`${nume}.beforeAgent`);
      return undefined;
    },
    beforeModel: async () => {
      urme.push(`${nume}.beforeModel`);
      return undefined;
    },
    wrapModelCall: async (request, handler) => {
      urme.push(`${nume}.wrapModelCall  ↓ intru`);
      const r = await handler(request);
      urme.push(`${nume}.wrapModelCall  ↑ ies`);
      return r;
    },
    wrapToolCall: async (request, handler) => {
      urme.push(`${nume}.wrapToolCall   ↓ intru (${request.toolCall.name})`);
      const r = await handler(request);
      urme.push(`${nume}.wrapToolCall   ↑ ies`);
      return r;
    },
    afterModel: async () => {
      urme.push(`${nume}.afterModel`);
      return undefined;
    },
    afterAgent: async () => {
      urme.push(`${nume}.afterAgent`);
      return undefined;
    },
  });
}

// Modelul fals: tura 1 cere tool-ul `ping`, tura 2 raspunde fara tool calls
// (adica termina). Exact doua ture, ca sa vezi ca bucla se reia.
const model = new FakeToolCallingModel({
  toolCalls: [[{ name: "ping", args: {}, id: "1" }], []],
});

const agent = createAgent({
  model,
  tools: [ping],
  // ORDINEA DIN LISTA E ORDINEA DIN CEAPA. A e stratul de afara, B cel de
  // dinauntru. Schimba-le intre ele si ruleaza din nou — se inverseaza tot.
  middleware: [spion("B"), spion("A")] as const,
});

async function main() {
  await agent.invoke({ messages: [{ role: "user", content: "salut" }] });

  console.log("\n══ ORDINEA DE EXECUTIE ══\n");
  for (const u of urme) console.log("  " + u);

  console.log("\n══ CE SE VEDE ══");
  console.log("  beforeAgent / beforeModel:  A, apoi B   (de afara spre inauntru)");
  console.log("  afterModel / afterAgent:    B, apoi A   (de inauntru spre afara)");
  console.log("  wrap*:                      A intra primul, iese ultimul");
  console.log("  → nu e o lista de pasi, e o CEAPA in jurul modelului.\n");

  const g = (await agent.getGraphAsync()) as Graph;
  console.log("══ GRAFUL ══\n");
  for (const linie of g.drawMermaid().split("\n")) {
    if (linie.includes("-->") || linie.includes("-.->")) {
      console.log("  " + linie.trim().replace(";", ""));
    }
  }

  console.log("\n══ CONCLUZIA CARE CORECTEAZA O SIMPLIFICARE DIN LABUL TRECUT ══");
  console.log("  In graf apar A_before_model, A_after_model, B_before_model,");
  console.log("  B_after_model, A_before_agent... — deci hook-urile node-style");
  console.log("  ADAUGA noduri.");
  console.log("  Dar wrapModelCall si wrapToolCall NU apar nicaieri in graf.");
  console.log("  Ele se executa IN INTERIORUL nodurilor model_request si tools.");
  console.log("  Deci «un middleware = un nod» e fals. Corect e:");
  console.log("  «un hook node-style = un nod; un hook wrap = zero noduri».\n");
}

main().catch(console.error);
