// lab9/demo4-hitl.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DEMO 4 — HUMAN IN THE LOOP: agentul se opreste si te intreaba
// ═══════════════════════════════════════════════════════════════════════════
//
// Rulare:  npx tsx lab9/demo4-hitl.ts
//          Iti va cere in consola: approve / edit / reject.
//
// ───────────────────────────────────────────────────────────────────────────
// ELEMENT NOU: humanInTheLoopMiddleware
//   Din ce pachet:  "langchain"
//   Ce face:        inainte de a executa anumite tool-uri, opreste rularea si
//                   cere o decizie umana: approve / edit / reject.
//   Hook folosit:   afterModel — adica DUPA ce modelul a cerut tool-ul, dar
//                   INAINTE ca tool-ul sa se execute. Exact fereastra care
//                   trebuie.
//   La ce e bun:    orice actiune ireversibila: plati, refund-uri, trimitere
//                   de emailuri, stergeri, DDL pe baza de date.
//
// ELEMENT NOU: checkpointer (MemorySaver)
//   Din ce pachet:  "@langchain/langgraph"
//   Ce e:           componenta care SALVEAZA starea grafului dupa fiecare pas.
//   De ce e obligatoriu aici: ca sa te poti opri si sa revii, cineva trebuie
//                   sa tina minte unde erai. Fara checkpointer, interrupt-ul
//                   nu are unde sa-si salveze contextul si nu poti face resume.
//   MemorySaver     tine totul in RAM — dispare la restart. Perfect pentru
//                   lab. In productie: checkpointer pe Postgres sau SQLite.
//
// ELEMENT NOU: thread_id
//   Ce e:           identificatorul conversatiei, dat prin
//                   { configurable: { thread_id: '...' } }.
//   De ce conteaza: checkpointer-ul salveaza PE THREAD. Daca la resume dai alt
//                   thread_id, agentul nu gaseste starea si o ia de la zero.
//                   E greseala numarul unu la primul HITL scris de mana.
//
// ELEMENT NOU: Command({ resume })
//   Din ce pachet:  "@langchain/langgraph"
//   Ce e:           obiectul cu care reiei o rulare intrerupta. Il dai in
//                   locul mesajelor, pe acelasi thread_id.

import "dotenv/config";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import type { HITLRequest, HITLResponse } from "langchain";
import { Command, MemorySaver } from "@langchain/langgraph";
import { createModel, readProviderFromEnv } from "../lib/llm.js";
import * as readline from "node:readline/promises";
import { toolCalatorie } from "./tools/calatorie.js";
import { toolAgentie, rezervariFacute } from "./tools/agentie.js";

const agent = createAgent({
  model: createModel(readProviderFromEnv()),
  tools: [...toolCalatorie, ...toolAgentie],
  systemPrompt:
    "Esti asistentul unei agentii de turism. Raspunzi scurt, in romana.",

  middleware: [
    humanInTheLoopMiddleware({
      // Cheia = numele tool-ului. Tool-urile care NU apar aici sunt aprobate
      // automat. Deci lista asta e lista lucrurilor periculoase, nu invers.
      interruptOn: {
        rezervaHotel: {
          allowedDecisions: ["approve", "edit", "reject"],
          // Descrierea poate fi si o functie de (toolCall, state, runtime),
          // ca sa construiesti un text cu datele reale ale cererii.
          description: (toolCall) =>
            `Se cere o rezervare IREVERSIBILA:\n` +
            `   oras:   ${toolCall.args.oras}\n` +
            `   nopti:  ${toolCall.args.nopti}\n` +
            `   client: ${toolCall.args.idClient}`,
        },
        // Explicit pe false = «stiu ca exista, il las sa treaca».
        // Mai bine decat sa-l omiti: se vede ca ai decis, nu ca ai uitat.
        cautaClient: false,
      },
    }),
  ] as const,

  // Fara asta, interrupt-ul arunca eroare. E dependenta reala, nu optionala.
  checkpointer: new MemorySaver(),
});

async function main() {
  const intrebare =
    process.argv.slice(2).join(" ") ||
    "Rezerva 3 nopti la Roma pentru clientul ionel.popescu.";

  // Acelasi thread_id la ambele apeluri. Aici e toata smecheria.
  const config = { configurable: { thread_id: "lab9-demo4" } };

  console.log(`\n> Intrebare: ${intrebare}\n`);

  // ── PRIMUL APEL: merge pana la tool-ul periculos si se opreste ──────────
  const rezultat1: any = await agent.invoke(
    { messages: [{ role: "user", content: intrebare }] },
    config,
  );

  if (!rezultat1.__interrupt__) {
    // Modelul nu a cerut rezervaHotel — deci n-a fost nevoie de aprobare.
    console.log(
      `< Raspuns (fara aprobare): ` +
        `${rezultat1.messages[rezultat1.messages.length - 1].content}\n`,
    );
    return;
  }

  // ── AGENTUL E IN PAUZA. Vedem ce ne cere. ──────────────────────────────
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

  // ── DECIZIA OMULUI ─────────────────────────────────────────────────────
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const decizie = (await rl.question("Decizia ta [approve/edit/reject]: "))
    .trim()
    .toLowerCase();

  let resume: HITLResponse;

  if (decizie === "edit") {
    // EDIT: schimbi argumentele inainte ca tool-ul sa se execute.
    // Modelul nu afla ca l-ai corectat; tool-ul primeste direct valorile tale.
    const orasNou = (await rl.question("  oras nou: ")).trim();
    const noptiNoi = Number((await rl.question("  nopti noi: ")).trim());
    const argsVechi = cerere.actionRequests[0].args;
    resume = {
      decisions: [
        {
          type: "edit",
          editedAction: {
            name: cerere.actionRequests[0].name,
            args: { ...argsVechi, oras: orasNou, nopti: noptiNoi },
          },
        },
      ],
    };
  } else if (decizie === "reject") {
    // REJECT: tool-ul NU se executa. Mesajul tau ajunge la model ca rezultat
    // al tool-ului, deci modelul poate sa reformuleze sau sa ceara altceva.
    const motiv =
      (await rl.question("  motivul respingerii: ")).trim() ||
      "Rezervarea nu a fost aprobata.";
    resume = { decisions: [{ type: "reject", message: motiv }] };
  } else {
    // APPROVE: tool-ul se executa exact cum l-a cerut modelul.
    resume = { decisions: [{ type: "approve" }] };
  }

  rl.close();

  // ── AL DOILEA APEL: reluam de unde am ramas, pe ACELASI thread_id ───────
  console.log("\n── reluam rularea ──\n");
  const rezultat2: any = await agent.invoke(new Command({ resume }), config);

  const ultimul = rezultat2.messages[rezultat2.messages.length - 1];
  console.log(`< Raspuns: ${ultimul.content}\n`);

  console.log(`Rezervari facute efectiv: ${rezervariFacute.length}`);
  for (const r of rezervariFacute) console.log(`  ${r}`);
  console.log();
}

main().catch(console.error);
