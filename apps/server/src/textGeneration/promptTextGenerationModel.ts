import { TextGenerationError, type ModelSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";

/** Shared server-side eligibility for user-selectable prompt text models. */
export const resolvePromptTextGenerationModel = Effect.fn("resolvePromptTextGenerationModel")(
  function* (input: {
    readonly registry: ProviderInstanceRegistry.ProviderInstanceRegistry["Service"];
    readonly modelSelection: ModelSelection;
    readonly operation: "generatePromptPolish" | "generatePromptSuggestion";
    readonly label: "prompt polish" | "prompt suggestion";
  }) {
    const providerInstance = yield* input.registry
      .getInstance(input.modelSelection.instanceId)
      .pipe(
        Effect.mapError(
          (cause) =>
            new TextGenerationError({
              operation: input.operation,
              detail: `Failed to inspect provider instance '${input.modelSelection.instanceId}'.`,
              cause,
            }),
        ),
      );

    if (!providerInstance || !providerInstance.enabled) {
      return yield* new TextGenerationError({
        operation: input.operation,
        detail: `Configured ${input.label} provider '${input.modelSelection.instanceId}' is disabled or unavailable. No fallback is configured.`,
      });
    }

    const snapshot = yield* providerInstance.snapshot.getSnapshot.pipe(
      Effect.mapError(
        (cause) =>
          new TextGenerationError({
            operation: input.operation,
            detail: `Failed to inspect snapshot for provider instance '${input.modelSelection.instanceId}'.`,
            cause,
          }),
      ),
    );

    if (snapshot.availability === "unavailable" || !snapshot.enabled) {
      return yield* new TextGenerationError({
        operation: input.operation,
        detail: `Configured ${input.label} provider '${input.modelSelection.instanceId}' is disabled or unavailable. No fallback is configured.`,
      });
    }

    if (snapshot.auth.status !== "authenticated") {
      return yield* new TextGenerationError({
        operation: input.operation,
        detail: `Configured ${input.label} provider '${input.modelSelection.instanceId}' is not authenticated.`,
      });
    }

    if (snapshot.driver === "codex") {
      if (snapshot.auth.type !== "chatgpt") {
        return yield* new TextGenerationError({
          operation: input.operation,
          detail: `Codex ${input.label} requires an authenticated ChatGPT subscription (got '${snapshot.auth.type ?? "none"}'). API key authentication is not supported.`,
        });
      }
    } else if (snapshot.driver === "opencode") {
      const selectedModel = snapshot.models.find(
        (model) => model.slug === input.modelSelection.model,
      );
      const isGo =
        input.modelSelection.model.startsWith("opencode-go/") ||
        selectedModel?.subProvider === "OpenCode Go" ||
        selectedModel?.slug.startsWith("opencode-go/");
      if (!isGo) {
        return yield* new TextGenerationError({
          operation: input.operation,
          detail: `OpenCode ${input.label} requires an OpenCode Go subscription model path (got '${input.modelSelection.model}').`,
        });
      }
    } else {
      return yield* new TextGenerationError({
        operation: input.operation,
        detail: `${input.label} driver '${snapshot.driver}' is not supported. Only verified drivers with tool isolation (codex, opencode) are allowed.`,
      });
    }

    return snapshot;
  },
);
