import type { OrchestrationV2ProviderTurn } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { ChevronDownIcon } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import type { ContextWindowSnapshot } from "../../lib/contextWindow";

type UsageCounts = {
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly cacheCreationTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly label: string;
};

type UsageCountKey =
  | "inputTokens"
  | "cachedInputTokens"
  | "cacheCreationTokens"
  | "outputTokens"
  | "reasoningTokens";

const tokenFormatter = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compactTokenFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatTokens(value: number | null): string {
  return value === null ? "N/A" : tokenFormatter.format(value);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  const seconds = durationMs / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}

function timestampMs(value: OrchestrationV2ProviderTurn["startedAt"]): number | null {
  return value === null ? null : DateTime.toEpochMillis(value);
}

function latestMainAgentTurn(
  turns: ReadonlyArray<OrchestrationV2ProviderTurn>,
): OrchestrationV2ProviderTurn | null {
  let latest: OrchestrationV2ProviderTurn | null = null;
  for (const turn of turns) {
    if (turn.runAttemptId === null) continue;
    const turnStartedAt = timestampMs(turn.startedAt) ?? timestampMs(turn.completedAt);
    const latestStartedAt =
      latest === null ? null : (timestampMs(latest.startedAt) ?? timestampMs(latest.completedAt));
    if (
      latest === null ||
      (turnStartedAt !== null && (latestStartedAt === null || turnStartedAt > latestStartedAt)) ||
      (turnStartedAt === latestStartedAt && turn.ordinal > latest.ordinal)
    ) {
      latest = turn;
    }
  }
  return latest;
}

function usageCounts(turn: OrchestrationV2ProviderTurn): UsageCounts | null {
  const report = turn.turnTokenUsage;
  if (report && (report.usageStatus !== "unavailable" || turn.tokenUsage === undefined)) {
    return {
      inputTokens: report.inputTokens ?? null,
      cachedInputTokens: report.cachedInputTokens ?? null,
      cacheCreationTokens: report.cacheCreationTokens ?? null,
      outputTokens: report.outputTokens ?? null,
      reasoningTokens: report.reasoningTokens ?? null,
      label:
        report.usageStatus === "complete"
          ? "Reported"
          : report.usageStatus === "partial"
            ? "Partial"
            : "Unavailable",
    };
  }
  if (turn.tokenUsage) {
    return {
      inputTokens: turn.tokenUsage.inputTokens ?? null,
      cachedInputTokens: turn.tokenUsage.cachedInputTokens ?? null,
      cacheCreationTokens: null,
      outputTokens: turn.tokenUsage.outputTokens ?? null,
      reasoningTokens: turn.tokenUsage.reasoningOutputTokens ?? null,
      label: turn.status === "running" ? "Live" : "Provider snapshot",
    };
  }
  return report
    ? {
        inputTokens: report.inputTokens ?? null,
        cachedInputTokens: report.cachedInputTokens ?? null,
        cacheCreationTokens: report.cacheCreationTokens ?? null,
        outputTokens: report.outputTokens ?? null,
        reasoningTokens: report.reasoningTokens ?? null,
        label: "Unavailable",
      }
    : null;
}

function totalFor(
  turns: ReadonlyArray<OrchestrationV2ProviderTurn>,
  key: UsageCountKey,
): number | null {
  let total = 0;
  let hasValue = false;
  for (const turn of turns) {
    const usage = turn.turnTokenUsage;
    if (turn.runAttemptId === null || usage === undefined || usage.usageStatus === "unavailable") {
      continue;
    }
    const value = usage[key];
    if (typeof value === "number") {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function UsageLine({
  label,
  usage,
  outputRate,
  durationMs,
}: {
  readonly label: string;
  readonly usage: UsageCounts;
  readonly outputRate?: number | null;
  readonly durationMs?: number | null;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-2xs leading-4 text-muted-foreground tabular-nums [&>span]:whitespace-nowrap">
      <span className="shrink-0 font-medium text-secondary-label">{label}</span>
      <span>Input {formatTokens(usage.inputTokens)}</span>
      <span>Cached input {formatTokens(usage.cachedInputTokens)}</span>
      {usage.cacheCreationTokens === null ? null : (
        <span>Cache write {formatTokens(usage.cacheCreationTokens)}</span>
      )}
      <span>Output {formatTokens(usage.outputTokens)}</span>
      {usage.reasoningTokens === null ? null : (
        <span>Reasoning {formatTokens(usage.reasoningTokens)}</span>
      )}
      {outputRate === undefined ? null : (
        <span>
          {outputRate === null
            ? "N/A"
            : `${outputRate >= 100 ? Math.round(outputRate) : outputRate.toFixed(1)} tok/s`}
        </span>
      )}
      {durationMs === undefined ? null : (
        <span>{durationMs === null ? "N/A" : formatDuration(durationMs)}</span>
      )}
    </div>
  );
}

export function ComposerTokenUsage({
  providerTurns,
  contextWindow,
  cost,
}: {
  readonly providerTurns: ReadonlyArray<OrchestrationV2ProviderTurn>;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly cost: ContextWindowSnapshot["cost"];
}) {
  const mainAgentTurns = providerTurns.filter((turn) => turn.runAttemptId !== null);
  const latestTurn = latestMainAgentTurn(mainAgentTurns);
  const latestUsage = latestTurn === null ? null : usageCounts(latestTurn);
  const latestTurnStartedAt = latestTurn === null ? null : timestampMs(latestTurn.startedAt);
  const latestTurnIsRunning = latestTurn?.status === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!latestTurnIsRunning || latestTurnStartedAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [latestTurnIsRunning, latestTurnStartedAt]);

  const completedAt = latestTurn === null ? null : timestampMs(latestTurn.completedAt);
  const endAt = latestTurnIsRunning ? now : completedAt;
  const durationMs =
    latestTurnStartedAt === null || endAt === null
      ? null
      : Math.max(0, endAt - latestTurnStartedAt);
  const outputRate =
    latestUsage?.outputTokens !== null &&
    latestUsage?.outputTokens !== undefined &&
    durationMs !== null &&
    durationMs > 0
      ? latestUsage.outputTokens / (durationMs / 1_000)
      : null;

  const reportedResponses = mainAgentTurns.filter(
    (turn) =>
      turn.turnTokenUsage !== undefined && turn.turnTokenUsage.usageStatus !== "unavailable",
  ).length;
  const threadTotals: UsageCounts = {
    inputTokens: totalFor(mainAgentTurns, "inputTokens"),
    cachedInputTokens: totalFor(mainAgentTurns, "cachedInputTokens"),
    cacheCreationTokens: totalFor(mainAgentTurns, "cacheCreationTokens"),
    outputTokens: totalFor(mainAgentTurns, "outputTokens"),
    reasoningTokens: totalFor(mainAgentTurns, "reasoningTokens"),
    label: "Reported",
  };

  if (latestTurn === null && reportedResponses === 0) return null;

  const totals = reportedResponses > 0 ? threadTotals : latestUsage;
  const completeCacheCoverage = mainAgentTurns.every((turn) => {
    const usage = turn.turnTokenUsage;
    return (
      usage === undefined ||
      usage.usageStatus === "unavailable" ||
      (usage.inputTokens !== undefined && usage.cachedInputTokens !== undefined)
    );
  });
  const cacheHit =
    completeCacheCoverage &&
    totals?.inputTokens !== null &&
    totals?.inputTokens !== undefined &&
    totals.inputTokens > 0 &&
    totals.cachedInputTokens !== null
      ? Math.min(100, (totals.cachedInputTokens / totals.inputTokens) * 100)
      : null;
  const compact = (value: number | null) =>
    value === null ? "N/A" : compactTokenFormatter.format(value).toLowerCase();
  const metrics = [
    { label: "In", value: compact(totals?.inputTokens ?? null) },
    { label: "Cache read", value: compact(totals?.cachedInputTokens ?? null) },
    { label: "Out", value: compact(totals?.outputTokens ?? null) },
    { label: "Cache hit", value: cacheHit === null ? "N/A" : `${Math.round(cacheHit)}%` },
    ...(totals?.cacheCreationTokens
      ? [{ label: "Cache write", value: compact(totals.cacheCreationTokens) }]
      : []),
    ...(totals?.reasoningTokens
      ? [{ label: "Reasoning", value: compact(totals.reasoningTokens) }]
      : []),
    ...(outputRate === null ? [] : [{ label: "Speed", value: `${outputRate.toFixed(1)} tok/s` }]),
    ...(contextWindow === null
      ? []
      : [
          {
            label: "Ctx",
            value: `${compact(contextWindow.usedTokens)}${contextWindow.usedPercentage === null ? "" : ` (${Math.round(contextWindow.usedPercentage)}%)`}`,
          },
        ]),
    ...(cost == null
      ? []
      : [
          {
            label: "Cost",
            value:
              cost.currency.toUpperCase() === "USD"
                ? `$${cost.amount.toFixed(2)}`
                : `${cost.amount.toFixed(2)} ${cost.currency}`,
          },
        ]),
  ];

  return (
    <div
      className="relative mx-auto min-w-0 max-w-(--chat-content-max-width) px-3 pt-2.5 sm:px-4"
      data-chat-composer-token-usage="true"
      role="region"
      aria-label="Generation telemetry"
    >
      <details className="group min-w-0">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 py-1 font-mono text-2xs leading-4 text-muted-foreground [&::-webkit-details-marker]:hidden">
          {metrics.map((metric, index) => (
            <Fragment key={metric.label}>
              {index > 0 ? (
                <span aria-hidden className="text-muted-foreground/50">
                  ·
                </span>
              ) : null}
              <span className="whitespace-nowrap tabular-nums">
                {metric.label}: <span className="text-secondary-label">{metric.value}</span>
              </span>
            </Fragment>
          ))}
          <ChevronDownIcon
            className="size-3 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-2 pb-1">
          {latestTurn !== null && latestUsage !== null ? (
            <UsageLine
              label={latestTurnIsRunning ? "Current response" : "Last response"}
              usage={latestUsage}
              outputRate={outputRate}
              durationMs={durationMs}
            />
          ) : (
            <p className="text-3xs leading-4 text-muted-foreground">
              Token counts are not available for this response.
            </p>
          )}
          {reportedResponses > 0 ? (
            <UsageLine
              label={`Thread total · ${reportedResponses} ${reportedResponses === 1 ? "response" : "responses"}`}
              usage={threadTotals}
            />
          ) : null}
          <p className="text-3xs leading-relaxed text-muted-foreground">
            Totals include reported main-agent responses. Input includes cache reads and writes;
            output includes reasoning. Cache hit is the share of input read from cache. Speed is
            averaged over the last turn, including tool calls and pauses.
          </p>
        </div>
      </details>
    </div>
  );
}
