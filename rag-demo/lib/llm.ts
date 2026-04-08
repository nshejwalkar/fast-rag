import Anthropic from "@anthropic-ai/sdk";

async function* toTokenStream(
  stream: AsyncIterable<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>
): AsyncGenerator<string> {
  for await (const event of stream) {
    if (event.type !== "content_block_delta") continue;
    if (event.delta.type !== "text_delta") continue;
    yield event.delta.text;
  }
}

export async function streamAnswer(
  context: string,
  query: string
): Promise<{ tokenStream: AsyncGenerator<string>; modelUsed: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing.");

  const anthropic = new Anthropic({ apiKey });
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim();
  const candidateModels = Array.from(
    new Set(
      [
        configuredModel,
        "claude-3-5-haiku-latest",
        "claude-3-5-haiku-20241022",
        "claude-3-haiku-20240307",
      ].filter(Boolean)
    )
  ) as string[];

  // Split the prompt into two content blocks:
  //   1. Context block — marked ephemeral so Anthropic's prefix cache is hit when the
  //      same set of chunks (assembled in the same order) is used across requests.
  //   2. Query block — varies per request, never cached.
  // Requires the prompt-caching beta header, sent via anthropic.beta.messages.create.
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Context:\n${context}\n\n`,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `Question:\n${query}\n\nAnswer concisely and cite snippet numbers when possible.`,
        },
      ],
    },
  ];

  for (const model of candidateModels) {
    try {
      const stream = await anthropic.beta.messages.create({
        model,
        max_tokens: 500,
        stream: true,
        betas: ["prompt-caching-2024-07-31"],
        messages,
      });

      return { tokenStream: toTokenStream(stream), modelUsed: model };
    } catch (error) {
      const maybeAnthropicError = error as {
        status?: number;
        type?: string;
        error?: { type?: string };
      };
      const isNotFound =
        maybeAnthropicError.status === 404 ||
        maybeAnthropicError.type === "not_found_error" ||
        maybeAnthropicError.error?.type === "not_found_error";
      if (!isNotFound) throw error;
    }
  }

  throw new Error(
    `No accessible Anthropic model found. Tried: ${candidateModels.join(", ")}.`
  );
}
