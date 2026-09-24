// src/pipelinelangchain.ts
//
// DETERMINISTIC — same fixed flow as pipeline.ts, but built with plain
// LangChain (LCEL) instead of a LangGraph graph.
// RunnableSequence chains the steps in a fixed order: extractCity ->
// fetchWeather -> composeAnswer. No graph, no tool-calling loop, no branching.

import "dotenv/config";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { weather } from "./tools.js";

type State = {
  userQuestion: string;
  city?: string;
  weatherRaw?: string;
  answer?: string;
};

const model = new ChatAnthropic({ model: "claude-sonnet-4-5" });

// Step 1 — pull the city name out of the question (structured output).
async function extractCity(s: State): Promise<State> {
  const structured = model.withStructuredOutput(z.object({ city: z.string() }));
  const res = await structured.invoke([
    {
      role: "system",
      content:
        "Extract the city name from the question, in English. A single city.",
    },
    { role: "user", content: s.userQuestion },
  ]);
  return { ...s, city: res.city };
}

// Step 2 — always call the weather tool once, for that city.
async function fetchWeather(s: State): Promise<State> {
  return { ...s, weatherRaw: await weather.invoke({ city: s.city! }) };
}

// Step 3 — turn the raw data into a natural answer.
async function composeAnswer(s: State): Promise<State> {
  const res = await model.invoke([
    { role: "system", content: "Write a short, natural answer in English." },
    {
      role: "user",
      content: `Question: ${s.userQuestion}\nWeather data: ${s.weatherRaw}`,
    },
  ]);
  return { ...s, answer: res.content as string };
}

// LCEL chain: steps run in this fixed order every time.
const chain = RunnableSequence.from([extractCity, fetchWeather, composeAnswer]);

async function main() {
  const question =
    process.argv.slice(2).join(" ") || "What's the weather in Cluj?";
  console.log(`\n> Question: ${question}\n`);

  const result = await chain.invoke({ userQuestion: question });

  console.log(`  Extracted city: ${result.city}`);
  console.log(`  Raw data:       ${result.weatherRaw}`);
  console.log(`< Answer:         ${result.answer}\n`);
}

main().catch(console.error);
