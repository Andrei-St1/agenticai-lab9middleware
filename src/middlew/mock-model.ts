// Model fake pentru demo-uri: raspuns fix, tokeni inventati, zero cost real.
// `numeModel` trebuie sa existe in lib/cost.ts ca auditLogger sa afiseze un pret.

import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

export class MockModel extends BaseChatModel {
  constructor(
    private readonly eticheta: string,
    private readonly numeModel: string,
    private readonly tokenIn = 1000,
    private readonly tokenOut = 500,
  ) {
    super({});
  }
  _llmType() {
    return "mock";
  }
  // createAgent leaga tool-urile pe model; mock-ul nu chema niciunul.
  bindTools() {
    return this;
  }
  async _generate(): Promise<ChatResult> {
    const mesaj = new AIMessage({
      content: `[MOCK ${this.eticheta}] Raspuns fix, fara apel real de model.`,
      response_metadata: { model_name: this.numeModel },
      usage_metadata: {
        input_tokens: this.tokenIn,
        output_tokens: this.tokenOut,
        total_tokens: this.tokenIn + this.tokenOut,
      },
    });
    return { generations: [{ text: mesaj.content as string, message: mesaj }] };
  }
}
