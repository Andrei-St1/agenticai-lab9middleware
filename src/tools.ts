// src/tools.ts
//
// ═══════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS (used in Block B and C)
// ═══════════════════════════════════════════════════════════════════════
//
// NEW ELEMENTS introduced here and WHERE they come from:
//
//   • tool(fn, config)        from  "@langchain/core/tools"
//       → wraps a function into a "tool" the model can request.
//         config = { name, description, schema (Zod) }.
//
//   • name & description       → the model PICKS the tool by these. A good
//         description = tool called correctly. A bad one = tool ignored.
//
//   • schema (Zod)             → validates the arguments the model provides.
//
// What they are good for: they give the model access to things it cannot
// know on its own — today's weather, today's exchange rate, the timezone.
//
// All the APIs below are FREE and require NO KEY.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// TOOL 1 — WEATHER (open-meteo, no key)
// Two calls: first geocoding (city → lat/lon), then the weather.
// ─────────────────────────────────────────────────────────────────────────
export const weather = tool(
  async ({ city }: { city: string }) => {
    try {
      // step 1: city → coordinates.
      // We ask for MORE results (count=5): a localized name can otherwise hit
      // an obscure village. We pick the candidate with the largest population —
      // capitals have huge populations, villages don't — so you get the city
      // you expect.
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city,
        )}&count=5&language=en`,
      ).then((r) => r.json());

      const candidates = geo?.results;
      if (!candidates?.length) return `Could not find the city "${city}".`;

      // sort descending by population (missing = 0) and take the first
      const loc = candidates.sort(
        (a: any, b: any) => (b.population ?? 0) - (a.population ?? 0),
      )[0];

      // step 2: coordinates → current weather
      const meteo = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code&timezone=auto`,
      ).then((r) => r.json());

      const t = meteo?.current?.temperature_2m;
      // return a short STRING — the model reads it as the tool result.
      // Include region (admin1) + country to make clear WHICH city matched.
      const where = [loc.name, loc.admin1, loc.country]
        .filter(Boolean)
        .join(", ");
      return `Weather in ${where}: ${t}°C.`;
    } catch (e) {
      // IMPORTANT: on error we do NOT throw — we return a message the model
      // can use to answer gracefully.
      return `Could not get the weather for "${city}" (network error).`;
    }
  },
  {
    name: "weather",
    description:
      "Get the current temperature for a city. Use it when the user asks " +
      "about temperature, what to wear, etc.",
    schema: z.object({
      city: z
        .string()
        .describe(
          "The city name in ENGLISH (e.g. 'Rome', 'Athens', 'Tokyo'), " +
            "optionally with the country: 'Rome, Italy'. English names avoid " +
            "confusion with small towns that have a similar name.",
        ),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────
// TOOL 2 — CURRENCY EXCHANGE (frankfurter.app, no key)
// ─────────────────────────────────────────────────────────────────────────
export const currency = tool(
  async ({
    amount,
    from,
    to,
  }: {
    amount: number;
    from: string;
    to: string;
  }) => {
    try {
      // frankfurter.app — free, no key, ECB rates
      const r = await fetch(
        `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`,
      ).then((res) => res.json());

      const result = r?.rates?.[to];
      if (result == null) return `Could not convert ${from}→${to}.`;
      return `${amount} ${from} = ${result} ${to} (today's rate).`;
    } catch (e) {
      return `Could not get the rate ${from}→${to} (network error).`;
    }
  },
  {
    name: "currency",
    description:
      "Convert an amount from one currency to another at today's rate. Use it " +
      "for any question about currency exchange or 'how much is X in Y'.",
    schema: z.object({
      amount: z.number().describe("The amount to convert"),
      from: z
        .string()
        .describe("Source currency, ISO code: EUR, RON, USD, JPY..."),
      to: z.string().describe("Target currency, ISO code"),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────
// TOOL 3 — TIMEZONE (local computation with Intl, no external API)
// ─────────────────────────────────────────────────────────────────────────
export const timezone = tool(
  async ({ zone }: { zone: string }) => {
    // No external API needed — JS computes the time in a native timezone with
    // Intl.DateTimeFormat. Zero network, never goes down.
    try {
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        weekday: "long",
      }).format(new Date());
      return `Local time in ${zone}: ${now}.`;
    } catch (e) {
      // Intl throws RangeError if the zone is not a valid IANA timezone.
      return `Could not find timezone "${zone}". Use IANA format, e.g. Europe/Rome.`;
    }
  },
  {
    name: "timezone",
    description:
      "Current local time for a timezone (e.g. 'Asia/Tokyo', 'Europe/" +
      "Bucharest'). Use it for 'what time is it there'.",
    schema: z.object({
      zone: z.string().describe("IANA timezone, e.g. 'Asia/Tokyo'."),
    }),
  },
);

// All tools, ready to hand to the model.
export const travelTools = [weather, currency, timezone];
