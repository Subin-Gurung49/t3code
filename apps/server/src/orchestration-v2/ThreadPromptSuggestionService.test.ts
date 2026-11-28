import { assert, describe, it } from "@effect/vitest";
import {
  MessageId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettingsService from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadPromptSuggestionService from "./ThreadPromptSuggestionService.ts";

const threadId = ThreadId.make("thread:prompt-suggestion-test");
const runId = RunId.make("run:prompt-suggestion:2");
const newerRunId = RunId.make("run:prompt-suggestion:3");
const modelSelection = {
  instanceId: ProviderInstanceId.make("opencode"),
  model: "opencode-go/deepseek-v4.1-flash",
};

const messages = [
  { id: MessageId.make("m1"), role: "assistant", text: "oldest assistant" },
  { id: MessageId.make("m2"), role: "user", text: "second user" },
  { id: MessageId.make("m2b"), role: "assistant", text: "second assistant" },
  { id: MessageId.make("m3"), role: "system", text: "system note" },
  { id: MessageId.make("m4"), role: "user", text: "message four" },
  { id: MessageId.make("m5"), role: "assistant", text: "message five" },
  { id: MessageId.make("m6"), role: "user", text: "message six" },
  {
    id: MessageId.make("m7"),
    role: "assistant",
    text: "message seven streaming",
    streaming: true,
  },
  { id: MessageId.make("m8"), role: "user", text: "message eight" },
  { id: MessageId.make("m9"), role: "assistant", text: "message nine" },
] as const;

function createTestLayers(options: {
  readonly settings?: Partial<ServerSettings>;
  readonly latestRunIds?: ReadonlyArray<RunId>;
  readonly generatePromptSuggestion?: TextGeneration.TextGeneration["Service"]["generatePromptSuggestion"];
}) {
  let snapshotRead = 0;
  const latestRunIds = options.latestRunIds ?? [runId, runId];

  return ThreadPromptSuggestionService.layer.pipe(
    Layer.provide(
      Layer.mock(ServerSettingsService.ServerSettingsService)({
        getSettings: Effect.succeed({
          promptSuggestionsEnabled: true,
          antigravityPromptSuggestionModelSelection: modelSelection,
          ...options.settings,
        } as ServerSettings),
      }),
    ),
    Layer.provide(
      Layer.mock(ProviderInstanceRegistry.ProviderInstanceRegistry)({
        getInstance: (instanceId) =>
          Effect.succeed({
            instanceId,
            enabled: true,
            driverKind: "opencode",
            snapshot: {
              getSnapshot: Effect.succeed({
                instanceId,
                enabled: true,
                availability: "available",
                driver: "opencode",
                auth: { status: "authenticated" },
                models: [{ slug: modelSelection.model, name: "DeepSeek Flash" }],
              }),
            },
          } as never),
      }),
    ),
    Layer.provide(
      Layer.mock(ProjectionStore.ProjectionStoreV2)({
        getThreadSnapshotWindow: () => {
          const latestRunId = latestRunIds[snapshotRead] ?? latestRunIds.at(-1) ?? runId;
          snapshotRead += 1;
          return Effect.succeed({
            schemaVersion: 2,
            snapshotSequence: 1,
            projection: {
              thread: { id: threadId },
              runs: [{ id: latestRunId }],
              messages,
            },
          } as never);
        },
      }),
    ),
    Layer.provide(
      Layer.mock(TextGeneration.TextGeneration)({
        generatePromptSuggestion:
          options.generatePromptSuggestion ??
          (() => Effect.succeed({ suggestion: "Add a regression test" })),
      }),
    ),
    Layer.provide(
      Layer.succeed(FileSystem.FileSystem, {
        makeTempDirectoryScoped: () => Effect.succeed("/tmp/t3-prompt-suggestion"),
      } as never),
    ),
  );
}

describe("ThreadPromptSuggestionService", () => {
  it.effect(
    "uses the selected model and the six newest non-streaming conversation messages",
    () => {
      let capturedInput: unknown;
      return Effect.gen(function* () {
        const service = yield* ThreadPromptSuggestionService.ThreadPromptSuggestionService;
        const result = yield* service.generate({ threadId, runId });

        assert.strictEqual(result, "Add a regression test");
        assert.deepEqual(capturedInput, {
          cwd: "/tmp/t3-prompt-suggestion",
          threadContext:
            "ASSISTANT: second assistant\n\nUSER: message four\n\nASSISTANT: message five\n\nUSER: message six\n\nUSER: message eight\n\nASSISTANT: message nine",
          modelSelection,
        });
      }).pipe(
        Effect.provide(
          createTestLayers({
            generatePromptSuggestion: (input) => {
              capturedInput = input;
              return Effect.succeed({ suggestion: "Add a regression test" });
            },
          }),
        ),
      );
    },
  );

  it.effect.each([
    { name: "suggestions are disabled", settings: { promptSuggestionsEnabled: false } },
    {
      name: "no model is selected",
      settings: { antigravityPromptSuggestionModelSelection: null },
    },
  ])("does nothing when $name", ({ settings }) => {
    let called = false;
    return Effect.gen(function* () {
      const service = yield* ThreadPromptSuggestionService.ThreadPromptSuggestionService;
      const result = yield* service.generate({ threadId, runId });

      assert.isUndefined(result);
      assert.isFalse(called);
    }).pipe(
      Effect.provide(
        createTestLayers({
          settings,
          generatePromptSuggestion: () => {
            called = true;
            return Effect.succeed({ suggestion: "unused" });
          },
        }),
      ),
    );
  });

  it.effect("ignores a stale run before generating", () => {
    let called = false;
    return Effect.gen(function* () {
      const service = yield* ThreadPromptSuggestionService.ThreadPromptSuggestionService;
      const result = yield* service.generate({ threadId, runId });

      assert.isUndefined(result);
      assert.isFalse(called);
    }).pipe(
      Effect.provide(
        createTestLayers({
          latestRunIds: [newerRunId],
          generatePromptSuggestion: () => {
            called = true;
            return Effect.succeed({ suggestion: "stale" });
          },
        }),
      ),
    );
  });

  it.effect("drops a result when a newer run starts during generation", () => {
    return Effect.gen(function* () {
      const service = yield* ThreadPromptSuggestionService.ThreadPromptSuggestionService;
      const result = yield* service.generate({ threadId, runId });

      assert.isUndefined(result);
    }).pipe(Effect.provide(createTestLayers({ latestRunIds: [runId, newerRunId] })));
  });
});
