// tema1/tools.ts
//
// Cele doua tool-uri ale agentului de suport. «Baza de date» e falsa, in memorie.
// Regula din tema: tool-ul intoarce DOAR ultimele 4 cifre ale cardului, deci
// datele sensibile nu ies deloc in clar. Emailul, in schimb, iese in clar din
// tool — acolo intra piiMiddleware si il mascheaza.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

const CLIENTI_SUPORT: Record<
  string,
  {
    nume: string;
    email: string;
    plan: "free" | "pro" | "enterprise";
    ultimele4CifreCard: string;
  }
> = {
  "cl-101": {
    nume: "Ana Radu",
    email: "ana.radu@example.com",
    plan: "pro",
    ultimele4CifreCard: "4242",
  },
  "cl-102": {
    nume: "Mihai Pop",
    email: "mihai.pop@acme.ro",
    plan: "enterprise",
    ultimele4CifreCard: "1881",
  },
  "cl-103": {
    nume: "Elena Marin",
    email: "elena.marin@gmail.com",
    plan: "free",
    ultimele4CifreCard: "0005",
  },
};

export const cautaClientSuport = tool(
  async ({ idClient }: { idClient: string }) => {
    const c = CLIENTI_SUPORT[idClient.toLowerCase().trim()];
    if (!c) {
      return (
        `Nu exista clientul '${idClient}'. ` +
        `ID-uri valide: ${Object.keys(CLIENTI_SUPORT).join(", ")}.`
      );
    }
    return (
      `Client: ${c.nume} | email: ${c.email} | plan: ${c.plan} | ` +
      `card: **** **** **** ${c.ultimele4CifreCard}`
    );
  },
  {
    name: "cautaClientSuport",
    description:
      "Cauta datele unui client de suport dupa ID. Intoarce nume, email, plan " +
      "(free | pro | enterprise) si ultimele 4 cifre ale cardului. " +
      "Exemplu intrare: { idClient: 'cl-101' }.",
    schema: z.object({
      idClient: z.string().describe("ID-ul clientului, ex: 'cl-101'."),
    }),
  },
);

/** Tichetele escaladate catre om — exportat ca sa poata fi verificat din afara conversatiei. */
export const ticheteEscaladate: string[] = [];

export const escaladeazaTicket = tool(
  async ({ idTicket, motiv }: { idTicket: string; motiv: string }) => {
    // EFECT IREVERSIBIL: tichetul trece la un om.
    ticheteEscaladate.push(`${idTicket}: escaladat catre om (${motiv})`);
    return `Tichetul ${idTicket} a fost escaladat catre om. Motiv: ${motiv}.`;
  },
  {
    name: "escaladeazaTicket",
    description:
      "ESCALADEAZA un tichet catre un om. Actiune ireversibila. Foloseste-l " +
      "doar daca problema e prea complicata sau clientul e nemultumit. " +
      "Exemplu intrare: { idTicket: 'T-1', motiv: 'client nemultumit' }.",
    schema: z.object({
      idTicket: z.string().describe("ID-ul tichetului, ex: 'T-1'."),
      motiv: z.string().describe("Motivul escaladarii."),
    }),
  },
);

export const toolSuport = [cautaClientSuport, escaladeazaTicket];
