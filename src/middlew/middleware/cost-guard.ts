// lab9/middleware/cost-guard.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE CUSTOM #2 — costGuard
// ═══════════════════════════════════════════════════════════════════════════
//
// CE FACE
//   Alege modelul la fiecare tura: model ieftin pentru intrebari simple,
//   model scump pentru cele complicate. Agentul nu stie ca se intampla asta.
//
// DE CE E EXEMPLUL DE BUSINESS CEL MAI DIRECT
//   Intr-un agent de suport, 70-80% din ture sunt banale: «mai are camera
//   balcon?», «la ce ora e check-in». Alea nu au nevoie de modelul de 15 dolari
//   pe milionul de tokeni de output. Diferenta de pret intre un haiku si un
//   sonnet e ~3x la input si ~3x la output. Aplicata pe 80% din trafic, aia e
//   factura injumatatita, cu acelasi cod de agent.
//
// HOOK FOLOSIT: wrapModelCall
//   Singurul hook din care poti SCHIMBA modelul. beforeModel poate schimba
//   starea, dar nu si cine e chemat. Regula de retinut:
//     vrei sa schimbi CE se trimite sau CINE primeste → wrapModelCall
//     vrei sa schimbi STAREA                          → beforeModel / afterModel
//
// CAPCANA PE CARE O DEMONSTRAM IN CLASA
//   «Simpla» se decide pe ULTIMUL mesaj de la om, nu pe toata conversatia.
//   Dupa ce ruleaza tool-urile, urmatoarea tura are in coada un ToolMessage,
//   nu o intrebare noua — deci euristica trebuie sa caute inapoi ultimul
//   HumanMessage. Daca nu faci asta, a doua tura nimereste mereu pe ramura
//   gresita. Este bug-ul clasic la middleware-urile de routing.

import { createMiddleware } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createModel, readProviderFromEnv, type LlmProvider } from "../../lib/llm.js";

// ───────────────────────────────────────────────────────────────────────────
// Cuvintele care trag catre modelul scump. Euristica didactica, pe regex.
// In productie clasifici cu un model mic si rapid (vezi Lab 3, smart routing),
// sau te uiti la lungimea intrebarii si la numarul de tool-uri necesare.
// ───────────────────────────────────────────────────────────────────────────
const CUVINTE_GRELE =
  /compar|analiz|de ce|explica|planific|itinerar|recomand|cel mai (bun|ieftin)|avantaj|dezavantaj/i;

/** Pragul peste care o intrebare e considerata «lunga», deci probabil complexa. */
const PRAG_LUNGIME = 120;

/**
 * Decide daca intrebarea e simpla. Simpla = model ieftin.
 * Exportata separat ca s-o poti testa fara agent — un middleware testabil e un
 * middleware in care ai incredere.
 */
export function esteSimpla(text: string): boolean {
  if (text.length > PRAG_LUNGIME) return false;
  // Scoatem diacriticele inainte de regex: «Explică-mi» nu se potrivea cu
  // «explica», deci o intrebare grea ajungea pe modelul ieftin.
  const fara = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (CUVINTE_GRELE.test(fara)) return false;
  return true;
}

/** Scoate textul ultimului mesaj de la om din istoricul conversatiei. */
function ultimaIntrebareUmana(mesaje: { getType(): string; content: unknown }[]): string {
  for (let i = mesaje.length - 1; i >= 0; i--) {
    const m = mesaje[i];
    if (m.getType() === "human") {
      return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    }
  }
  return "";
}

/**
 * Fabrica de middleware.
 *
 * Cum alegem «ieftin» si «scump» cu abstractia din lib/llm.ts: acolo modelul e
 * legat de PROVIDER, nu de numele modelului. Deci comutam intre doi provideri:
 *   - scump  = LLM_PROVIDER        (ce ai in .env, providerul tau obisnuit)
 *   - ieftin = LLM_PROVIDER_IEFTIN (ex: 'ollama' local, sau 'gemini' cu flash)
 *
 * Daca LLM_PROVIDER_IEFTIN nu e setat, folosim acelasi provider pentru ambele.
 * Mecanismul se vede in continuare in consola, dar economia e zero — si spunem
 * asta explicit, ca sa nu para ca demo-ul face mai mult decat face.
 */
export function costGuard(
  // Parametrii sunt optionali si servesc la TESTE: poti injecta doua modele
  // fake si verifici ca middleware-ul alege ramura buna, fara sa platesti
  // tokeni. Un middleware pe care nu-l poti testa e un middleware in care nu ai
  // incredere cand te trezesti cu factura.
  optiuni: { modelIeftin?: BaseChatModel; modelScump?: BaseChatModel } = {},
) {
  // Construim modelele O SINGURA DATA, la crearea middleware-ului.
  // Daca le-ai construi in interiorul hook-ului, ai instantia un client HTTP
  // nou la fiecare tura — risipa si, la unii provideri, rate limit.
  const providerScump = optiuni.modelScump ? "injectat" : readProviderFromEnv();
  const providerIeftin = optiuni.modelIeftin
    ? "injectat"
    : ((process.env.LLM_PROVIDER_IEFTIN ?? providerScump) as LlmProvider);

  const modelScump: BaseChatModel =
    optiuni.modelScump ?? createModel(providerScump as LlmProvider);
  const modelIeftin: BaseChatModel =
    optiuni.modelIeftin ??
    (providerIeftin === providerScump
      ? modelScump
      : createModel(providerIeftin as LlmProvider));

  const acelasiModel = modelIeftin === modelScump;

  return createMiddleware({
    name: "CostGuard",

    wrapModelCall: async (request, handler) => {
      const intrebare = ultimaIntrebareUmana(request.messages as any);
      const simpla = esteSimpla(intrebare);

      const model = simpla ? modelIeftin : modelScump;
      const etichetaProvider = simpla ? providerIeftin : providerScump;

      console.log(
        `  [cost] intrebare ${simpla ? "SIMPLA" : "COMPLEXA"} → provider ` +
          `${etichetaProvider}${acelasiModel ? " (identic, doar demo)" : ""}`,
      );

      // Spread peste request: pastram tot (messages, tools, systemMessage,
      // state, runtime) si inlocuim doar modelul. Asta e patternul de baza
      // pentru orice wrapModelCall: { ...request, ceva: altceva }.
      return handler({ ...request, model });
    },
  });
}
