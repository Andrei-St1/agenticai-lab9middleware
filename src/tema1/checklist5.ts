// Verificare 5 (HITL) — acelasi thread_id vs thread_id diferit, dupa o aprobare.
import { FakeToolCallingModel } from "langchain";
import { Command, MemorySaver } from "@langchain/langgraph";
import { creeazaAgent } from "./agent.js";
import { afiseazaMesaje } from "./afisare.js";
import { ticheteEscaladate } from "./tools.js";

const cauta = (id: string) => ({
  name: "cautaClientSuport",
  args: { idClient: "cl-101" },
  id,
});
const escaladeaza = (id: string) => ({
  name: "escaladeazaTicket",
  args: { idTicket: "T-1", motiv: "client nemultumit" },
  id,
});

// FakeToolCallingModel da fiecarui mesaj AI id-ul egal cu contorul de ture, iar
// reducerul de mesaje INLOCUIESTE mesajele cu acelasi id. Deci, pe un thread care
// are deja istoric, un scenariu de 3 ture care o ia de la 0 ar suprascrie
// mesajele vechi. Scenariul are 6 pasi (2 rulari x 3 ture) ca id-urile sa
// ramana unice pe thread; tot id-urile tool call-urilor sunt unice.
const model = new FakeToolCallingModel({
  toolCalls: [
    [cauta("t1")], [escaladeaza("t2")], [],
    [cauta("t4")], [escaladeaza("t5")], [],
  ],
});

// UN checkpointer si UN agent pentru toate rularile.
const checkpointer = new MemorySaver();
const agent: any = creeazaAgent({ model, hitl: true, checkpointer });

async function ruleaza(nr: number, threadId: string, arataIstoric = false) {
  console.log(`\n=== rularea ${nr} · thread_id "${threadId}" ===`);
  const config = { configurable: { thread_id: threadId } };

  const raport = async (eticheta: string, rezultat: any) => {
    const stare = await agent.getState(config);
    const v = stare.values;
    const intrerupere = rezultat.__interrupt__?.[0]?.value?.actionRequests?.[0];
    console.log(
      `${eticheta}: ${rezultat.messages.length} mesaje` +
        (intrerupere
          ? ` | intrerupere: ${intrerupere.name} ${JSON.stringify(intrerupere.args)}`
          : "") +
        ` | tichete escaladate: ${ticheteEscaladate.length}` +
        ` | runToolCallCount=${JSON.stringify(v.runToolCallCount)}` +
        ` threadToolCallCount=${JSON.stringify(v.threadToolCallCount)}`,
    );
  };

  const r1 = await agent.invoke(
    { messages: [{ role: "user", content: "clientul cl-101 e nemultumit, escaladeaza tichetul T-1" }] },
    config,
  );
  await raport("dupa invoke", r1);

  const decizie = { decisions: [{ type: "approve" as const }] };
  console.log(`decizie trimisa: ${JSON.stringify(decizie)}`);
  const r2 = await agent.invoke(new Command({ resume: decizie }), config);
  await raport("dupa resume", r2);

  if (arataIstoric) {
    console.log(`istoricul de pe "${threadId}" dupa rularea ${nr}:`);
    afiseazaMesaje(r2.messages);
  }
}

await ruleaza(1, "fir-A");
await ruleaza(2, "fir-A", true);
await ruleaza(3, "fir-B");

console.log(`\nTichete escaladate (${ticheteEscaladate.length}):`);
for (const t of ticheteEscaladate) console.log(`  ${t}`);
