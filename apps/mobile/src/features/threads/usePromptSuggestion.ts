import { useSyncExternalStore } from "react";

import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import type { ThreadRunSummary } from "@t3tools/client-runtime/state/models";

import { useServerConfigs } from "../../state/entities";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useEnvironmentQuery } from "../../state/query";
import { promptSuggestionToAccept } from "../../lib/promptSuggestion";

export { promptSuggestionToAccept };

// Dismissed suggestions, keyed by environment and run. Run ids derive from
// thread ids, which can repeat across environments.
let dismissedKeys: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const subscribeDismissed = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const readDismissed = () => dismissedKeys;
const dismissKey = (environmentId: EnvironmentId, runId: RunId) => `${environmentId}\u0000${runId}`;

/**
 * The provider's predicted next prompt, while the run that produced it is the
 * thread's latest completed run and has not been dismissed.
 */
export function usePromptSuggestion(
  environmentId: EnvironmentId,
  threadId: ThreadId | undefined,
  latestRun: ThreadRunSummary | null | undefined,
): { readonly suggestion: string | null; readonly dismiss: () => void } {
  // Older servers decode the missing setting as false, so true also proves the method exists.
  const enabled = useServerConfigs().get(environmentId)?.settings.promptSuggestionsEnabled === true;
  const { data } = useEnvironmentQuery(
    // A local draft has no run, and so no suggestion, until its first send.
    enabled && latestRun && threadId
      ? orchestrationEnvironment.v2.promptSuggestion({
          environmentId,
          input: { threadId },
        })
      : null,
  );
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed);
  const offered =
    data && latestRun && data.runId === latestRun.runId && latestRun.status === "completed"
      ? data
      : null;
  return {
    suggestion:
      offered && !dismissed.has(dismissKey(environmentId, offered.runId)) ? offered.text : null,
    dismiss: () => {
      if (offered === null) return;
      dismissedKeys = new Set(dismissedKeys).add(dismissKey(environmentId, offered.runId));
      for (const listener of listeners) listener();
    },
  };
}
