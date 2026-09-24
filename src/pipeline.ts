// src/pipeline.ts
//
// DETERMINISTIC — fixed flow, the model never decides the path.
// Always: extractCity -> fetchWeather -> composeAnswer, in this exact order,
// with exactly one weather call. No tool-calling loop, no branching.
// (Contrast with agent.ts / workflow.ts / workflowlangchain.ts, where the
//  model decides which tools to call and how many turns to run.)

import "dotenv/config";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { weather } from "./tools.js";

const StateAnnotation = Annotation.Root({
  userQuestion: Annotation<string>(),
  city: Annotation<string>(),
  weatherRaw: Annotation<string>(),
  answer: Annotation<string>(),
});

const model = new ChatAnthropic({ model: "claude-sonnet-4-5" });

// Step 1 — pull the city name out of the question (structured output).
async function extractCity(s: typeof StateAnnotation.State) {
  const structured = model.withStructuredOutput(z.object({ city: z.string() }));

  //   // Step 1 — schema permite lipsa orașului
  // const structured = model.withStructuredOutput(
  //   z.object({
  //     city: z
  //       .string()
  //       .nullable()
  //       .describe("The city in English, or null if the question has no city."),
  //   }),
  // );
  // // ...

  const res = await structured.invoke([
    {
      role: "system",
      content:
        "Extract the city name from the question, in English. A single city.",
    },
    { role: "user", content: s.userQuestion },
  ]);
  return { city: res.city };
}

// Step 2 — always call the weather tool once, for that city.
async function fetchWeather(s: typeof StateAnnotation.State) {
  return { weatherRaw: await weather.invoke({ city: s.city }) };
}

// Step 2 — nu mai chemăm tool-ul dacă nu e oraș
// async function fetchWeather(s: typeof StateAnnotation.State) {
//   if (!s.city) return { weatherRaw: "No city in the question." };
//   return { weatherRaw: await weather.invoke({ city: s.city }) };
// }

// Step 3 — turn the raw data into a natural answer.
async function composeAnswer(s: typeof StateAnnotation.State) {
  const res = await model.invoke([
    { role: "system", content: "Write a short, natural answer in English." },
    {
      role: "user",
      content: `Question: ${s.userQuestion}\nWeather data: ${s.weatherRaw}`,
    },
  ]);
  return { answer: res.content as string };
}

// Linear graph: no conditional edges, so the path is fixed every run.
const graph = new StateGraph(StateAnnotation)
  .addNode("extractCity", extractCity)
  .addNode("fetchWeather", fetchWeather)
  .addNode("composeAnswer", composeAnswer)
  .addEdge(START, "extractCity")
  .addEdge("extractCity", "fetchWeather")
  .addEdge("fetchWeather", "composeAnswer")
  .addEdge("composeAnswer", END)
  .compile();

async function main() {
  const question =
    process.argv.slice(2).join(" ") || "What's the weather in Cluj?";
  console.log(`\n> Question: ${question}\n`);

  const result = await graph.invoke({ userQuestion: question });

  console.log(`  Extracted city: ${result.city}`);
  console.log(`  Raw data:       ${result.weatherRaw}`);
  console.log(`< Answer:         ${result.answer}\n`);
}

main().catch(console.error);

/*
În pipeline.ts și pipelinelangchain.ts,
dacă întrebarea nu conține niciun oraș 
— „What's 2+2?" — withStructuredOutput forțează un city: string. 
Modelul e obligat să inventeze un oraș, apoi ceri vremea pentru el,
 apoi compui un răspuns despre vremea de acolo
 */
