import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, TextGenerationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { PROMPT_SUGGESTION_PROMPT } from "./orchestrationInstructions.ts";

import { decodeJsonReply, fromRunner } from "./textGenerationOperations.ts";

// regression: #23726 a reply that echoes the schema key replaced the seed title with "title"
it.effect("fails a thread title reply that is only the schema key", () =>
  Effect.gen(function* () {
    const textGeneration = fromRunner("Stub", (request) =>
      decodeJsonReply(request, "Stub", '{"title":"title","needsRefinement":false}'),
    );

    const outcome = yield* textGeneration
      .generateThreadTitle({
        cwd: process.cwd(),
        message: "$implement Issue #140",
        modelSelection: {
          instanceId: ProviderInstanceId.make("pi"),
          model: "anthropic/claude-haiku-4-5",
        },
      })
      .pipe(Effect.match({ onFailure: (error) => error, onSuccess: (result) => result }));

    assert.instanceOf(outcome, TextGenerationError);
    assert.strictEqual(outcome.operation, "generateThreadTitle");
  }),
);

it.effect("generates a next-prompt suggestion with the selected model and thread context", () => {
  let capturedOperation: string | undefined;
  let capturedModel: typeof modelSelection | undefined;
  let capturedPrompt: string | undefined;
  const modelSelection = {
    instanceId: ProviderInstanceId.make("opencode"),
    model: "opencode-go/deepseek-v4.1-flash",
  };
  const textGeneration = fromRunner("Stub", (request) => {
    capturedOperation = request.operation;
    capturedModel = request.modelSelection;
    capturedPrompt = request.prompt;
    return decodeJsonReply(
      request,
      "Stub",
      JSON.stringify({ suggestion: "Run the focused tests" }),
    );
  });

  return Effect.gen(function* () {
    const result = yield* textGeneration.generatePromptSuggestion({
      cwd: "/tmp/suggestion",
      threadContext: "USER: Fix the parser\n\nASSISTANT: The parser now handles empty input.",
      modelSelection,
    });

    assert.strictEqual(result.suggestion, "Run the focused tests");
    assert.strictEqual(capturedOperation, "generatePromptSuggestion");
    assert.deepEqual(capturedModel, modelSelection);
    assert.include(capturedPrompt, PROMPT_SUGGESTION_PROMPT);
    assert.include(capturedPrompt, "ASSISTANT: The parser now handles empty input.");
  });
});
