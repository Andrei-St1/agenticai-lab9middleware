// lab9/middleware/audit.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE CUSTOM #1 — auditLogger
// ═══════════════════════════════════════════════════════════════════════════
//
// ELEMENT NOU: createMiddleware
//   Din ce pachet:  "langchain"  (pachetul principal, nu @langchain/core)
//   Ce e:           o fabrica de middleware. Ii dai un nume si unul sau mai
//                   multe hook-uri, iti da un obiect pe care il pui in lista
//                   `middleware: [...]` din createAgent.
//   La ce e bun:    scoate din agent tot ce NU tine de logica lui — logging,
//                   masurare, retry, autentificare, limite de cost.
//
// CE FACE ACEST MIDDLEWARE
//   Masoara fiecare apel de model si fiecare apel de tool: cat a durat, cati
//   tokeni s-au consumat, cat a costat. La finalul rularii tipareste un tabel.
//
// DE CE E UTIL IN PRODUCTIE
//   E prima intrebare pe care ti-o pune managerul cand pui un agent in
//   productie: «cat ma costa o conversatie?». Fara un middleware ca asta,
//   raspunsul e «nu stiu». Cu el, e o cifra.
//
// HOOK-URILE FOLOSITE (ambele sunt WRAP-style, adica infasoara un apel):
//   wrapModelCall(request, handler) → decizi TU cand se cheama handler(request)
//   wrapToolCall(request, handler)  → idem, pentru executia unui tool
//
// DETALIU IMPORTANT: hook-urile wrap NU adauga noduri in graf. Ele se aseaza
// IN INTERIORUL nodului existent (model_request, respectiv tools). Doar
// hook-urile node-style (beforeModel / afterModel / beforeAgent / afterAgent)
// adauga noduri noi. Se vede ruland demo2-ordine.ts.

import { createMiddleware } from "langchain";
import { calculateCost, formatCost } from "../../lib/cost.js";

// ───────────────────────────────────────────────────────────────────────────
// Jurnalul rularii curente. Il tinem intr-o variabila de modul, nu in state-ul
// agentului, din doua motive:
//   1. wrapModelCall trebuie sa intoarca un AIMessage, nu o actualizare de
//      stare — deci n-are cum sa scrie in state.
//   2. sunt date de observabilitate, nu date de care modelul are nevoie.
//      Regula de context engineering: nu baga in state ce nu ajuta modelul.
// ───────────────────────────────────────────────────────────────────────────
type IntrareJurnal = {
  fel: "model" | "tool";
  nume: string;
  ms: number;
  tokenIn: number;
  tokenOut: number;
  cost: number;
};

export const jurnal: IntrareJurnal[] = [];

/** Goleste jurnalul. Utila intre doua rulari din acelasi proces. */
export function resetJurnal(): void {
  jurnal.length = 0;
}

/**
 * Curata numele modelului ca sa se potriveasca cu tabelul din lib/cost.ts.
 * Providerii intorc adesea nume cu data lipita la coada:
 *   'claude-haiku-4-5-20251001' → 'claude-haiku-4-5'
 * Fara pasul asta, calculateCost intoarce 0 si te intrebi de ce.
 */
function numeModelCurat(brut: string): string {
  return brut
    .replace(/-\d{4}-\d{2}-\d{2}$/, "") // Azure/OpenAI: gpt-4o-mini-2024-07-18
    .replace(/-\d{8}$/, "") // Anthropic: claude-haiku-4-5-20251001
    .toLowerCase();
}

/** Gemini (și alții) nu pun modelul în response_metadata; îl luăm din request. */
function numeDinRequest(request: { model?: unknown }): string | undefined {
  const m = request.model as { model?: string; modelName?: string } | undefined;
  return m?.model ?? m?.modelName;
}

/**
 * Fabrica de middleware. O functie care intoarce middleware, nu middleware-ul
 * direct — asa poti avea doua instante cu setari diferite in acelasi agent.
 */
export function auditLogger(optiuni: { verbose?: boolean } = {}) {
  const verbose = optiuni.verbose ?? true;

  return createMiddleware({
    name: "AuditLogger",

    // ─────────────────────────────────────────────────────────────────────
    // wrapModelCall — infasoara apelul de model.
    //
    // `request` contine tot ce pleaca spre model: model, messages,
    // systemMessage, tools, state, runtime.
    // `handler` e functia care CHIAR cheama modelul. Daca n-o chemi, modelul
    // nu e chemat deloc (asa se implementeaza un cache).
    // ─────────────────────────────────────────────────────────────────────
    wrapModelCall: async (request, handler) => {
      const t0 = Date.now();

      // Apelul real. Tot ce e inainte de linia asta se intampla inainte de
      // model, tot ce e dupa, dupa. De asta se numeste «wrap».
      const raspuns = await handler(request);

      const ms = Date.now() - t0;

      // usage_metadata e standardizat in LangChain v1 pentru toti providerii.
      // Poate lipsi la modele fake sau la unele modele locale — de aceea ?? 0.
      const tokenIn = raspuns.usage_metadata?.input_tokens ?? 0;
      const tokenOut = raspuns.usage_metadata?.output_tokens ?? 0;

      const numeBrut =
        (raspuns.response_metadata?.model_name as string | undefined) ??
        (raspuns.response_metadata?.model as string | undefined) ??
        numeDinRequest(request) ??
        "necunoscut";
      const nume = numeModelCurat(numeBrut);

      const cost = calculateCost(nume, tokenIn, tokenOut);
      jurnal.push({ fel: "model", nume, ms, tokenIn, tokenOut, cost });

      if (verbose) {
        console.log(
          `  [audit] model ${nume} · ${ms} ms · ` +
            `${tokenIn} in / ${tokenOut} out · ${formatCost(cost)}`,
        );
      }

      // OBLIGATORIU: intoarcem raspunsul mai departe. Daca uiti return-ul,
      // agentul primeste undefined si crapa cu un mesaj greu de citit.
      return raspuns;
    },

    // ─────────────────────────────────────────────────────────────────────
    // wrapToolCall — infasoara executia unui tool.
    // `request.toolCall` = ce a cerut modelul (name + args).
    // `request.tool`     = instanta de tool (poate fi undefined la tool-uri
    //                      inregistrate dinamic).
    // ─────────────────────────────────────────────────────────────────────
    wrapToolCall: async (request, handler) => {
      const t0 = Date.now();
      const rezultat = await handler(request);
      const ms = Date.now() - t0;

      jurnal.push({
        fel: "tool",
        nume: request.toolCall.name,
        ms,
        tokenIn: 0,
        tokenOut: 0,
        cost: 0,
      });

      if (verbose) {
        console.log(`  [audit] tool  ${request.toolCall.name} · ${ms} ms`);
      }

      return rezultat;
    },

    // ─────────────────────────────────────────────────────────────────────
    // afterAgent — ruleaza O SINGURA DATA, la sfarsitul rularii.
    // Aici tiparim raportul. Spre deosebire de cele doua de mai sus, hook-ul
    // asta ADAUGA UN NOD in graf: «AuditLogger.after_agent».
    // ─────────────────────────────────────────────────────────────────────
    afterAgent: async () => {
      tipareteRaport();
      // Nu modificam starea, deci nu intoarcem nimic.
      // `undefined` inseamna «las-o cum e».
      return undefined;
    },
  });
}

/** Tipareste tabelul final. Exportata ca s-o poti chema si manual. */
export function tipareteRaport(): void {
  if (jurnal.length === 0) return;

  const apeluriModel = jurnal.filter((i) => i.fel === "model");
  const apeluriTool = jurnal.filter((i) => i.fel === "tool");
  const costTotal = jurnal.reduce((s, i) => s + i.cost, 0);
  const msTotal = jurnal.reduce((s, i) => s + i.ms, 0);
  const tokenInTotal = jurnal.reduce((s, i) => s + i.tokenIn, 0);
  const tokenOutTotal = jurnal.reduce((s, i) => s + i.tokenOut, 0);

  console.log("\n┌─ RAPORT AUDIT ─────────────────────────────────────────┐");
  for (const i of jurnal) {
    const eticheta = i.fel === "model" ? "model" : "tool ";
    const tokeni =
      i.fel === "model" ? `${i.tokenIn} in / ${i.tokenOut} out` : "-";
    console.log(
      `│ ${eticheta} ${i.nume.padEnd(22)} ${String(i.ms).padStart(6)} ms  ` +
        `${tokeni.padEnd(20)} ${formatCost(i.cost)}`,
    );
  }
  console.log("├────────────────────────────────────────────────────────┤");
  console.log(
    `│ TOTAL: ${apeluriModel.length} apeluri model · ` +
      `${apeluriTool.length} apeluri tool · ${msTotal} ms`,
  );
  console.log(
    `│ TOKENI: ${tokenInTotal} in / ${tokenOutTotal} out · ` +
      `COST: ${formatCost(costTotal)}`,
  );
  console.log("└────────────────────────────────────────────────────────┘\n");
}
