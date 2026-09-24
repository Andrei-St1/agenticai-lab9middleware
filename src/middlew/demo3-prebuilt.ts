// lab9/demo3-prebuilt.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DEMO 3 · MIDDLEWARE PRE-BUILT: trei scenarii, trei efecte vizibile
// ═══════════════════════════════════════════════════════════════════════════
//
// Rulare:
//   npx tsx lab9/demo3-prebuilt.ts pii      <- redactarea datelor personale
//   npx tsx lab9/demo3-prebuilt.ts sumar    <- rezumarea istoricului lung
//   npx tsx lab9/demo3-prebuilt.ts limita   <- plafonul de apeluri de tool
//
// De ce trei rulari separate si nu una singura cu toate middleware-urile
// pornite: un middleware care nu se declanseaza nu demonstreaza nimic. Ca sa
// vezi summarization, iti trebuie un istoric lung. Ca sa vezi plafonul, iti
// trebuie o intrebare care cere multe tool-uri. Fiecare scenariu e construit
// sa declanseze exact un middleware, ca efectul sa fie evident in consola.
//
// ───────────────────────────────────────────────────────────────────────────
// ELEMENT NOU: summarizationMiddleware
//   Din ce pachet:  "langchain"
//   Ce face:        cand istoricul trece de un prag, cheama un model si
//                   inlocuieste mesajele vechi cu un rezumat.
//   Hook folosit:   beforeModel, deci ADAUGA un nod in graf.
//   La ce e bun:    conversatii lungi. Costul unei conversatii creste patratic,
//                   pentru ca fiecare tura retrimite tot ce a fost inainte.
//
// ELEMENT NOU: piiMiddleware
//   Din ce pachet:  "langchain"
//   Ce face:        gaseste datele personale si le INLOCUIESTE, inainte ca
//                   mesajele sa plece spre provider.
//   Tipuri built-in: email, credit_card, ip, mac_address, url
//   Strategii:      'redact' | 'mask' | 'hash' | 'block'
//   ATENTIE:        inlocuirea e DEFINITIVA. Nu exista restaurare. Marcajul
//                   '[REDACTED_EMAIL]' nu are id, deci doua adrese diferite
//                   devin acelasi marcaj si nu mai pot fi deosebite. Tool-urile
//                   de dupa primesc marcajul, nu valoarea reala.
//                   (piiRedactionMiddleware, cel vechi si deprecated, chiar
//                   pastra o mapare si punea valoarea la loc. Nu-l folosi.)
//
// ELEMENT NOU: toolCallLimitMiddleware
//   Din ce pachet:  "langchain"
//   Ce face:        numara apelurile de tool si opreste cand s-a depasit limita.
//   runLimit        plafon pe o rulare · threadLimit plafon pe tot thread-ul
//   exitBehavior    'end' opreste elegant · 'error' arunca · 'continue' refuza
//                   apelul si merge mai departe

import "dotenv/config";
import {
  createAgent,
  createMiddleware,
  summarizationMiddleware,
  piiMiddleware,
  toolCallLimitMiddleware,
} from "langchain";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { Graph } from "@langchain/core/runnables/graph";
import { createModel, readProviderFromEnv } from "../lib/llm.js";
import { toolCalatorie } from "./tools/calatorie.js";
import { toolAgentie } from "./tools/agentie.js";

const model = createModel(readProviderFromEnv());

// ───────────────────────────────────────────────────────────────────────────
// SPIONUL: un middleware care nu face nimic, doar arata ce ajunge la model.
//
// E cel mai util middleware pe care il vei scrie vreodata cand debughezi.
// Il punem ULTIMUL in lista, deci cel mai INAUNTRU, ca sa vada rezultatul
// tuturor middleware-urilor dinaintea lui.
// ───────────────────────────────────────────────────────────────────────────
const spion = createMiddleware({
  name: "Spion",
  wrapModelCall: async (cerere, handler) => {
    console.log(`\n  ┌─ CE AJUNGE LA MODEL (${cerere.messages.length} mesaje) ─`);
    for (const m of cerere.messages) {
      const text =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      console.log(`  │ [${m.getType().padEnd(6)}] ${text.slice(0, 110)}`);
    }
    console.log("  └─");
    return handler(cerere);
  },
});

/** Tipareste muchiile grafului, ca sa se vada nodurile adaugate de middleware. */
async function arataGraful(agent: { getGraphAsync: () => Promise<unknown> }) {
  const g = (await agent.getGraphAsync()) as Graph;
  console.log("\n── graful ──");
  for (const linie of g.drawMermaid().split("\n")) {
    if (linie.includes("-->") || linie.includes("-.->")) {
      console.log("  " + linie.trim().replace(";", ""));
    }
  }
}

/** Tipareste mesajele finale, ca sa se vada ce a ramas in stare. */
function arataMesajele(mesaje: { getType(): string; content: unknown }[]) {
  console.log("\n── mesajele din starea finala ──");
  for (const m of mesaje) {
    const text =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    console.log(`  ${m.getType().padEnd(6)} ${text.slice(0, 120)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIUL 1 · PII
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce trebuie sa se vada: cautaClient intoarce email si card. In cutia
// «CE AJUNGE LA MODEL», ambele sunt deja inlocuite. Si totusi modelul
// raspunde corect despre orasul clientului, pentru ca orasul NU e dat personal.
async function scenariulPii() {
  console.log("\n═══ SCENARIUL 1 · PII ═══");

  const agent = createAgent({
    model,
    tools: [...toolCalatorie, ...toolAgentie],
    systemPrompt:
      "Esti asistentul unei agentii de turism. Raspunzi scurt, in romana.",
    middleware: [
      // Cate o instanta per tip de data, cu strategii diferite.
      piiMiddleware("email", { strategy: "redact", applyToToolResults: true }),
      piiMiddleware("credit_card", { strategy: "mask", applyToToolResults: true }),
      spion, // ultimul = cel mai inauntru = vede rezultatul redactarii
    ] as const,
  });

  await arataGraful(agent);

  const rezultat = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content:
            "Cauta clientul ionel.popescu si spune-mi cum e vremea in orasul lui.",
        },
      ],
    },
    { recursionLimit: 25 },
  );

  arataMesajele(rezultat.messages as any);
  console.log(
    `\n< Raspuns: ${rezultat.messages[rezultat.messages.length - 1].content}\n`,
  );
  console.log(
    "Intrebare pentru sala: emailul nu mai apare nicaieri. Daca agentul ar\n" +
      "trebui acum sa TRIMITA un email clientului, de unde ar lua adresa?\n" +
      "Raspuns: de nicaieri. De asta tool-urile primesc idClient, nu adresa.\n",
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIUL 2 · SUMMARIZATION
// ═══════════════════════════════════════════════════════════════════════════
//
// Ca sa se declanseze, istoricul trebuie sa fie deja lung. Il construim noi,
// cu zece mesaje false, apoi punem intrebarea a unsprezecea.
//
// Ce trebuie sa se vada: in cutia «CE AJUNGE LA MODEL» nu sunt unsprezece
// mesaje, ci patru-cinci, dintre care primul e un rezumat scris de model.
function istoricLung() {
  const schimburi: [string, string][] = [
    ["Salut, planific o vacanta in Italia in septembrie.", "Salut. Ce orase te intereseaza?"],
    ["Ma gandeam la Roma si Florenta.", "Bune alegeri. Cate zile ai la dispozitie?"],
    ["Cam zece zile.", "Atunci ai timp pentru amandoua, cu doua zile in plus."],
    ["Bugetul e cam 1500 de euro de persoana.", "Rezonabil pentru zece zile, fara zboruri scumpe."],
    ["Prefer hoteluri in centru.", "Notat: cazare centrala in ambele orase."],
  ];
  const mesaje = [];
  for (const [om, ai] of schimburi) {
    mesaje.push(new HumanMessage(om));
    mesaje.push(new AIMessage(ai));
  }
  return mesaje; // 10 mesaje
}

async function scenariulSumar() {
  console.log("\n═══ SCENARIUL 2 · SUMMARIZATION ═══");

  const agent = createAgent({
    model,
    tools: [...toolCalatorie, ...toolAgentie],
    systemPrompt:
      "Esti asistentul unei agentii de turism. Raspunzi scurt, in romana.",
    middleware: [
      summarizationMiddleware({
        model, // aici poti pune un model ieftin. rezumatul e o sarcina simpla.
        trigger: { messages: 8 }, // se declanseaza peste 8 mesaje
        keep: { messages: 4 }, // ultimele 4 raman neatinse

        // 10 mesaje in istoric plus intrebarea noua sunt 11 ; 11-4 = 7 
        //primele 7 merg la summarization, ultimele 4 raman neatinse, deci se pierd




        // CAPCANA PENTRU CURSURI IN ROMANA: implicit, pachetul foloseste un
        // prompt de rezumare in engleza si prefixul
        //   'Here is a summary of the conversation to date:'
        // Rezultatul e un rezumat in engleza lipit intr-o conversatie in
        // romana. Ambele se pot suprascrie:
        summaryPrefix: "Rezumatul conversatiei de pana acum:",
        summaryPrompt:
          "Esti un asistent care extrage contextul esential dintr-o " +
          "conversatie. Rezuma in ROMANA, in cel mult 150 de cuvinte, " +
          "pastrand cifrele exacte, numele proprii si deciziile luate. " +
          "Nu inventa nimic care nu apare in conversatie.\n\n" +
          "Conversatia:\n{messages}",
      }),
      spion,
    ] as const,
  });

  await arataGraful(agent);

  const istoric = istoricLung();
  console.log(`\n  Pornim cu ${istoric.length} mesaje in istoric, plus intrebarea noua.`);
  console.log("  Pragul e 8, deci summarization ar trebui sa intervina.");

  const rezultat = await agent.invoke(
    { messages: [...istoric, new HumanMessage("Cum e vremea in Roma acum?")] },
    { recursionLimit: 25 },
  );

  arataMesajele(rezultat.messages as any);
  console.log(
    `\n< Raspuns: ${rezultat.messages[rezultat.messages.length - 1].content}\n`,
  );
  console.log(
    "Intrebare pentru sala: bugetul de 1500 de euro mai apare in rezumat?\n" +
      "Daca nu, agentul l-a uitat. Asta e pretul compresiei.\n",
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIUL 3 · PLAFON DE APELURI DE TOOL
// ═══════════════════════════════════════════════════════════════════════════
//
// Cerem vremea in sase orase, cu plafonul pus la trei. Agentul se opreste
// elegant dupa al treilea apel si raspunde cu ce a apucat sa afle.
async function scenariulLimita() {
  console.log("\n═══ SCENARIUL 3 · PLAFON DE APELURI DE TOOL ═══");

  const agent = createAgent({
    model,
    tools: [...toolCalatorie, ...toolAgentie],
    systemPrompt:
      "Esti asistentul unei agentii de turism. Raspunzi scurt, in romana.",
    middleware: [
      toolCallLimitMiddleware({ runLimit: 3, exitBehavior: "end" }),
      spion,
    ] as const,
  });

  const rezultat = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content:
            "Spune-mi vremea in Roma, Atena, Madrid, Lisabona, Viena si Praga.",
        },
      ],
    },
    { recursionLimit: 50 },
  );

  const apeluriTool = (rezultat.messages as any[]).filter(
    (m) => m.getType() === "tool",
  ).length;

  arataMesajele(rezultat.messages as any);
  console.log(`\n  Apeluri de tool executate: ${apeluriTool} (plafonul era 3)`);
  console.log(
    `\n< Raspuns: ${rezultat.messages[rezultat.messages.length - 1].content}\n`,
  );
  console.log(
    "Intrebare pentru sala: agentul a crapat sau a raspuns? Cu exitBehavior\n" +
      "'end' se opreste elegant si intoarce ce are. Cu 'error' ar fi aruncat.\n",
  );
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  const scenariu = (process.argv[2] ?? "pii").toLowerCase();

  if (scenariu === "pii") await scenariulPii();
  else if (scenariu === "sumar") await scenariulSumar();
  else if (scenariu === "limita") await scenariulLimita();
  else {
    console.log("Scenarii valide: pii | sumar | limita");
    console.log("  npx tsx lab9/demo3-prebuilt.ts pii");
    console.log("  npx tsx lab9/demo3-prebuilt.ts sumar");
    console.log("  npx tsx lab9/demo3-prebuilt.ts limita");
  }
}

main().catch(console.error);
