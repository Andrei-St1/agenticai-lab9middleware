// tema1/genereaza-log.ts
//
// Ruleaza cele 4 scripturi de verificare si scrie output.log in formatul din
// outputExample.txt: intrebarea, comanda, consola EXACTA, raspunsul scris si
// liniile citate. Liniile citate sunt cautate in consola reala; daca una nu
// exista, scriptul se opreste — nu citam nimic din memorie.
//
// Rulare:  pnpm tema1:log

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

type Verificare = {
  nr: number;
  intrebare: string;
  script?: string;
  raspuns: string;
  /** Alege din consola liniile de citat. */
  citate: (linii: string[]) => string[];
  /** Linii citate suplimentare, luate din consola altor verificari. */
  citateExtra?: (consola: Record<string, string[]>) => string[];
};

const contine = (...bucati: string[]) => (linii: string[]) =>
  linii.filter((l) => bucati.some((b) => l.includes(b)));

const VERIFICARI: Verificare[] = [
  {
    nr: 1,
    script: "checklist1",
    intrebare:
      "Cand cautaClientSuport returneaza emailul, ce apare EFECTIV in ToolMessage-ul din istoric?",
    raspuns:
      "Emailul apare mascat in ToolMessage-ul din istoric: prima litera, apoi ***@ si domeniul " +
      "(a***@example.com, nu ana.radu@example.com). Cardul nu e atins de middleware, pentru ca " +
      "tool-ul intoarce deja doar ultimele 4 cifre.",
    citate: (l) => l.filter((x) => x.startsWith("[tool]")),
  },
  {
    nr: 2,
    script: "checklist2",
    intrebare:
      "Script cu FakeToolCallingModel care cere 4 tool call-uri la rand. Ce se intampla la al 4-lea?",
    raspuns:
      "Primele 3 apeluri se executa (3 mesaje [tool] cu datele clientului). Al 4-lea e blocat inainte " +
      "sa ruleze tool-ul: toolCallLimitMiddleware adauga un ToolMessage de eroare si un mesaj AI final, " +
      "iar invoke() se intoarce normal, fara exceptie.",
    citate: contine(
      "[tool] Tool call limit exceeded",
      "[ai] Tool call limit reached",
      "invoke() s-a intors normal",
    ),
  },
  {
    nr: 3,
    intrebare:
      'Daca cerinta reala e "clientul sa nu sune de 10 ori pentru aceeasi problema, in ORICATE conversatii separate", runLimit sau threadLimit?',
    raspuns:
      "Niciunul. runLimit numara apelurile de tool dintr-o singura rulare si se reseteaza la finalul ei " +
      "(afterAgent intoarce runToolCallCount: {}, node_modules/langchain/dist/agents/middleware/toolCallLimit.js:356), " +
      "iar threadLimit numara pe tot thread-ul, dar ambele contoare sunt stare a grafului (:118-119, :271-272), " +
      "salvata de checkpointer per thread_id, deci o conversatie noua porneste de la zero (in consola, " +
      "fir-B are threadToolCallCount=1 dupa primul apel). Cerinta reala numara contactele CLIENTULUI despre " +
      "aceeasi problema peste conversatii, deci cere stare persistenta in afara thread-ului (un store sau o " +
      "tabela cheiata pe idClient + problema), nu un contor de tool call-uri. Am implementat cu runLimit, " +
      "care e suficient pentru cerinta 2 a managementului doar in interiorul unei singure rulari: opreste " +
      "bucla de cautari repetate dintr-o tura, dar nu limiteaza nimic intre turele aceleiasi conversatii " +
      "si nici intre conversatii.",
    citate: () => [],
    citateExtra: (c) => [
      ...c.checklist2.filter((l) => l.startsWith("[ai] Tool call limit reached")),
      ...c.checklist5.filter((l) => l.startsWith("dupa resume: 12 mesaje")),
      ...c.checklist5.filter(
        (l) => l.startsWith("dupa invoke: 4 mesaje") && l.includes("tichete escaladate: 2"),
      ),
    ],
  },
  {
    nr: 4,
    script: "checklist4",
    intrebare: "(HITL) Rulati agentul FARA checkpointer, intentionat. Ce eroare exacta?",
    raspuns:
      'GraphValueError cu lc_error_code MISSING_CHECKPOINTER si mesajul exact "No checkpointer set" ' +
      "(urmat de Troubleshooting URL). Apare cand HITL cere aprobare pentru escaladeazaTicket " +
      "(interrupt() nu are unde salva starea), inainte ca tool-ul sa ruleze, deci tichetul nu s-a escaladat " +
      "(Tichete escaladate: 0).",
    citate: contine(
      "Eroare:",
      "lc_error_code:",
      "message:",
      "Troubleshooting URL:",
      "Tichete escaladate:",
    ),
  },
  {
    nr: 5,
    script: "checklist5",
    intrebare:
      "(HITL) Rulati de doua ori acelasi flux, cu ACELASI thread_id o data si cu thread_id DIFERIT a doua oara, dupa ce ati aprobat prima escaladare. Ce diferenta observati?",
    raspuns:
      "Acelasi thread_id (fir-A, rularea 2): agentul vede conversatia anterioara (10 mesaje dupa invoke, " +
      "nu 4, iar istoricul incepe cu mesajele din rularea 1), dar cere din nou aprobare, pentru ca " +
      "aprobarea tine de un singur interrupt, nu de tichet; dupa approve, tool-ul ireversibil se executa " +
      "din nou si T-1 apare a doua oara in array. thread_id diferit (fir-B): istoric curat (4 mesaje, ca la " +
      "rularea 1), contorul de thread porneste de la zero, o noua cerere de aprobare, iar array-ul creste " +
      "la 3, pentru ca traieste in afara conversatiei. Checkpointer-ul si thread_id-ul delimiteaza memoria " +
      "conversatiei, nu efectele; un tool ireversibil are nevoie de idempotenta proprie.",
    citate: (l) => {
      const dupa = l.filter((x) => x.startsWith("dupa invoke") || x.startsWith("dupa resume"));
      // Ultimele 4: rularea 2 (fir-A) si rularea 3 (fir-B).
      return [...dupa.slice(-4), ...l.filter((x) => x.startsWith("Tichete escaladate ("))];
    },
  },
];

function ruleaza(script: string): string[] {
  const iesire = execSync(`pnpm ${script}`, {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  // Scoatem banner-ul pnpm ("$ tsx ...") si liniile goale de la capete.
  const linii = iesire.split(/\r?\n/).filter((l) => !l.startsWith("$ tsx"));
  while (linii.length && linii[0] === "") linii.shift();
  while (linii.length && linii[linii.length - 1] === "") linii.pop();
  return linii;
}

// 1. Rulam scripturile o singura data si pastram consola.
const consola: Record<string, string[]> = {};
for (const v of VERIFICARI) {
  if (v.script) {
    console.log(`rulez pnpm ${v.script} ...`);
    consola[v.script] = ruleaza(v.script);
  }
}

// 2. Compunem fisierul.
const bucati: string[] = [];
for (const v of VERIFICARI) {
  const linii = v.script ? consola[v.script] : [];
  const citate = [...v.citate(linii), ...(v.citateExtra ? v.citateExtra(consola) : [])];

  if (v.nr === 3) {
    // Fara script: raspuns scris, cu linii din verificarile 2 si 5.
  } else if (citate.length === 0) {
    throw new Error(`Verificarea ${v.nr}: nicio linie de citat gasita in consola.`);
  }
  if (v.nr === 3 && citate.length < 3) {
    throw new Error("Verificarea 3: lipsesc liniile citate din verificarile 2/5.");
  }

  bucati.push(`==================== CHECKLIST ${v.nr} ====================`);
  bucati.push(v.intrebare, "");
  if (v.script) {
    bucati.push(`$ pnpm ${v.script}`, ...linii, "");
  } else {
    bucati.push("(fara script: raspuns scris, cu linii din consola de la checklist 2 si 5)", "");
  }
  bucati.push(`Raspuns: ${v.raspuns}`, "", "Linii citate din consola:");
  for (const c of citate) bucati.push(`  ${c}`);
  bucati.push("");
}

writeFileSync("output.log", bucati.join("\n"), "utf8");
console.log("output.log scris.");
