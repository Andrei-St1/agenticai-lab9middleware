// lab9/middleware/program.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE CUSTOM #3 (BONUS) — programDeLucru
// ═══════════════════════════════════════════════════════════════════════════
//
// De ce e aici desi n-am cerut-o: e singurul din lab care aduce doua primitive
// pe care nu le vezi in audit sau costGuard:
//   1. STARE CUSTOM cu Zod  (stateSchema)
//   2. jumpTo                (scurtcircuitarea grafului)
// Sunt in curricula la «custom state». Daca ramai fara timp, e primul de taiat.
//
// CE FACE
//   In afara programului (sau in weekend), agentul nu mai cheama modelul deloc.
//   Raspunde cu un mesaj fix si opreste rularea. Costa zero tokeni.
//
// DE CE E UN EXEMPLU BUN DE BUSINESS
//   Orice agent expus public are o factura care creste noaptea, cand nu se
//   uita nimeni. Un middleware de 20 de linii pune capac pe intervalul in care
//   oricum n-ai pe cine escalada. Acelasi pattern se foloseste pentru:
//   utilizator peste cota, cont suspendat, mentenanta planificata.
//
// ELEMENT NOU: stateSchema
//   Din ce pachet:  parametru al createMiddleware, din "langchain"
//   Ce e:           un obiect Zod care se ADAUGA la starea agentului.
//                   Campurile declarate aici apar in `state` in toate
//                   hook-urile si in rezultatul final al rularii.
//   La ce e bun:    middleware-ul isi tine propriile date fara sa polueze
//                   `messages` si fara variabile globale.
//
// ELEMENT NOU: jumpTo
//   Ce e:           un camp special pe care il poti pune in obiectul returnat
//                   de un hook node-style. Valori: 'model' | 'tools' | 'end'.
//   La ce e bun:    sari peste restul grafului. 'end' = opreste rularea acum.
//   Atentie:        trebuie sa declari tintele in `canJumpTo`, altfel graful
//                   nu are muchia respectiva si saritura e ignorata.

import { createMiddleware } from "langchain";
import { AIMessage } from "@langchain/core/messages";
import { z } from "zod";

/** Programul agentiei: luni-vineri, 9:00-18:00, ora Bucurestiului. */
const ORA_START = 9;
const ORA_STOP = 18;

/**
 * Verifica daca momentul dat cade in program.
 * Primeste data ca parametru (nu citeste `new Date()` inauntru) ca sa poti
 * testa ambele ramuri fara sa astepti pana noaptea. Regula generala pentru
 * middleware: tine timpul, randomul si retelele la marginea functiei.
 */
export function inProgram(d: Date): boolean {
  const zi = d.getDay(); // 0 = duminica, 6 = sambata
  if (zi === 0 || zi === 6) return false;
  const ora = d.getHours();
  return ora >= ORA_START && ora < ORA_STOP;
}

export function programDeLucru(optiuni: { acum?: () => Date } = {}) {
  const acum = optiuni.acum ?? (() => new Date());

  return createMiddleware({
    name: "ProgramDeLucru",

    // Starea proprie a middleware-ului. `default` e obligatoriu, altfel campul
    // e undefined la prima rulare si te trezesti cu erori de tip in hook-uri.
    stateSchema: z.object({
      inAfaraProgramului: z.boolean().default(false),
    }),

    // Forma de obiect a hook-ului: { hook, canJumpTo }.
    // Forma scurta (doar functia) nu poate sari nicaieri.
    beforeAgent: {
      canJumpTo: ["end"],
      hook: async () => {
        const d = acum();
        if (inProgram(d)) {
          // In program: nu facem nimic, lasam agentul sa mearga normal.
          return { inAfaraProgramului: false };
        }

        console.log("  [program] in afara programului → oprim fara apel de model");

        // Returnam simultan: un mesaj pentru utilizator, campul nostru de
        // stare, si saritura la final. Toate trei intr-un singur obiect.
        return {
          messages: [
            new AIMessage(
              "Agentia e inchisa acum. Program: luni-vineri, 9:00-18:00. " +
                "Revino in interval sau lasa un mesaj la receptie.",
            ),
          ],
          inAfaraProgramului: true,
          jumpTo: "end" as const,
        };
      },
    },
  });
}
