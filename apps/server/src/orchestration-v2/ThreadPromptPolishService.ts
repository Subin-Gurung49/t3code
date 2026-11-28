import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SecureRandom from "effect/crypto/SecureRandom";
import {
  type PolishPromptInput,
  type PolishPromptResult,
  TextGenerationError,
} from "@t3tools/contracts";
import { collectComposerContextReferences } from "@t3tools/shared/composerContextReferences";

import * as ServerSettings from "../serverSettings.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import { resolvePromptTextGenerationModel } from "../textGeneration/promptTextGenerationModel.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";
import {
  RECENT_PROMPT_CONTEXT_MESSAGE_COUNT,
  recentThreadPromptContext,
} from "./threadPromptContext.ts";

export class ThreadPromptPolishService extends Context.Service<
  ThreadPromptPolishService,
  {
    readonly polish: (
      input: PolishPromptInput,
    ) => Effect.Effect<PolishPromptResult, TextGenerationError>;
  }
>()("t3/orchestration-v2/ThreadPromptPolishService") {}

const isProjectionStoreThreadNotFoundError = Schema.is(
  ProjectionStore.ProjectionStoreThreadNotFoundError,
);

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const textGeneration = yield* TextGeneration.TextGeneration;
  const providerRegistry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  const fileSystem = yield* FileSystem.FileSystem;
  const secureRandom = yield* SecureRandom.SecureRandom;

  const polish: ThreadPromptPolishService["Service"]["polish"] = Effect.fn(
    "ThreadPromptPolishService.polish",
  )(function* (input) {
    const draft = input.draft.trim();
    if (draft.length === 0) {
      return { polished: input.draft };
    }

    const settings = yield* serverSettings.getSettings.pipe(
      Effect.mapError(
        (cause) =>
          new TextGenerationError({
            operation: "generatePromptPolish",
            detail: "Failed to read server settings.",
            cause,
          }),
      ),
    );

    const modelSelection = ServerSettings.resolvePromptPolishModelSelection(settings);
    if (!modelSelection) {
      return yield* new TextGenerationError({
        operation: "generatePromptPolish",
        detail:
          "No preferred model configured for prompt polish in Settings. Please select an authenticated provider model.",
      });
    }

    yield* resolvePromptTextGenerationModel({
      registry: providerRegistry,
      modelSelection,
      operation: "generatePromptPolish",
      label: "prompt polish",
    });

    let threadContext: string | undefined = undefined;
    if (input.threadId) {
      const historySnapshot = yield* threads
        .getThreadSnapshotWindow(input.threadId, {
          rowLimit: 30,
          userTurnLimit: RECENT_PROMPT_CONTEXT_MESSAGE_COUNT,
        })
        .pipe(
          // Older mobile clients send a draft ID before the server creates the thread.
          Effect.catchTags({
            OrchestratorProjectionError: (error) =>
              isProjectionStoreThreadNotFoundError(error.cause)
                ? Effect.succeed(null)
                : Effect.fail(error),
          }),
          Effect.mapError(
            (cause) =>
              new TextGenerationError({
                operation: "generatePromptPolish",
                detail: `Failed to read thread records for '${input.threadId}'.`,
                cause,
              }),
          ),
        );

      threadContext = recentThreadPromptContext(historySnapshot?.projection.messages ?? []);
    }

    const occurrences = collectComposerContextReferences(input.draft);
    const nonce = yield* secureRandom.uuidV4().pipe(
      Effect.mapError(
        (cause) =>
          new TextGenerationError({
            operation: "generatePromptPolish",
            detail: "Failed to prepare composer references.",
            cause,
          }),
      ),
    );
    const markerPrefix = `__T3_REF_${nonce.replaceAll("-", "")}_`;
    let promptDraft = input.draft;
    if (occurrences.length > 0) {
      let masked = "";
      let cursor = 0;
      for (let i = 0; i < occurrences.length; i++) {
        const occ = occurrences[i]!;
        masked += input.draft.slice(cursor, occ.start) + `${markerPrefix}${i}__`;
        cursor = occ.end;
      }
      masked += input.draft.slice(cursor);
      promptDraft = masked;
    }

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-polish-prompt-" }).pipe(
          Effect.mapError(
            (cause) =>
              new TextGenerationError({
                operation: "generatePromptPolish",
                detail: "Failed to allocate temporary working directory for prompt polish.",
                cause,
              }),
          ),
        );

        const result = yield* textGeneration.generatePromptPolish({
          cwd,
          draft: promptDraft,
          threadContext,
          modelSelection,
        });

        let finalPolished = result.polished;
        if (occurrences.length > 0) {
          const markers = result.polished.match(new RegExp(`${markerPrefix}\\d+__`, "g")) ?? [];
          if (markers.length !== occurrences.length) {
            return yield* new TextGenerationError({
              operation: "generatePromptPolish",
              detail: "Prompt polish failed to preserve all composer reference tokens.",
            });
          }

          for (let i = 0; i < occurrences.length; i++) {
            const marker = `${markerPrefix}${i}__`;
            const count = (result.polished.match(new RegExp(marker, "g")) ?? []).length;
            if (count !== 1) {
              return yield* new TextGenerationError({
                operation: "generatePromptPolish",
                detail: `Prompt polish altered or duplicated composer reference token '${marker}'.`,
              });
            }
            finalPolished = finalPolished.replace(marker, () => occurrences[i]!.source);
          }

          const rehydratedOccurrences = collectComposerContextReferences(finalPolished);
          if (rehydratedOccurrences.length !== occurrences.length) {
            return yield* new TextGenerationError({
              operation: "generatePromptPolish",
              detail: "Prompt polish failed to rehydrate composer reference tokens correctly.",
            });
          }
        }

        return {
          polished: finalPolished,
        };
      }),
    );
  });

  return { polish } satisfies ThreadPromptPolishService["Service"];
});

export const layer = Layer.effect(ThreadPromptPolishService, make);
