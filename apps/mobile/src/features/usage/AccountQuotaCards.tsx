import type { ServerProviderUsageWindow, UsageProviderKind } from "@t3tools/contracts";
import type { LimitAccount } from "@t3tools/shared/usageLimits";
import {
  currentUsedPercent,
  deepSeekPricingPeriod,
  quotaCardModel,
  quotaPace,
  quotaRows,
  shortQuotaCountdown,
} from "@t3tools/shared/usageQuotaCards";
import { msg, T, useGT, useMessages } from "gt-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { m, type MessageResolver } from "../../i18n/messages";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { ResetCredits } from "./UsageLimitsSection";
import { PROVIDER_LABEL, usageProviderKind, useProviderColors } from "./usageProviders";

const WARNING_COLOR = "#f59e0b";

function shortWindowLabel(window: ServerProviderUsageWindow, resolve: MessageResolver = m) {
  if (window.kind === "session") {
    const minutes = window.windowDurationMins;
    return minutes && minutes % 60 === 0 ? `${minutes / 60}h` : resolve(msg("Session"));
  }
  if (window.kind === "weekly") return resolve(msg("Weekly"));
  if (window.kind === "monthly") return resolve(msg("Monthly"));
  return window.label;
}

function accountName(account: LimitAccount, isOpenCodeGo: boolean, resolve: MessageResolver = m) {
  if (account.driver === "codex") return resolve(msg("ChatGPT (Codex)"));
  if (isOpenCodeGo) return resolve(msg("OpenCode Go"));
  const kind = usageProviderKind(account.driver);
  return kind ? PROVIDER_LABEL[kind] : String(account.driver);
}

function AccountIdentity({ account }: { readonly account: LimitAccount }) {
  const gt = useGT();
  const [revealed, setRevealed] = useState(false);
  if (account.email) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={revealed ? gt("Hide account email") : gt("Reveal account email")}
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

function QuotaRow({
  window,
  label,
  color,
  warnAt,
  showPace,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly label: string;
  readonly color: string;
  readonly warnAt: number;
  readonly showPace: boolean;
  readonly now: number;
}) {
  const m = useMessages();
  const percent = currentUsedPercent(window, now);
  const warn = percent >= warnAt;
  const delta = showPace ? (quotaPace(window, now)?.deltaPercent ?? null) : null;
  const expected = delta === null ? null : Math.max(0, Math.min(100, percent - delta));
  const countdown = shortQuotaCountdown(window.resetsAt, now);
  return (
    <View className="flex-row items-center gap-2">
      <Text className="w-14 text-2xs text-foreground-muted">{label}</Text>
      <View className="h-1.5 min-w-8 flex-1 justify-center">
        <View className="h-1.5 flex-row overflow-hidden rounded-full bg-subtle">
          <View
            className="h-full rounded-full"
            style={{
              flex: Math.min(100, percent),
              backgroundColor: warn ? WARNING_COLOR : color,
            }}
          />
          <View style={{ flex: 100 - Math.min(100, percent) }} />
        </View>
        {expected === null ? null : (
          <View
            className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground-muted"
            style={{ left: `${expected}%` }}
          />
        )}
      </View>
      <Text
        className={`w-10 text-right text-2xs font-t3-medium tabular-nums ${warn ? "text-warning-foreground" : "text-foreground"}`}
      >
        {Math.round(percent)}%
      </Text>
      <View className="w-16 flex-row items-center gap-1">
        {countdown === null ? null : (
          <>
            <SymbolView name="clock" size={9} tintColorClassName="accent-foreground-muted" />
            <Text className="text-3xs tabular-nums text-foreground-muted">
              {countdown === "Awaiting reset" ? m(msg("Awaiting reset")) : countdown}
            </Text>
          </>
        )}
      </View>
    </View>
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
  const paceClassName =
    delta === null || Math.abs(delta) < 0.5
      ? "text-foreground-muted"
      : delta > 0
        ? "text-warning-foreground"
        : "text-adaptive-emerald-600-400";
  const overPace = delta !== null && delta >= 0.5;
  const paceDotClassName =
    delta === null || Math.abs(delta) < 0.5
      ? "bg-foreground-muted"
      : overPace
        ? ""
        : "bg-adaptive-emerald-600-400";
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-2">
      {paceLabel ? (
        <View className="flex-row items-center gap-1">
          <View
            className={`size-1.5 rounded-full ${paceDotClassName}`}
            style={overPace ? { backgroundColor: WARNING_COLOR, borderRadius: 999 } : undefined}
          />
          <Text className={`text-3xs tabular-nums ${paceClassName}`}>{paceLabel}</Text>
        </View>
      ) : null}
      <Text className="ml-auto text-3xs tabular-nums text-foreground-muted">
        {pace.dailyPercent === null
          ? m(msg("{percent}% left", { percent: pace.remainingPercent.toFixed(1) }))
          : m(msg("{percent}% / day left", { percent: pace.dailyPercent.toFixed(1) }))}
      </Text>
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
  const gt = useGT();
  const m = useMessages();
  const model = quotaCardModel(account.driver, account.limits.windows);
  if (model === null || model.groups.length === 0) return null;
  const { primary, isAntigravity, isOpenCodeGo, groups } = model;
  const redeem = account.redeem;
  const resetCredits = account.limits.resetCredits;
  const name = accountName(account, isOpenCodeGo, m);
  const period =
    primary.kind === "monthly"
      ? m(msg("Monthly quota"))
      : primary.kind === "weekly"
        ? m(msg("Weekly quota"))
        : primary.kind === "session"
          ? m(msg("Session quota"))
          : primary.label;
  const pricing = isOpenCodeGo ? deepSeekPricingPeriod(now) : null;
  const color = windowColor(account, colors);
  const warnAt = isAntigravity ? 75 : 90;

  return (
    <View
      accessibilityLabel={gt("{name} {scope}", {
        name,
        scope: isAntigravity ? gt("usage limits") : period.toLowerCase(),
      })}
      className="gap-1.5 px-3.5 py-3"
    >
      <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <ProviderIcon provider={account.driver} size={14} />
        <Text className="text-sm font-t3-medium text-foreground">{name}</Text>
        {account.plan ? (
          <Text className="text-3xs text-foreground-muted">{account.plan}</Text>
        ) : null}
        {pricing !== null ? (
          <Text
            className={
              pricing === "peak"
                ? "text-3xs text-warning-foreground"
                : "text-3xs text-foreground-muted"
            }
          >
            <T>DeepSeek ·</T>{" "}
            {pricing === "peak"
              ? gt("Peak")
              : pricing === "off-peak"
                ? gt("Off-peak")
                : gt("Check pricing")}
          </Text>
        ) : null}
        {showIdentity ? <AccountIdentity account={account} /> : null}
      </View>
      {groups.map((group, groupIndex) => {
        const groupPrimary = isAntigravity ? group.primary : primary;
        return (
          <View key={group.label ?? "quota"} className={groupIndex === 0 ? "gap-1" : "gap-1 pt-1"}>
            {group.label === null ? null : (
              <Text className="text-3xs font-t3-medium text-foreground-muted">{group.label}</Text>
            )}
            {quotaRows(groupPrimary, group.windows).map((window) => (
              <QuotaRow
                key={window.id}
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
          </View>
        );
      })}
      {redeem && resetCredits && resetCredits.availableCount > 0 ? (
        <View className="border-t border-border-subtle pt-2">
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
    <View className="w-full max-w-[720px] self-center overflow-hidden rounded-[20px] border-continuous bg-grouped-card">
      {accounts.map((account, index) => (
        <View key={account.key} className={index === 0 ? "" : "border-t border-border-subtle"}>
          <AccountQuotaCard
            account={account}
            showIdentity={(driverCounts.get(account.driver) ?? 0) > 1}
            now={now}
            colors={colors}
          />
        </View>
      ))}
    </View>
  );
}
