import { type ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";

import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { useTextGenerationTargets } from "../../textGenerators";
import { toastManager } from "../ui/toast";
import { useSettingsScope } from "./SettingsScopeContext";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useSearchableSetting } from "./settingsSearch";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsRow,
} from "./settingsLayout";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

export function AntigravityPromptSuggestionModelRow() {
  const setting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  const navigate = useNavigate();
  const { environment, target } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const providersByEnvironment = useEnvironmentProviders();
  const serverProviders =
    (environment?.serverConfig
      ? providersByEnvironment.get(environment.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;

  const targets = useTextGenerationTargets({
    environmentId,
    settings,
    providers: serverProviders.filter((provider) => provider.supportsTextGeneration !== false),
    projectId: target?.projectId ?? null,
    selections: [settings.antigravityPromptSuggestionModelSelection],
  });
  const promptProviders = targets.providers
    .filter(
      (provider) =>
        (provider.driver === "codex" && provider.auth.type === "chatgpt") ||
        provider.driver === "opencode",
    )
    .map((provider) => ({
      ...provider,
      models:
        provider.driver === "opencode"
          ? provider.models.filter(
              (model) =>
                model.slug.startsWith("opencode-go/") || model.subProvider === "OpenCode Go",
            )
          : provider.models,
    }))
    .filter((provider) => provider.models.length > 0);
  const instanceEntries = targets.entries
    .filter((entry) => promptProviders.some((provider) => provider.instanceId === entry.instanceId))
    .map((entry) => ({
      ...entry,
      models: promptProviders.find((provider) => provider.instanceId === entry.instanceId)!.models,
    }));
  const hasProvider = instanceEntries.some((entry) => entry.enabled && entry.isAvailable);
  const selection = settings.antigravityPromptSuggestionModelSelection;
  const activeSelection = selection
    ? resolveAppModelSelectionState(
        { ...settings, textGenerationModelSelection: selection },
        promptProviders,
      )
    : null;
  const activeInstanceId =
    activeSelection?.instanceId ?? instanceEntries[0]?.instanceId ?? serverProviders[0]?.instanceId;
  const model = activeSelection?.model ?? instanceEntries[0]?.models[0]?.slug ?? "";
  const modelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    promptProviders,
    activeInstanceId,
    model,
  );
  const mixed = useScopedSettingsMixed(["antigravityPromptSuggestionModelSelection"]);
  const disabledReason = useScopedModelDisabledReason(settings, instanceEntries, true);

  if (!settings.promptSuggestionsEnabled) return null;

  return (
    <SettingsRow
      serverScoped
      settingKeys={["antigravityPromptSuggestionModelSelection"]}
      {...setting("antigravity-suggestion-model")}
      description={gt(
        "Use a text-generation model for Antigravity's next prompt instead of spending Antigravity quota. Requires an authenticated ChatGPT Codex account or an OpenCode Go model.",
      )}
      resetAction={
        selection !== null || mixed ? (
          <SettingResetButton
            ariaLabel={gt("Use Antigravity's thread model for suggestions")}
            onClick={() => updateSettings({ antigravityPromptSuggestionModelSelection: null })}
          />
        ) : null
      }
      control={
        !hasProvider || activeInstanceId === undefined || model.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            <T>No Codex or OpenCode Go provider available.</T>
          </span>
        ) : (
          <ProviderModelPicker
            environmentId={environmentId}
            activeInstanceId={activeInstanceId as ProviderInstanceId}
            model={model}
            lockedProvider={null}
            instanceEntries={instanceEntries}
            modelOptionsByInstance={modelOptionsByInstance}
            triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
            {...(mixed
              ? { triggerLabel: gt("Mixed") }
              : selection === null
                ? { triggerLabel: gt("Antigravity (thread's model)") }
                : {})}
            getModelDisabledReason={disabledReason}
            defaultOption={{
              label: gt("Antigravity (thread's model)"),
              selected: selection === null,
              onSelect: () => updateSettings({ antigravityPromptSuggestionModelSelection: null }),
            }}
            {...(environmentId
              ? {
                  onOpenProviderSetup: (instanceId: ProviderInstanceId) => {
                    void navigate({
                      to: "/settings/providers",
                      search: { environmentId, instanceId },
                    });
                  },
                }
              : {})}
            onInstanceModelChange={(instanceId, nextModel) => {
              const reason = disabledReason(instanceId, nextModel);
              if (reason) {
                toastManager.add({
                  type: "error",
                  title: gt("Antigravity suggestion model not saved"),
                  description: reason,
                });
                return;
              }
              updateSettings({
                antigravityPromptSuggestionModelSelection: createModelSelection(
                  instanceId,
                  nextModel,
                ),
              });
            }}
          />
        )
      }
    />
  );
}
