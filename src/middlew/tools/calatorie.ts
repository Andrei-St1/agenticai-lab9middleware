// lab9/tools/calatorie.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// TOOL-URILE DE BAZA — aceleasi trei din Lab 7, nemodificate ca logica.
// Le aducem aici doar ca Lab 9 sa fie self-contained. Daca le ai deja in
// proiect, importa-le de acolo si sterge fisierul asta.
// ═══════════════════════════════════════════════════════════════════════════
//
// Toate API-urile de mai jos sunt GRATUITE si FARA CHEIE:
//   - open-meteo.com   → vremea
//   - frankfurter.app  → curs valutar (rate BCE)
//   - Intl nativ din JS → fus orar (zero network)

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ───────────────────────────────────────────────────────────────────────────
// TOOL 1 — VREMEA
// Doua apeluri: intai geocoding (oras → lat/lon), apoi vremea.
// ───────────────────────────────────────────────────────────────────────────
export const vremea = tool(
  async ({ oras }: { oras: string }) => {
    try {
      // Pasul 1: oras → coordonate. Cerem 5 candidati si il alegem pe cel cu
      // populatia cea mai mare, ca sa nu nimerim un sat cu acelasi nume.
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          oras,
        )}&count=5&language=en`,
      ).then((r) => r.json());

      const candidati = geo?.results;
      if (!candidati?.length) return `Nu am gasit orasul '${oras}'.`;

      const loc = candidati.sort(
        (a: any, b: any) => (b.population ?? 0) - (a.population ?? 0),
      )[0];

      // Pasul 2: coordonate → vremea curenta
      const meteo = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}` +
          `&longitude=${loc.longitude}&current=temperature_2m&timezone=auto`,
      ).then((r) => r.json());

      const t = meteo?.current?.temperature_2m;
      const unde = [loc.name, loc.admin1, loc.country].filter(Boolean).join(", ");
      return `Vremea in ${unde}: ${t} grade C.`;
    } catch {
      // IMPORTANT: nu aruncam. Intoarcem un mesaj pe care modelul il poate folosi.
      return `Nu am putut obtine vremea pentru '${oras}' (eroare de retea).`;
    }
  },
  {
    name: "vremea",
    description:
      "Temperatura curenta pentru un oras. Foloseste-l cand utilizatorul " +
      "intreaba de temperatura, ce sa imbrace, cum e vremea.",
    schema: z.object({
      oras: z
        .string()
        .describe(
          "Numele orasului in ENGLEZA (ex: 'Rome', 'Athens', 'Tokyo'), " +
            "optional cu tara: 'Rome, Italy'.",
        ),
    }),
  },
);

// ───────────────────────────────────────────────────────────────────────────
// TOOL 2 — CURS VALUTAR
// ───────────────────────────────────────────────────────────────────────────
export const cursValutar = tool(
  async ({ suma, din, in: catre }: { suma: number; din: string; in: string }) => {
    try {
      const r = await fetch(
        `https://api.frankfurter.app/latest?amount=${suma}&from=${din}&to=${catre}`,
      ).then((res) => res.json());

      const rezultat = r?.rates?.[catre];
      if (rezultat == null) return `Nu am putut converti ${din} in ${catre}.`;
      return `${suma} ${din} = ${rezultat} ${catre} (cursul de azi).`;
    } catch {
      return `Nu am putut obtine cursul ${din}-${catre} (eroare de retea).`;
    }
  },
  {
    name: "cursValutar",
    description:
      "Converteste o suma dintr-o moneda in alta la cursul de azi. " +
      "Foloseste-l pentru orice intrebare de tip 'cat fac X in Y'.",
    schema: z.object({
      suma: z.number().describe("Suma de convertit"),
      din: z.string().describe("Moneda sursa, cod ISO: EUR, RON, USD, JPY..."),
      in: z.string().describe("Moneda tinta, cod ISO"),
    }),
  },
);

// ───────────────────────────────────────────────────────────────────────────
// TOOL 3 — FUS ORAR (calcul local cu Intl, fara API extern)
// ───────────────────────────────────────────────────────────────────────────
export const fusOrar = tool(
  async ({ zona }: { zona: string }) => {
    try {
      const acum = new Intl.DateTimeFormat("ro-RO", {
        timeZone: zona,
        hour: "2-digit",
        minute: "2-digit",
        weekday: "long",
      }).format(new Date());
      return `Ora locala in ${zona}: ${acum}.`;
    } catch {
      // Intl arunca RangeError daca zona nu e un IANA timezone valid.
      return `Nu am gasit fusul orar '${zona}'. Foloseste format IANA, ex: Europe/Rome.`;
    }
  },
  {
    name: "fusOrar",
    description:
      "Ora locala curenta pentru un fus orar (ex: 'Asia/Tokyo', " +
      "'Europe/Bucharest'). Foloseste-l pentru 'cat e ceasul acolo'.",
    schema: z.object({
      zona: z.string().describe("Fus orar IANA, ex: 'Asia/Tokyo'."),
    }),
  },
);

/** Cele trei tool-uri de baza, gata de dat modelului. */
export const toolCalatorie = [vremea, cursValutar, fusOrar];
