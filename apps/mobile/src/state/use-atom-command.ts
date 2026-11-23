import { RegistryContext } from "@effect/atom-react";
import {
  type AtomCommand,
  type AtomCommandOptions,
  type AtomCommandResult,
  runAtomCommand,
} from "@t3tools/client-runtime/state/runtime";
import { useCallback, useContext } from "react";

export function useAtomCommand<A, E, W>(
  command: AtomCommand<W, A, E>,
  options?: string | Omit<AtomCommandOptions, "signal">,
): (value: W, callOptions?: AtomCommandOptions) => Promise<AtomCommandResult<A, E>> {
  const registry = useContext(RegistryContext);
  const label = typeof options === "string" ? options : options?.label;
  const reportFailure = typeof options === "string" ? undefined : options?.reportFailure;
  const reportDefect = typeof options === "string" ? undefined : options?.reportDefect;

  return useCallback(
    (value: W, callOptions?: AtomCommandOptions) =>
      runAtomCommand(registry, command, value, {
        ...callOptions,
        label: callOptions?.label ?? label ?? command.label,
        reportFailure: callOptions?.reportFailure ?? reportFailure ?? true,
        reportDefect: callOptions?.reportDefect ?? reportDefect ?? true,
      }),
    [command, label, reportFailure, reportDefect, registry],
  );
}
