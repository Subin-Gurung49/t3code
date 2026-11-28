import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import type { EnvironmentId, ServerProviderUsageWindow } from "@t3tools/contracts";
import { collectLimitAccounts, type LimitAccount } from "@t3tools/shared/usageLimits";
import { collectLimitNotices } from "@t3tools/shared/usageLimitsCopy";
import {
  currentUsedPercent,
  deepSeekPricingPeriod,
  quotaCardModel,
  quotaPace,
  quotaRows,
  shortQuotaCountdown,
} from "@t3tools/shared/usageQuotaCards";
import { msg, T, useGT, useMessages } from "gt-react";
import { Clock3Icon, GaugeIcon } from "lucide-react";
import { useState } from "react";

import { m, type MessageResolver } from "../../i18n/messages";
import { useNowMinute } from "../../hooks/useNowMinute";
import { usePrimarySettings } from "../../hooks/useSettings";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { barColor } from "../usage/UsageLimits";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

function shortWindowLabel(window: ServerProviderUsageWindow, resolve: MessageResolver = m) {
  if (window.kind === "session") {
    const minutes = window.windowDurationMins;
    return minutes && minutes % 60 === 0 ? `${minutes / 60}h` : resolve(msg("Session"));
  }
  if (window.kind === "weekly") return resolve(msg("Weekly"));
  if (window.kind === "monthly") return resolve(msg("Monthly"));
  return window.label;
}

function DeepSeekPricingStatus({ now }: { readonly now: number }) {
  const gt = useGT();
  const period = deepSeekPricingPeriod(now);
  const color =
    period === "peak"
      ? "text-warning-foreground"
      : period === "off-peak"
        ? "text-success-foreground"
        : "text-muted-foreground";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="w-fit rounded-sm text-3xs leading-4 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <T>DeepSeek ·</T>{" "}
        <span className={color}>
          {period === "peak"
            ? gt("Peak")
            : period === "off-peak"
              ? gt("Off-peak")
              : gt("Check pricing")}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left">
        {period === null
          ? gt(
              "Confirm current pricing: the Chinese public holiday calendar for this year is not available.",
            )
          : gt(
              "Peak: Mon–Fri, 01:00–04:00 and 06:00–10:00 UTC. Other hours, weekends and Chinese public holidays are off-peak.",
            )}
      </TooltipPopup>
    </Tooltip>
  );
}

function QuotaRow({
  name,
  window,
  label,
  color,
  warnAt,
  showPace,
  now,
}: {
  readonly name: string;
  readonly window: ServerProviderUsageWindow;
  readonly label: string;
  readonly color: string;
  readonly warnAt: number;
  readonly showPace: boolean;
  readonly now: number;
}) {
  const gt = useGT();
  const m = useMessages();
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const percent = currentUsedPercent(window, now);
  const warn = percent >= warnAt;
  const delta = showPace ? (quotaPace(window, now)?.deltaPercent ?? null) : null;
  const expected = delta === null ? null : Math.max(0, Math.min(100, percent - delta));
  const countdown = shortQuotaCountdown(window.resetsAt, now);
  const valueLabel = m(msg("used"));
  const windowLabel = shortWindowLabel(window, m);

  return (
    <>
      <span className="min-w-0 break-words text-2xs leading-4 text-secondary-label">{label}</span>
      <div
        role="progressbar"
        aria-label={gt("{name} {window} {value}", { name, window: label, value: valueLabel })}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-1.5 min-w-8 rounded-full bg-foreground/10"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, percent)}%`,
            backgroundColor: warn ? "var(--warning)" : color,
          }}
        />
        {expected === null ? null : (
          <span
            aria-hidden
            className="absolute -inset-y-0.5 w-px bg-foreground/60"
            style={{ left: `${expected}%` }}
          />
        )}
      </div>
      <span
        className={`text-right text-2xs font-medium leading-4 tabular-nums ${warn ? "text-warning-foreground" : "text-foreground"}`}
      >
        {Math.round(percent)}%
      </span>
      {countdown !== null && window.resetsAt ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="flex w-fit items-center gap-1 rounded-sm text-3xs leading-4 tabular-nums text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            }
          >
            <Clock3Icon className="size-2.5 shrink-0" aria-hidden />
            {countdown === "Awaiting reset" ? m(msg("Awaiting reset")) : countdown}
          </TooltipTrigger>
          <TooltipPopup side="left">
            {m(
              msg("{window} resets {time}", {
                window: windowLabel,
                time: formatUpcomingTimestamp(window.resetsAt, timestampFormat, now, undefined, m),
              }),
            )}
          </TooltipPopup>
        </Tooltip>
      ) : (
        <span />
      )}
    </>
  );
}

function PaceLine({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const m = useMessages();
  const pace = quotaPace(window, now);
  if (pace === null) return null;
  const delta = pace.deltaPercent;
  const paceLabel =
    delta === null
      ? null
      : Math.abs(delta) < 0.5
        ? m(msg("On pace"))
        : delta > 0
          ? m(msg("Over pace by {percent}%", { percent: Math.abs(delta).toFixed(1) }))
          : m(msg("Under pace by {percent}%", { percent: Math.abs(delta).toFixed(1) }));
  const paceColor =
    delta === null || Math.abs(delta) < 0.5
      ? "text-muted-foreground"
      : delta > 0
        ? "text-warning-foreground"
        : "text-success-foreground";

  return (
    <div className="col-span-full flex min-w-0 flex-wrap items-center justify-between gap-x-2 text-3xs leading-4 tabular-nums">
      {paceLabel ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className={`inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${paceColor}`}
              />
            }
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
            {paceLabel}
          </TooltipTrigger>
          <TooltipPopup side="left">
            <T>
              Pace compares quota used with the elapsed share of the billing period. The difference
              is shown in percentage points.
            </T>
          </TooltipPopup>
        </Tooltip>
      ) : null}
      <span className="ml-auto text-muted-foreground">
        {pace.dailyPercent === null
          ? m(msg("{percent}% left", { percent: pace.remainingPercent.toFixed(1) }))
          : m(msg("{percent}% / day left", { percent: pace.dailyPercent.toFixed(1) }))}
      </span>
    </div>
  );
}

function AccountQuotaCard({
  account,
  showIdentity,
  now,
}: {
  readonly account: LimitAccount;
  readonly showIdentity: boolean;
  readonly now: number;
}) {
  const gt = useGT();
  const m = useMessages();
  const model = quotaCardModel(account.driver, account.limits.windows);
  if (model === null || model.groups.length === 0) return null;
  const { primary, isAntigravity, isOpenCodeGo } = model;
  const name =
    account.driver === "codex"
      ? "ChatGPT (Codex)"
      : isOpenCodeGo
        ? "OpenCode Go"
        : (providerClients.get(account.driver)?.label ?? account.driver);
  const period =
    primary.kind === "monthly"
      ? m(msg("Monthly quota"))
      : primary.kind === "weekly"
        ? m(msg("Weekly quota"))
        : primary.kind === "session"
          ? m(msg("Session quota"))
          : primary.label;
  const color = account.accentColor ?? barColor(account.driver);
  const warnAt = isAntigravity ? 75 : 90;

  return (
    <section
      aria-label={gt("{name} {scope}", {
        name,
        scope: isAntigravity ? gt("usage limits") : period.toLowerCase(),
      })}
      className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <ProviderInstanceIcon
          driverKind={account.driver}
          displayName={name}
          iconClassName="size-3.5"
        />
        <h4 className="text-xs font-medium leading-4">{name}</h4>
        {account.plan ? (
          <span className="min-w-0 break-words text-3xs leading-4 text-muted-foreground">
            {account.plan}
          </span>
        ) : null}
        {isOpenCodeGo ? <DeepSeekPricingStatus now={now} /> : null}
        {showIdentity && account.email ? (
          <RedactedSensitiveText
            value={account.email}
            ariaLabel={gt("Toggle account email visibility")}
            revealTooltip={gt("Click to reveal account")}
            hideTooltip={gt("Click to hide account")}
            className="w-fit max-w-full truncate text-3xs text-muted-foreground"
          />
        ) : showIdentity && account.displayName ? (
          <span className="truncate text-3xs text-muted-foreground">{account.displayName}</span>
        ) : null}
      </div>
      <div className="grid min-w-0 grid-cols-[3.25rem_minmax(2rem,1fr)_2.25rem_3.75rem] items-center gap-x-2 gap-y-1">
        {model.groups.map((group, groupIndex) => {
          const groupPrimary = isAntigravity ? group.primary : primary;
          return (
            <div key={group.label ?? "quota"} className="contents">
              {group.label === null ? null : (
                <h5
                  className={`col-span-full text-3xs font-medium leading-4 text-muted-foreground ${groupIndex === 0 ? "" : "pt-1"}`}
                >
                  {group.label}
                </h5>
              )}
              {quotaRows(groupPrimary, group.windows).map((window) => (
                <QuotaRow
                  key={window.id}
                  name={name}
                  window={window}
                  label={
                    isAntigravity && window.kind === "other"
                      ? window.label.split(" · ").slice(1).join(" · ") || window.label
                      : shortWindowLabel(window, m)
                  }
                  color={color}
                  warnAt={warnAt}
                  showPace={window === groupPrimary}
                  now={now}
                />
              ))}
              {groupPrimary ? <PaceLine window={groupPrimary} now={now} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ThreadUsageLimits({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const gt = useGT();
  const m = useMessages();
  const allPresentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const canRefresh = useAtomValue(serverEnvironment.refreshProviders.permissionAtom(environmentId));
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const minute = useNowMinute();
  const now = Date.parse(`${minute}:00Z`);
  const presentation = allPresentations.get(environmentId);
  if (!presentation?.serverConfig) return null;

  const presentations = new Map([[environmentId, presentation]]);
  const accounts = collectLimitAccounts(presentations);
  const notices = collectLimitNotices(presentations, m);
  const refreshDisabled =
    isRefreshing || !canRefresh || presentation.connection.phase !== "connected";

  const refresh = async () => {
    if (refreshDisabled) return;
    setIsRefreshing(true);
    try {
      const result = await refreshUsageLimits(environmentId, () =>
        refreshProviders({ environmentId, input: { limitsOnly: true } }),
      );
      if (result?._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: m(msg("Could not refresh usage limits")),
          description: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: m(msg("Could not refresh usage limits")),
        description: error instanceof Error ? error.message : String(error),
      });
    }
    setIsRefreshing(false);
  };

  return (
    <section
      aria-label={gt("Usage limits")}
      data-thread-usage-limits
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2 px-1.5">
        <h3 className="flex items-center gap-1.5 text-2xs font-medium text-secondary-label">
          <GaugeIcon className="size-3.5" aria-hidden />
          <T>Usage limits</T>
        </h3>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label={gt("Refresh usage limits")}
                  aria-busy={isRefreshing}
                  disabled={refreshDisabled}
                  onClick={() => void refresh()}
                >
                  <RefreshIcon refreshing={isRefreshing} />
                </Button>
              }
            />
            <TooltipPopup side="top">
              {isRefreshing ? gt("Refreshing usage limits…") : gt("Refresh usage limits")}
            </TooltipPopup>
          </Tooltip>
          <Button variant="ghost-muted" size="xs" render={<Link to="/usage" />}>
            <T>Details</T>
          </Button>
        </div>
      </div>
      {accounts.length > 0 ? (
        <div className="flex min-w-0 flex-col divide-y divide-border/50 rounded-xl border border-border/60 bg-card">
          {accounts.map((account) => (
            <AccountQuotaCard
              key={account.key}
              account={account}
              showIdentity={
                accounts.filter((candidate) => candidate.driver === account.driver).length > 1
              }
              now={now}
            />
          ))}
        </div>
      ) : null}
      {accounts.length === 0 && notices.length === 0 ? (
        <p className="dropdown-glass rounded-xl px-3 py-2.5 text-2xs leading-relaxed text-muted-foreground">
          <T>No subscription limits reported by connected providers.</T>
        </p>
      ) : null}
      {notices.map((notice) => (
        <p
          key={notice}
          className="dropdown-glass rounded-xl px-3 py-2 text-2xs leading-relaxed text-muted-foreground"
        >
          {notice}
        </p>
      ))}
    </section>
  );
}
