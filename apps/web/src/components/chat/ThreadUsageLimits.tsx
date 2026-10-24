import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import type { EnvironmentId, ServerProviderUsageWindow } from "@t3tools/contracts";
import {
  collectExternalUsageLinks,
  collectLimitAccounts,
  collectLimitNotices,
  type LimitAccount,
} from "@t3tools/shared/usageLimits";
import { ExternalLinkIcon, GaugeIcon } from "lucide-react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { usePrimarySettings } from "../../hooks/useSettings";
import { ensureLocalApi } from "../../localApi";
import { environmentPresentations } from "../../state/presentation";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { barColor } from "../usage/UsageLimits";
import { primaryQuotaWindow, quotaCountdown, quotaPace } from "./ThreadUsageLimits.logic";

function shortWindowLabel(window: ServerProviderUsageWindow) {
  if (window.kind === "session") {
    const minutes = window.windowDurationMins;
    return minutes && minutes % 60 === 0 ? `${minutes / 60}h` : "Session";
  }
  if (window.kind === "weekly") return "Wk";
  if (window.kind === "monthly") return "Mo";
  return window.label;
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
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const primary = primaryQuotaWindow(account.limits.windows);
  if (primary === null) return null;
  const supporting = account.limits.windows.filter((window) => window !== primary);
  const name =
    account.driver === "codex"
      ? "ChatGPT (Codex)"
      : account.driver === "opencode" && primary.id.startsWith("go_")
        ? "OpenCode Go"
        : (providerClients.get(account.driver)?.label ?? account.driver);
  const period =
    primary.kind === "monthly"
      ? "Monthly quota"
      : primary.kind === "weekly"
        ? "Weekly quota"
        : primary.kind === "session"
          ? "Session quota"
          : primary.label;
  const color = account.accentColor ?? barColor(account.driver);
  const used = Math.round(primary.usedPercent);
  const countdown = quotaCountdown(primary.resetsAt, now);
  const pace = quotaPace(primary, now);
  const delta = pace?.deltaPercent ?? null;
  const paceLabel =
    delta === null
      ? null
      : Math.abs(delta) < 0.5
        ? "On pace"
        : `${delta > 0 ? "Over" : "Under"} pace by ${Math.abs(delta).toFixed(1)}%`;

  return (
    <section
      aria-label={`${name} ${period.toLowerCase()}`}
      className="dropdown-glass flex min-w-0 flex-col gap-1.5 rounded-xl p-2.5"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2 font-mono text-xs font-medium">
          <h4 className="min-w-0">{name}</h4>
          <span className="shrink-0 tabular-nums">{used}% used</span>
        </div>
        <span className="text-2xs leading-4 text-muted-foreground">
          {period}
          {account.plan ? ` · ${account.plan}` : ""}
        </span>
        {showIdentity && account.email ? (
          <RedactedSensitiveText
            value={account.email}
            ariaLabel="Toggle account email visibility"
            revealTooltip="Click to reveal account"
            hideTooltip="Click to hide account"
            className="w-fit max-w-full truncate text-3xs text-muted-foreground"
          />
        ) : showIdentity && account.displayName ? (
          <span className="truncate text-3xs text-muted-foreground">{account.displayName}</span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={`${name} ${primary.label} used`}
        aria-valuenow={primary.usedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${primary.usedPercent}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 font-mono text-2xs leading-4 text-muted-foreground tabular-nums">
        {supporting.length > 0 ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-2 gap-y-0.5">
            {supporting.map((window) => {
              const left = quotaCountdown(window.resetsAt, now);
              return (
                <div key={window.id} className="col-span-3 grid grid-cols-subgrid items-baseline">
                  <span className="min-w-0 break-words">{shortWindowLabel(window)}</span>
                  <span className="whitespace-nowrap">{Math.round(window.usedPercent)}% used</span>
                  <span className="text-right">
                    {left === null ? null : left === "Awaiting reset" ? left : `${left} left`}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {countdown !== null && primary.resetsAt ? (
          <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            <span>Resets {formatUpcomingTimestamp(primary.resetsAt, timestampFormat, now)}</span>
            <span className="whitespace-nowrap">
              · {countdown === "Awaiting reset" ? countdown : `${countdown} left`}
            </span>
          </p>
        ) : null}
        {pace !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-secondary-label">
            <span>
              Left{" "}
              {pace.dailyPercent === null
                ? `${pace.remainingPercent.toFixed(1)}%`
                : `${pace.dailyPercent.toFixed(1)}%/day`}
            </span>
            {paceLabel ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      tabIndex={0}
                      className={
                        delta !== null && delta >= 0.5 ? "text-warning-foreground" : undefined
                      }
                    />
                  }
                >
                  <span aria-hidden className="text-muted-foreground">
                    ·{" "}
                  </span>
                  {paceLabel}
                </TooltipTrigger>
                <TooltipPopup side="left">
                  Pace compares quota used with the elapsed share of the billing period. The
                  difference is shown in percentage points.
                </TooltipPopup>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ThreadUsageLimits({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const allPresentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const minute = useNowMinute();
  const now = Date.parse(`${minute}:00Z`);
  const presentation = allPresentations.get(environmentId);
  if (!presentation?.serverConfig) return null;

  const presentations = new Map([[environmentId, presentation]]);
  const accounts = collectLimitAccounts(presentations);
  const notices = collectLimitNotices(presentations);
  const externalLinks = collectExternalUsageLinks(presentations);

  return (
    <section
      aria-label="Usage limits"
      data-thread-usage-limits
      className="flex min-w-0 flex-col gap-1.5"
    >
      <div className="flex items-center justify-between gap-2 px-1.5">
        <h3 className="flex items-center gap-1.5 text-2xs font-medium text-secondary-label">
          <GaugeIcon className="size-3.5" aria-hidden />
          Usage limits
        </h3>
        <Button variant="ghost-muted" size="xs" render={<Link to="/usage" />}>
          Details
        </Button>
      </div>
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
      {accounts.length === 0 && notices.length === 0 ? (
        <p className="dropdown-glass rounded-xl p-3.5 text-2xs leading-relaxed text-muted-foreground">
          No subscription limits reported by connected providers.
        </p>
      ) : null}
      {notices.map((notice) => (
        <p
          key={notice}
          className="dropdown-glass rounded-xl p-3.5 text-2xs leading-relaxed text-muted-foreground"
        >
          {notice}
        </p>
      ))}
      {externalLinks.map((link) => (
        <div key={link.url} className="self-start">
          <Button
            variant="link"
            size="xs"
            onClick={() => void ensureLocalApi().shell.openExternal(link.url)}
          >
            {link.label}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </Button>
        </div>
      ))}
    </section>
  );
}
