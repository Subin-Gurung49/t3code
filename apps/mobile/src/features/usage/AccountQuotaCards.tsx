import type { ServerProviderUsageWindow, UsageProviderKind } from "@t3tools/contracts";
import type { LimitAccount } from "@t3tools/shared/usageLimits";
import {
  deepSeekPricingPeriod,
  quotaCardModel,
  quotaCountdown,
  quotaPace,
} from "@t3tools/shared/usageQuotaCards";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { ResetCredits } from "./UsageLimitsSection";
import { PROVIDER_LABEL, usageProviderKind, useProviderColors } from "./usageProviders";

function shortWindowLabel(window: ServerProviderUsageWindow) {
  if (window.kind === "session") {
    const minutes = window.windowDurationMins;
    return minutes && minutes % 60 === 0 ? `${minutes / 60}h` : "Session";
  }
  if (window.kind === "weekly") return "Weekly";
  if (window.kind === "monthly") return "Monthly";
  return window.label;
}

function accountName(account: LimitAccount, isOpenCodeGo: boolean) {
  if (account.driver === "codex") return "ChatGPT (Codex)";
  if (isOpenCodeGo) return "OpenCode Go";
  const kind = usageProviderKind(account.driver);
  return kind ? PROVIDER_LABEL[kind] : String(account.driver);
}

function AccountIdentity({ account }: { readonly account: LimitAccount }) {
  const [revealed, setRevealed] = useState(false);
  if (account.email) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={revealed ? "Hide account email" : "Reveal account email"}
        onPress={() => setRevealed((value) => !value)}
        className="self-start active:opacity-60"
      >
        <Text className="text-3xs text-foreground-muted" numberOfLines={1}>
          {revealed ? account.email : "••••••@••••••"}
        </Text>
      </Pressable>
    );
  }
  return account.displayName ? (
    <Text className="text-3xs text-foreground-muted" numberOfLines={1}>
      {account.displayName}
    </Text>
  ) : null;
}

function windowColor(
  account: LimitAccount,
  colors: Readonly<Record<UsageProviderKind, string>>,
): string {
  if (account.accentColor) return account.accentColor;
  const kind = usageProviderKind(account.driver);
  return kind ? colors[kind] : colors.codex;
}

function QuotaSummary({ window }: { readonly window: ServerProviderUsageWindow }) {
  return (
    <View className="shrink-0 items-end">
      <Text className="text-2xl font-t3-medium tabular-nums text-foreground">
        {Math.round(window.usedPercent)}
        <Text className="text-sm text-foreground-muted">%</Text>
      </Text>
      <Text className="text-3xs text-foreground-muted">{shortWindowLabel(window)} used</Text>
    </View>
  );
}

function QuotaFooter({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const countdown = quotaCountdown(window.resetsAt, now);
  const pace = quotaPace(window, now);
  const delta = pace?.deltaPercent ?? null;
  const paceLabel =
    delta === null
      ? null
      : Math.abs(delta) < 0.5
        ? "On pace"
        : `${delta > 0 ? "Over" : "Under"} pace by ${Math.abs(delta).toFixed(1)}%`;
  const paceClassName =
    delta === null || Math.abs(delta) < 0.5
      ? "text-foreground-muted"
      : delta > 0
        ? "text-warning-foreground"
        : "text-adaptive-emerald-600-400";
  const paceDotClassName =
    delta === null || Math.abs(delta) < 0.5
      ? "bg-foreground-muted"
      : delta > 0
        ? "bg-warning"
        : "bg-adaptive-emerald-600-400";

  return (
    <View className="gap-1.5">
      {countdown !== null && window.resetsAt ? (
        <View className="flex-row items-center gap-1.5">
          <SymbolView name="clock" size={11} tintColorClassName="accent-foreground-muted" />
          <Text className="text-3xs tabular-nums text-foreground-muted">
            {shortWindowLabel(window)}{" "}
            {countdown === "Awaiting reset" ? "awaiting reset" : `resets in ${countdown}`}
          </Text>
        </View>
      ) : null}
      {pace !== null ? (
        <View className="flex-row flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border-subtle pt-1.5">
          {paceLabel ? (
            <View className="flex-row items-center gap-1.5">
              <View className={`size-1.5 rounded-full ${paceDotClassName}`} />
              <Text className={`text-3xs tabular-nums ${paceClassName}`}>{paceLabel}</Text>
            </View>
          ) : (
            <View />
          )}
          <Text className="text-3xs tabular-nums text-foreground-muted">
            {pace.dailyPercent === null
              ? `${pace.remainingPercent.toFixed(1)}% left`
              : `${pace.dailyPercent.toFixed(1)}% / day left`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function QuotaWindowRow({
  account,
  window,
  primary,
  now,
  colors,
}: {
  readonly account: LimitAccount;
  readonly window: ServerProviderUsageWindow;
  readonly primary: ServerProviderUsageWindow;
  readonly now: number;
  readonly colors: Readonly<Record<UsageProviderKind, string>>;
}) {
  const isAntigravity = account.driver === "antigravity";
  const percent = isAntigravity ? 100 - window.usedPercent : window.usedPercent;
  const left = !isAntigravity && window === primary ? null : quotaCountdown(window.resetsAt, now);
  const label =
    isAntigravity && window.kind === "other"
      ? window.label.split(" · ").slice(1).join(" · ") || window.label
      : shortWindowLabel(window);
  const color = windowColor(account, colors);
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="min-w-0 flex-1 text-2xs text-foreground-muted">{label}</Text>
        <View className="flex-row items-baseline gap-2">
          {left === null ? null : (
            <Text className="text-3xs text-foreground-tertiary">
              {left === "Awaiting reset" ? left : `${left} left`}
            </Text>
          )}
          <Text className="text-2xs font-t3-medium tabular-nums text-foreground">
            {Math.round(percent)}%
            <Text className="font-normal text-foreground-muted">
              {isAntigravity ? " remaining" : " used"}
            </Text>
          </Text>
        </View>
      </View>
      <View className="h-1.5 flex-row overflow-hidden rounded-full bg-subtle">
        <View
          className="h-full rounded-full"
          style={{
            flex: percent,
            backgroundColor: isAntigravity && percent <= 25 ? "#f59e0b" : color,
          }}
        />
        <View style={{ flex: 100 - percent }} />
      </View>
    </View>
  );
}

function AccountQuotaCard({
  account,
  showIdentity,
  now,
  colors,
}: {
  readonly account: LimitAccount;
  readonly showIdentity: boolean;
  readonly now: number;
  readonly colors: Readonly<Record<UsageProviderKind, string>>;
}) {
  const model = quotaCardModel(account.driver, account.limits.windows);
  if (model === null || model.groups.length === 0) return null;
  const { primary, isAntigravity, isOpenCodeGo, groups } = model;
  const redeem = account.redeem;
  const resetCredits = account.limits.resetCredits;
  const name = accountName(account, isOpenCodeGo);
  const period =
    primary.kind === "monthly"
      ? "Monthly quota"
      : primary.kind === "weekly"
        ? "Weekly quota"
        : primary.kind === "session"
          ? "Session quota"
          : primary.label;
  const pricing = isOpenCodeGo ? deepSeekPricingPeriod(now) : null;

  return (
    <View
      accessibilityLabel={`${name} ${isAntigravity ? "usage limits" : period.toLowerCase()}`}
      className="gap-3 rounded-[24px] border-continuous bg-grouped-card p-4"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <View className="size-8 shrink-0 items-center justify-center rounded-lg bg-subtle">
            <ProviderIcon provider={account.driver} size={16} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-sm font-t3-medium text-foreground" numberOfLines={1}>
              {name}
            </Text>
            {account.plan ? (
              <Text className="text-3xs text-foreground-muted" numberOfLines={1}>
                {account.plan}
              </Text>
            ) : null}
            {pricing !== null ? (
              <Text
                className={
                  pricing === "peak"
                    ? "text-3xs text-warning-foreground"
                    : "text-3xs text-foreground-muted"
                }
              >
                DeepSeek ·{" "}
                {pricing === "peak"
                  ? "Peak"
                  : pricing === "off-peak"
                    ? "Off-peak"
                    : "Check pricing"}
              </Text>
            ) : null}
            {showIdentity ? <AccountIdentity account={account} /> : null}
          </View>
        </View>
        {isAntigravity ? (
          <View className="shrink-0 rounded-md bg-subtle px-2 py-1">
            <Text className="text-3xs text-foreground-muted">Model quotas</Text>
          </View>
        ) : (
          <QuotaSummary window={primary} />
        )}
      </View>
      <View className="gap-2.5">
        {groups.map((group, groupIndex) => {
          const groupPrimary = group.primary;
          const windows = group.windows;
          return (
            <View
              key={group.label ?? "quota"}
              className={
                groupIndex === 0 ? "gap-2.5" : "gap-2.5 border-t border-border-subtle pt-2.5"
              }
            >
              {group.label === null ? null : (
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="pt-1 text-2xs font-t3-medium text-foreground-muted">
                    {group.label}
                  </Text>
                  {groupPrimary ? <QuotaSummary window={groupPrimary} /> : null}
                </View>
              )}
              {windows.map((window) => (
                <QuotaWindowRow
                  key={window.id}
                  account={account}
                  window={window}
                  primary={primary}
                  now={now}
                  colors={colors}
                />
              ))}
              {groupPrimary ? <QuotaFooter window={groupPrimary} now={now} /> : null}
            </View>
          );
        })}
      </View>
      {isAntigravity ? null : <QuotaFooter window={primary} now={now} />}
      {redeem && resetCredits && resetCredits.availableCount > 0 ? (
        <View className="border-t border-border-subtle pt-3">
          <ResetCredits
            environmentId={redeem.environmentId}
            input={redeem.input}
            credits={resetCredits}
            now={now}
          />
        </View>
      ) : null}
    </View>
  );
}

export function AccountQuotaCards({
  accounts,
  now,
}: {
  readonly accounts: readonly LimitAccount[];
  readonly now: number;
}) {
  const colors = useProviderColors();
  if (accounts.length === 0) return null;
  const driverCounts = new Map<string, number>();
  for (const account of accounts) {
    driverCounts.set(account.driver, (driverCounts.get(account.driver) ?? 0) + 1);
  }
  return (
    <View className="w-full max-w-[720px] self-center gap-3">
      {accounts.map((account) => (
        <AccountQuotaCard
          key={account.key}
          account={account}
          showIdentity={(driverCounts.get(account.driver) ?? 0) > 1}
          now={now}
          colors={colors}
        />
      ))}
    </View>
  );
}
