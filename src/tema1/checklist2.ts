// Verificare 2 — 4 tool call-uri la rand. Ce se intampla la al 4-lea?
import { FakeToolCallingModel } from "langchain";
import { creeazaAgent } from "./agent.js";
import { afiseazaMesaje } from "./afisare.js";

const apel = (id: string) => ({
  name: "cautaClientSuport",
  args: { idClient: "cl-101" },
  id,
});

const model = new FakeToolCallingModel({
  toolCalls: [[apel("1")], [apel("2")], [apel("3")], [apel("4")], []],
});

const agent = creeazaAgent({ model });

try {
  const rezultat = await agent.invoke({
    messages: [{ role: "user", content: "verifica de 4 ori clientul cl-101" }],
  });
  afiseazaMesaje(rezultat.messages);
  console.log("invoke() s-a intors normal, fara exceptie.");
} catch (err) {
  console.log("invoke() a ARUNCAT o exceptie:", (err as Error).message);
}
