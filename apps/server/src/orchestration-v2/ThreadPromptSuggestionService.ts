import type { ModelSelection, RunId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import { resolvePromptTextGenerationModel } from "../textGeneration/promptTextGenerationModel.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import {
  RECENT_PROMPT_CONTEXT_MESSAGE_COUNT,
  recentThreadPromptContext,
} from "./threadPromptContext.ts";

export class ThreadPromptSuggestionService extends Context.Service<
  ThreadPromptSuggestionService,
  {
    readonly modelSelection: Effect.Effect<ModelSelection | null>;
    readonly generate: (input: {
      readonly threadId: ThreadId;
      readonly runId: RunId;
    }) => Effect.Effect<string | undefined>;
  }
>()("t3/orchestration-v2/ThreadPromptSuggestionService") {}

const make = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const providerRegistry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  const projectionStore = yield* ProjectionStore.ProjectionStoreV2;
  const textGeneration = yield* TextGeneration.TextGeneration;
  const fileSystem = yield* FileSystem.FileSystem;

  const modelSelection = serverSettings.getSettings.pipe(
    Effect.map((settings) => settings.antigravityPromptSuggestionModelSelection),
    Effect.orElseSucceed(() => null),
  );

  const generate: ThreadPromptSuggestionService["Service"]["generate"] = Effect.fn(
    "ThreadPromptSuggestionService.generate",
  )(function* (input) {
    return yield* Effect.gen(function* () {
      const settings = yield* serverSettings.getSettings;
      if (!settings.promptSuggestionsEnabled) return undefined;

      const selection = settings.antigravityPromptSuggestionModelSelection;
      if (selection === null) return undefined;

      yield* resolvePromptTextGenerationModel({
        registry: providerRegistry,
        modelSelection: selection,
        operation: "generatePromptSuggestion",
        label: "prompt suggestion",
      });

      const snapshot = yield* projectionStore.getThreadSnapshotWindow(input.threadId, {
        rowLimit: 30,
        userTurnLimit: RECENT_PROMPT_CONTEXT_MESSAGE_COUNT,
      });
      if (snapshot.projection.runs.at(-1)?.id !== input.runId) return undefined;

      const threadContext = recentThreadPromptContext(snapshot.projection.messages);
      if (threadContext === undefined) return undefined;

      const generated = yield* Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "t3-prompt-suggestion-",
          });
          return yield* textGeneration.generatePromptSuggestion({
            cwd,
            threadContext,
            modelSelection: selection,
          });
        }),
      );

      const latest = yield* projectionStore.getThreadSnapshotWindow(input.threadId, {
        rowLimit: 1,
      });
      if (latest.projection.runs.at(-1)?.id !== input.runId) return undefined;

      const suggestion = generated.suggestion.trim();
      return suggestion.length === 0 ? undefined : suggestion;
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logDebug("orchestration-v2.prompt-suggestion-generation-failed", {
          threadId: input.threadId,
          runId: input.runId,
          cause,
        }).pipe(Effect.as(undefined)),
      ),
    );
  });

  return { modelSelection, generate } satisfies ThreadPromptSuggestionService["Service"];
});

export const layer = Layer.effect(ThreadPromptSuggestionService, make);
