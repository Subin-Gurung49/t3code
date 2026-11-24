import { useGT } from "gt-react-native";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";

export function PromptSuggestionChip(props: {
  readonly suggestion: string;
  readonly disabled: boolean;
  readonly onAccept: () => void;
  readonly onDismiss: () => void;
}) {
  const gt = useGT();
  return (
    <View className="flex-row items-center gap-2 px-[14px] pb-2 pt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gt("Use suggested prompt: {suggestion}", {
          suggestion: props.suggestion,
        })}
        accessibilityHint={gt("Fills the composer with the predicted next message")}
        disabled={props.disabled}
        className="min-w-0 flex-1 flex-row items-center gap-2 rounded-2xl bg-subtle px-3 py-2 active:opacity-70"
        onPress={props.onAccept}
      >
        <SymbolView
          name="text.bubble"
          size={14}
          tintColorClassName="accent-foreground-muted"
          type="monochrome"
        />
        <Text numberOfLines={2} className="min-w-0 flex-1 text-sm text-foreground">
          {props.suggestion}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gt("Dismiss suggested prompt")}
        disabled={props.disabled}
        className="shrink-0 rounded-full bg-subtle px-2.5 py-2 active:opacity-70"
        onPress={props.onDismiss}
      >
        <SymbolView
          name="xmark"
          size={12}
          tintColorClassName="accent-foreground-muted"
          type="monochrome"
        />
      </Pressable>
    </View>
  );
}
