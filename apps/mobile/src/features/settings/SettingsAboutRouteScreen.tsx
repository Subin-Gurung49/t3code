import { msg, T, useGT } from "gt-react-native";
import * as Dialog from "../../components/ui/Dialog";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { useDeadlinePassed } from "../../lib/clock";
import {
  type AppUpdateCheckState,
  isAppUpdateCheckAvailable,
  registerHiddenUpdateTap,
  runAppUpdateCheck,
} from "../updates/app-updates";
import {
  type AndroidReleaseUpdateState,
  canCheckAndroidReleaseUpdates,
  runAndroidReleaseUpdateCheck,
} from "../updates/android-release-updates";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";
import { m } from "../../i18n/messages";

export function SettingsAboutRouteScreen() {
  const gt = useGT();
  const insets = useSafeAreaInsets();

  return (
    <SettingsScreen title={gt("About")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <AppSettingsSection />
      </ScrollView>
    </SettingsScreen>
  );
}

function AppSettingsSection() {
  const gt = useGT();
  const [checkState, setCheckState] = useState<{
    readonly state: AppUpdateCheckState;
    // "Up to date" is a confirmation that fades back to idle.
    readonly settledUntil: number | null;
  }>({ state: "idle", settledUntil: null });
  const confirmationExpired = useDeadlinePassed(checkState.settledUntil);
  const updateState =
    checkState.state === "current" && confirmationExpired ? "idle" : checkState.state;
  const [releaseCheckState, setReleaseCheckState] = useState<{
    readonly state: AndroidReleaseUpdateState;
    readonly settledUntil: number | null;
  }>({ state: "idle", settledUntil: null });
  const releaseConfirmationExpired = useDeadlinePassed(releaseCheckState.settledUntil);
  const releaseUpdateState =
    releaseCheckState.state === "current" && releaseConfirmationExpired
      ? "idle"
      : releaseCheckState.state;
  const updateInFlight = useRef(false);
  const releaseUpdateInFlight = useRef(false);
  const hiddenUpdateTapCount = useRef(0);

  const version = Constants.expoConfig?.version ?? "0.0.0";
  // Match app.config.ts's production fallback to avoid mislabeling builds as development.
  const variant = (Constants.expoConfig?.extra?.appVariant as string | undefined) ?? "production";
  const variantLabel = variant === "production" ? "" : capitalize(variant);
  // EAS assigns build numbers remotely; only the installed binary knows its own.
  const build = Application.nativeBuildVersion;
  const versionWithBuild = build ? `${version} (${build})` : version;
  const versionLabel = variantLabel ? `${versionWithBuild} · ${variantLabel}` : versionWithBuild;
  const updateCheckAvailable = isAppUpdateCheckAvailable();
  const releaseRepository = Constants.expoConfig?.extra?.mobileUpdateRepository as
    | string
    | undefined;
  const releaseUpdateAvailable = canCheckAndroidReleaseUpdates({
    appVariant: variant,
    buildVersion: Application.nativeBuildVersion,
    repository: releaseRepository,
  });
  const busy =
    updateState === "checking" || updateState === "downloading" || updateState === "restarting";
  const releaseUpdateBusy =
    releaseUpdateState === "checking" ||
    releaseUpdateState === "downloading" ||
    releaseUpdateState === "openingInstaller";

  async function checkForUpdate() {
    // disabled updates next render; the ref blocks same-frame double taps.
    if (updateInFlight.current) return;
    updateInFlight.current = true;
    // Failures arrive through onFailure; the settled result only matters for unlocking.
    await settlePromise(() =>
      runAppUpdateCheck({
        applyMode: "immediate",
        onFailure: (message) => Dialog.alert(gt("Update failed"), message),
        onStateChange: (state) =>
          setCheckState({
            state,
            settledUntil: state === "current" ? Date.now() + 3000 : null,
          }),
      }),
    );
    updateInFlight.current = false;
  }

  async function checkForAndroidReleaseUpdate() {
    if (releaseUpdateInFlight.current || !releaseRepository) return;
    releaseUpdateInFlight.current = true;
    try {
      await runAndroidReleaseUpdateCheck({
        buildVersion: Application.nativeBuildVersion,
        onStateChange: (state) =>
          setReleaseCheckState({
            state,
            settledUntil: state === "current" ? Date.now() + 3000 : null,
          }),
        repository: releaseRepository,
      });
    } catch (error) {
      setReleaseCheckState({ state: "idle", settledUntil: null });
      Dialog.alert(
        m(msg("App update failed")),
        error instanceof Error
          ? error.message
          : m(msg("Could not download or open the Android update.")),
      );
    }
    releaseUpdateInFlight.current = false;
    setReleaseCheckState((current) =>
      current.state === "openingInstaller" ? { state: "idle", settledUntil: null } : current,
    );
  }

  function handleVersionPress() {
    if (!updateCheckAvailable || updateInFlight.current) return;
    const tap = registerHiddenUpdateTap(hiddenUpdateTapCount.current);
    hiddenUpdateTapCount.current = tap.nextCount;
    if (tap.shouldCheck) {
      void checkForUpdate();
    }
  }

  const statusLabel =
    updateState === "checking"
      ? gt("Checking…")
      : updateState === "downloading"
        ? gt("Downloading…")
        : updateState === "ready"
          ? gt("Update ready")
          : updateState === "restarting"
            ? gt("Restarting…")
            : updateState === "current"
              ? gt("Up to date")
              : null;
  const releaseStatusLabel =
    releaseUpdateState === "checking"
      ? "Checking GitHub Releases…"
      : releaseUpdateState === "downloading"
        ? "Downloading APK…"
        : releaseUpdateState === "openingInstaller"
          ? "Opening Android installer…"
          : releaseUpdateState === "current"
            ? "Up to date"
            : "Check GitHub Releases";

  const versionRow = (
    <View className="flex-row items-center gap-4 p-4">
      <SymbolView
        name="info.circle"
        size={22}
        tintColorClassName="accent-icon"
        type="monochrome"
        weight="regular"
      />
      <Text className="flex-1 text-lg text-foreground">
        <T>Version</T>
      </Text>
      <View className="items-end">
        <Text className="text-lg text-foreground-muted">{versionLabel}</Text>
        {statusLabel ? (
          <Text className="text-xs text-foreground-muted/70">{statusLabel}</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <SettingsSection title={gt("App", { $context: "settings section about this mobile app" })}>
      <SettingsRow
        icon="internaldrive"
        label={gt("Client Storage")}
        target="SettingsClientStorage"
      />
      <SettingsRow icon="stethoscope" label={gt("Diagnostics")} target="SettingsDiagnostics" />
      <SettingsRow
        icon="doc.on.doc"
        label={gt("Open source licenses")}
        target="SettingsOpenSourceLicenses"
      />
      <SettingsRow icon="doc.text" label={gt("Legal")} fullScreenTarget="SettingsLegal" />
      {releaseUpdateAvailable ? (
        <SettingsRow
          icon="arrow.down.circle"
          label={gt("Check for app updates")}
          value={releaseStatusLabel}
          disabled={releaseUpdateBusy}
          onPress={() => void checkForAndroidReleaseUpdate()}
        />
      ) : null}
      {updateCheckAvailable ? (
        <Pressable
          accessibilityLabel={gt("Version {version}", { version: versionLabel })}
          accessibilityRole="text"
          disabled={busy}
          onPress={handleVersionPress}
        >
          {versionRow}
        </Pressable>
      ) : (
        versionRow
      )}
    </SettingsSection>
  );
}

function capitalize(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
