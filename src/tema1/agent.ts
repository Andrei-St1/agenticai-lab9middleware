// tema1/agent.ts
//
// Agentul de suport. Middleware PRE-BUILT, fara niciun middleware custom:
//   1. piiMiddleware      — mascheaza emailul din rezultatele tool-urilor
//   2. toolCallLimit      — maxim 3 apeluri de tool pe rulare, oprire eleganta
//   3. humanInTheLoop     — (bonus) aprobare pentru escaladeazaTicket
//
// Modelul si checkpointer-ul vin de afara: testele folosesc FakeToolCallingModel,
// deci nu e nevoie de cheie de API.

import {
  createAgent,
  piiMiddleware,
  toolCallLimitMiddleware,
  humanInTheLoopMiddleware,
} from "langchain";
import type { MemorySaver } from "@langchain/langgraph";
import { toolSuport } from "./tools.js";

type Optiuni = {
  model: Parameters<typeof createAgent>[0]["model"];
  hitl?: boolean;
  checkpointer?: MemorySaver;
};

export function creeazaAgent({ model, hitl = false, checkpointer }: Optiuni) {
  const middleware = [
    piiMiddleware("email", { strategy: "mask", applyToToolResults: true }),
    toolCallLimitMiddleware({ runLimit: 3, exitBehavior: "end" }),
    ...(hitl
      ? [
          humanInTheLoopMiddleware({
            interruptOn: {
              escaladeazaTicket: { allowedDecisions: ["approve", "reject"] },
            },
          }),
        ]
      : []),
  ];

  return createAgent({
    model,
    tools: toolSuport,
    middleware: middleware as any,
    checkpointer,
  });
}
