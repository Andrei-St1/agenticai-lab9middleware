// Verificare 4 (HITL) — fara checkpointer, intentionat. Ce eroare exacta?
import { FakeToolCallingModel } from "langchain";
import { creeazaAgent } from "./agent.js";
import { ticheteEscaladate } from "./tools.js";

const model = new FakeToolCallingModel({
  toolCalls: [
    [{ name: "escaladeazaTicket", args: { idTicket: "T-1", motiv: "client nemultumit" }, id: "1" }],
    [],
  ],
});

// hitl: true, dar FARA checkpointer.
const agent = creeazaAgent({ model, hitl: true });

try {
  await agent.invoke(
    { messages: [{ role: "user", content: "escaladeaza tichetul T-1, clientul e nemultumit" }] },
    { configurable: { thread_id: "fara-checkpointer" } },
  );
  console.log("Nicio eroare (neasteptat).");
} catch (err: any) {
  console.log(`Eroare: ${err.name}`);
  console.log(`lc_error_code: ${err.lc_error_code}`);
  console.log(`message: ${err.message}`);
}

console.log(`Tichete escaladate: ${ticheteEscaladate.length}`);
