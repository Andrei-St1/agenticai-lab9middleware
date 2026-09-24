// lab9/tools/agentie.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// TOOL-URI NOI PENTRU LAB 9 — cele doua lucruri pe care middleware-ul le cere
// ═══════════════════════════════════════════════════════════════════════════
//
// De ce avem nevoie de ele: middleware-urile pre-built nu se pot demonstra pe
// tool-uri inofensive. Ca sa ai un motiv REAL sa pui HITL sau PII redaction,
// iti trebuie:
//
//   1. un tool care SCRIE ceva ireversibil  → rezervaHotel  → HITL
//   2. un tool care intoarce date personale → cautaClient   → PII middleware
//
// Datele sunt FALSE, scrise de noi, in memorie. Nu ne trebuie DB pentru lab.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ───────────────────────────────────────────────────────────────────────────
// «Baza de date» a agentiei: trei clienti, in memorie.
// Observa ca fiecare are email si card — exact tipurile pe care
// piiMiddleware le recunoaste din oficiu (email, credit_card).
// ───────────────────────────────────────────────────────────────────────────
const CLIENTI: Record<
  string,
  { nume: string; email: string; card: string; oras: string }
> = {
  "ionel.popescu": {
    nume: "Ionel Popescu",
    email: "ionel.popescu@example.com",
    card: "4111 1111 1111 1111",
    oras: "Cluj-Napoca",
  },
  "maria.ionescu": {
    nume: "Maria Ionescu",
    email: "maria.ionescu@example.com",
    card: "5500 0000 0000 0004",
    oras: "Iasi",
  },
  "andrei.dumitru": {
    nume: "Andrei Dumitru",
    email: "andrei.dumitru@example.com",
    card: "3400 0000 0000 009",
    oras: "Timisoara",
  },
};

// ───────────────────────────────────────────────────────────────────────────
// TOOL 4 — CAUTA CLIENT
// Intoarce date personale. Fara middleware, emailul si cardul pleaca
// nefiltrate catre provider-ul de model. Cu piiMiddleware, nu.
// ───────────────────────────────────────────────────────────────────────────
export const cautaClient = tool(
  async ({ idClient }: { idClient: string }) => {
    const c = CLIENTI[idClient.toLowerCase().trim()];
    if (!c) {
      // Mesaj lizibil CU exemple valide — regula din tema de la Lab 7-8.
      return (
        `Nu exista clientul '${idClient}'. ` +
        `ID-uri valide: ${Object.keys(CLIENTI).join(", ")}.`
      );
    }
    return (
      `Client ${c.nume} | email: ${c.email} | card: ${c.card} | oras: ${c.oras}`
    );
  },
  {
    name: "cautaClient",
    description:
      "Cauta datele unui client dupa ID. Intoarce nume, email, card si oras. " +
      "Foloseste-l inainte de a face o rezervare, ca sa stii pe numele cui e. " +
      "Exemplu intrare: { idClient: 'ionel.popescu' }. " +
      "Exemplu iesire: 'Client Ionel Popescu | email: ... | card: ... | oras: Cluj-Napoca'.",
    schema: z.object({
      idClient: z
        .string()
        .describe(
          "ID-ul clientului, format 'prenume.nume', litere mici. " +
            "Ex: 'ionel.popescu'.",
        ),
    }),
  },
);

// ───────────────────────────────────────────────────────────────────────────
// TOOL 5 — REZERVA HOTEL
// IREVERSIBIL. Asta e tool-ul din cauza caruia exista HITL in lab.
// ───────────────────────────────────────────────────────────────────────────

/** Jurnalul rezervarilor facute in rularea curenta (ca sa vezi efectul real). */
export const rezervariFacute: string[] = [];

export const rezervaHotel = tool(
  async ({
    oras,
    nopti,
    idClient,
  }: {
    oras: string;
    nopti: number;
    idClient: string;
  }) => {
    const c = CLIENTI[idClient.toLowerCase().trim()];
    if (!c) {
      return (
        `Nu pot rezerva: clientul '${idClient}' nu exista. ` +
        `ID-uri valide: ${Object.keys(CLIENTI).join(", ")}.`
      );
    }
    if (nopti < 1 || nopti > 30) {
      return `Nu pot rezerva ${nopti} nopti. Intervalul acceptat este 1-30.`;
    }

    // EFECTUL IREVERSIBIL. Aici, intr-un sistem real, ai apela un PMS,
    // ai debita cardul si ai trimite un email. De aceea vrei un om la mijloc.
    const cod = `REZ-${String(rezervariFacute.length + 1).padStart(4, "0")}`;
    const pretPeNoapte = 85;
    rezervariFacute.push(
      `${cod}: ${c.nume}, ${oras}, ${nopti} nopti, ${nopti * pretPeNoapte} EUR`,
    );

    return (
      `Rezervare confirmata ${cod}: ${c.nume}, ${oras}, ${nopti} nopti, ` +
      `total ${nopti * pretPeNoapte} EUR. Debitata pe cardul din fisa clientului.`
    );
  },
  {
    name: "rezervaHotel",
    description:
      "REZERVA EFECTIV un hotel si DEBITEAZA cardul clientului. Actiune " +
      "ireversibila. Cheam-o doar dupa ce ai confirmat orasul, numarul de " +
      "nopti si identitatea clientului cu cautaClient. " +
      "Exemplu intrare: { oras: 'Roma', nopti: 3, idClient: 'ionel.popescu' }.",
    schema: z.object({
      oras: z.string().describe("Orasul in care se face rezervarea."),
      nopti: z.number().describe("Numarul de nopti, intre 1 si 30."),
      idClient: z
        .string()
        .describe("ID-ul clientului, format 'prenume.nume'. Ex: 'ionel.popescu'."),
    }),
  },
);

/** Tool-urile noi ale agentiei. */
export const toolAgentie = [cautaClient, rezervaHotel];
