// Verificare 1 — ce apare EFECTIV in ToolMessage cand tool-ul intoarce emailul?
import { FakeToolCallingModel } from "langchain";
import { creeazaAgent } from "./agent.js";
import { afiseazaMesaje } from "./afisare.js";

const model = new FakeToolCallingModel({
  toolCalls: [
    [{ name: "cautaClientSuport", args: { idClient: "cl-101" }, id: "1" }],
    [],
  ],
});

const agent = creeazaAgent({ model });

const rezultat = await agent.invoke({
  messages: [{ role: "user", content: "cauta clientul cl-101, vreau sa vad planul lui" }],
});

afiseazaMesaje(rezultat.messages);
