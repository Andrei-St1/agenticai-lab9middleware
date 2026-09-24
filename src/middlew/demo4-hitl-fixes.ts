// lab9/demo4-hitl-fixes.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DEMO 4 (CORECTAT) — acelasi HITL, dar fara raspunsul final mincinos
// ═══════════════════════════════════════════════════════════════════════════
//
// Rulare:  pnpm demo4fix   (sau: npx tsx src/middlew/demo4-hitl-fixes.ts)
//
// Explicatiile despre humanInTheLoopMiddleware, checkpointer, thread_id si
// Command({ resume }) sunt in demo4-hitl.ts. Aici sunt comentate DOAR
// modificarile, marcate cu «FIX n».
//
// PROBLEMA OBSERVATA la decizia «edit»:
//   ai  -> tool_call rezervaHotel { Roma, 3 }      (cererea modelului)
//   tool-> "REZ-0001: ... Milano, 2 nopti, 170 EUR" (executia reala, editata)
//   ai  -> "confirmat: 3 nopti la Roma, 170 EUR"    (amesteca cele doua)
// Istoricul se contrazice singur, iar modelul rezuma dupa cererea initiala.

import "dotenv/config";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import type { HITLRequest, HITLResponse } from "langchain";
import { Command, MemorySaver } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages"; // FIX 3
import { createModel, readProviderFromEnv } from "../lib/llm.js";
import * as readline from "node:readline/promises";
import { toolCalatorie } from "./tools/calatorie.js";
import { toolAgentie, rezervariFacute } from "./tools/agentie.js";

const agent = createAgent({
  model: createModel(readProviderFromEnv()),
  tools: [...toolCalatorie, ...toolAgentie],

  // FIX 1: sursa de adevar e rezultatul tool-ului, nu cererea clientului.
  // Fara propozitia asta, modelul rezuma dupa ce s-a cerut la inceput.
  systemPrompt:
    "Esti asistentul unei agentii de turism. Raspunzi scurt, in romana. " +
    "Raspunsul final se bazeaza EXCLUSIV pe rezultatul tool-ului, nu pe " +
    "cererea initiala. Daca rezultatul difera de ce s-a cerut, spui explicit " +
    "ce s-a modificat.",

  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        rezervaHotel: {
          allowedDecisions: ["approve", "edit", "reject"],
          description: (toolCall) =>
            `Se cere o rezervare IREVERSIBILA:\n` +
            `   oras:   ${toolCall.args.oras}\n` +
            `   nopti:  ${toolCall.args.nopti}\n` +
            `   client: ${toolCall.args.idClient}`,
        },
        cautaClient: false,
      },
    }),
  ] as const,

  checkpointer: new MemorySaver(),
});

async function main() {
  const intrebare =
    process.argv.slice(2).join(" ") ||
    "Rezerva 3 nopti la Roma pentru clientul ionel.popescu.";

  // FIX 0: thread_id separat de demo4-hitl.ts, ca sa nu prinzi starea
  // ramasa de la rularea necorectata cand le compari una dupa alta.
  const config = { configurable: { thread_id: "lab9-demo4-fixes" } };

  console.log(`\n> Intrebare: ${intrebare}\n`);

  const rezultat1: any = await agent.invoke(
    { messages: [{ role: "user", content: intrebare }] },
    config,
  );

  if (!rezultat1.__interrupt__) {
    console.log(
      `< Raspuns (fara aprobare): ` +
        `${rezultat1.messages[rezultat1.messages.length - 1].content}\n`,
    );
    return;
  }

  const cerere = rezultat1.__interrupt__[0].value as HITLRequest;

  console.log("══ AGENTUL S-A OPRIT SI CERE APROBARE ══\n");
  for (const a of cerere.actionRequests) {
    console.log(`  tool:  ${a.name}`);
    console.log(`  args:  ${JSON.stringify(a.args)}`);
    console.log(`  ${a.description}\n`);
  }
  console.log(
    `  decizii permise: ${cerere.reviewConfigs[0].allowedDecisions.join(" / ")}\n`,
  );

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // FIX 2: in varianta initiala orice typo cadea pe ramura «else», adica
  // approve. O tasta gresita executa o actiune ireversibila. Acum intrebam
  // pana primim o decizie valida.
  let decizie = "";
  while (!["approve", "edit", "reject"].includes(decizie)) {
    decizie = (await rl.question("Decizia ta [approve/edit/reject]: "))
      .trim()
      .toLowerCase();
    if (!["approve", "edit", "reject"].includes(decizie)) {
      console.log("  decizie invalida — scrie approve, edit sau reject.");
    }
  }

  let resume: HITLResponse;

  // FIX 3a: tinem minte argumentele editate, ca dupa resume sa putem verifica
  // daca modelul chiar a raportat ce s-a executat.
  let argsEditate: Record<string, any> | null = null;

  if (decizie === "edit") {
    const orasNou = (await rl.question("  oras nou: ")).trim();
    const noptiNoi = Number((await rl.question("  nopti noi: ")).trim());
    const argsVechi = cerere.actionRequests[0].args;
    argsEditate = { ...argsVechi, oras: orasNou, nopti: noptiNoi };
    resume = {
      decisions: [
        {
          type: "edit",
          editedAction: {
            name: cerere.actionRequests[0].name,
            args: argsEditate,
          },
        },
      ],
    };
  } else if (decizie === "reject") {
    const motiv =
      (await rl.question("  motivul respingerii: ")).trim() ||
      "Rezervarea nu a fost aprobata.";
    resume = { decisions: [{ type: "reject", message: motiv }] };
  } else {
    resume = { decisions: [{ type: "approve" }] };
  }

  rl.close();

  console.log("\n── reluam rularea ──\n");
  const rezultat2: any = await agent.invoke(new Command({ resume }), config);

  // FIX 3b: afisam si rezultatul tool-ului, nu doar fraza modelului. Tool-ul
  // e ce s-a intamplat; fraza modelului e doar o repovestire.
  const mesaje = rezultat2.messages as BaseMessage[];
  const rezultatTool = [...mesaje].reverse().find((m) => m.getType() === "tool");
  const ultimul = mesaje[mesaje.length - 1];

  if (rezultatTool) console.log(`< Rezultat tool: ${rezultatTool.content}`);
  console.log(`< Raspuns model: ${ultimul.content}\n`);

  // FIX 3c: verificare determinista, care nu depinde de bunavointa modelului.
  // Daca orasul editat nu apare in raspuns, modelul a rezumat cererea veche.
  if (argsEditate) {
    const text = String(ultimul.content).toLowerCase();
    if (!text.includes(String(argsEditate.oras).toLowerCase())) {
      console.log(
        "ATENTIE: modelul a rezumat dupa cererea initiala, nu dupa " +
          "argumentele editate. Sursa de adevar ramane rezultatul tool-ului.\n",
      );
    }
  }

  console.log(`Rezervari facute efectiv: ${rezervariFacute.length}`);
  for (const r of rezervariFacute) console.log(`  ${r}`);
  console.log();
}

main().catch(console.error);
