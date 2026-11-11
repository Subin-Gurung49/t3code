import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { SymbolView } from "../../components/ui/AppSymbol";
import type { UseMobileComposerPolishReturn } from "./useMobileComposerPolish";
import { Pressable, ScrollView, View } from "react-native";

export function ComposerPolishButton(props: {
  readonly disabled?: boolean;
  readonly isBusy: boolean;
  readonly onPress: () => void;
}) {
  const accessibilityLabel = props.isBusy ? "Polishing prompt" : "Polish prompt";
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: props.isBusy, disabled: props.disabled || props.isBusy }}
      className="size-[44px] shrink-0 items-center justify-center rounded-full active:opacity-70"
      disabled={props.disabled || props.isBusy}
      onPress={props.onPress}
      style={{ opacity: props.disabled && !props.isBusy ? 0.4 : 1 }}
    >
      {props.isBusy ? (
        <AppActivityIndicator size="small" colorClassName="accent-icon-muted" />
      ) : (
        <SymbolView name="pencil" size={20} tintColorClassName="accent-icon" type="monochrome" />
      )}
    </Pressable>
  );
}

export function ComposerPolishBar(props: {
  readonly disabled?: boolean;
  readonly onCancel: () => void;
  readonly onApply: () => void;
  readonly onRestoreOriginal: () => void;
  readonly polish: UseMobileComposerPolishReturn;
}) {
  const { state, dismissError } = props.polish;
  if (state.phase === "idle" && !state.restorableOriginal) return null;

  if (state.phase === "error") {
    return (
      <View className="mx-3 mb-2 flex-row items-center gap-2 rounded-xl border border-danger-border bg-danger/10 px-3 py-2">
        <Text accessibilityRole="alert" className="min-w-0 flex-1 text-xs text-danger-foreground">
          {state.error ?? "Prompt polish failed."}
        </Text>
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          className="size-8 items-center justify-center active:opacity-70"
          hitSlop={8}
          onPress={dismissError}
        >
          <SymbolView
            name="xmark"
            size={14}
            tintColorClassName="accent-danger-foreground"
            type="monochrome"
          />
        </Pressable>
      </View>
    );
  }

  if (state.phase === "polishing") {
    return (
      <View className="mx-3 mb-2 flex-row items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
        <AppActivityIndicator size="small" colorClassName="accent-primary" />
        <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 text-xs text-foreground">
          Polishing draft…
        </Text>
        <Button label="Cancel" size="compact" tone="text" onPress={props.onCancel} />
      </View>
    );
  }

  if (state.phase === "preview" && state.polishedText !== null) {
    return (
      <View className="mx-3 mb-2 gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3">
        <View className="flex-row items-center gap-2">
          <SymbolView
            name="pencil"
            size={16}
            tintColorClassName="accent-primary"
            type="monochrome"
          />
          <Text className="min-w-0 flex-1 text-xs font-t3-medium text-primary">
            Prompt polish preview
          </Text>
          <Button label="Cancel" size="compact" tone="text" onPress={props.onCancel} />
          <Button
            label="Apply"
            size="compact"
            tone="primary"
            disabled={props.disabled}
            onPress={props.onApply}
          />
        </View>
        <ScrollView
          className="max-h-[120px] rounded-lg border border-border/50 bg-screen/70 p-2"
          nestedScrollEnabled
        >
          <Text selectable className="text-xs text-foreground">
            {state.polishedText}
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (state.phase === "idle" && state.restorableOriginal) {
    return (
      <View className="mx-3 mb-2 flex-row items-center gap-2 rounded-xl border border-border/40 bg-subtle/40 px-3 py-2">
        <Text className="min-w-0 flex-1 text-xs text-foreground-muted">
          Prompt polished. Original draft preserved.
        </Text>
        <Button
          label="Restore original"
          icon="arrow.uturn.backward"
          size="compact"
          tone="text"
          disabled={props.disabled}
          onPress={props.onRestoreOriginal}
        />
      </View>
    );
  }

  return null;
}
