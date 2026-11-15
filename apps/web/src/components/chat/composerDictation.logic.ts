import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";

export type PendingDictationSubmission = {
  readonly ownerKey: string;
  readonly submit: () => void;
};

export type PendingDictationSubmissionEvent =
  | { readonly type: "schedule"; readonly ownerKey: string; readonly submit: () => void }
  | { readonly type: "cancel" }
  | { readonly type: "state"; readonly ownerKey: string; readonly phase: VoiceInputPhase };

export type PendingDictationSubmissionTransition = {
  readonly pending: PendingDictationSubmission | null;
  readonly submit: (() => void) | null;
};

export function compactComposerDictationTakesFooter(
  isCompact: boolean,
  speechInputPhase: VoiceInputPhase,
): boolean {
  return isCompact && speechInputPhase !== "idle";
}

export function shouldRenderComposerFooter(
  isCollapsedMobile: boolean,
  speechInputPhase: VoiceInputPhase,
): boolean {
  return !isCollapsedMobile || speechInputPhase !== "idle";
}

export function shouldShowComposerSpeechControls(input: {
  readonly nativeDictationAvailable: boolean;
  readonly environmentSpeechAvailable: boolean;
  readonly speechInputPhase: VoiceInputPhase;
  readonly setupOpen: boolean;
}): boolean {
  return (
    !input.nativeDictationAvailable ||
    input.environmentSpeechAvailable ||
    input.speechInputPhase !== "idle" ||
    input.setupOpen
  );
}

export function usesEnvironmentSpeechShortcut(
  nativeDictationAvailable: boolean,
  speechInputPhase: VoiceInputPhase,
): boolean {
  return !nativeDictationAvailable || (speechInputPhase !== "idle" && speechInputPhase !== "error");
}

export function transitionPendingDictationSubmission(
  pending: PendingDictationSubmission | null,
  event: PendingDictationSubmissionEvent,
): PendingDictationSubmissionTransition {
  if (event.type === "schedule") {
    return {
      pending: pending ?? { ownerKey: event.ownerKey, submit: event.submit },
      submit: null,
    };
  }

  if (event.type === "cancel" || pending === null) return { pending: null, submit: null };
  if (pending.ownerKey !== event.ownerKey || event.phase === "error") {
    return { pending: null, submit: null };
  }
  if (event.phase !== "idle") return { pending, submit: null };
  return { pending: null, submit: pending.submit };
}
