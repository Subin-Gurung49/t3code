import type { VoiceInputState } from "@t3tools/client-runtime/voice-input";
import { expect, it, vi } from "vite-plus/test";

import {
  compactComposerDictationTakesFooter,
  shouldShowComposerSpeechControls,
  shouldRenderComposerFooter,
  transitionPendingDictationSubmission,
  usesEnvironmentSpeechShortcut,
} from "./composerDictation.logic";

const idle: VoiceInputState = { phase: "idle", error: null, errorAction: null };
const recording: VoiceInputState = { phase: "recording", error: null, errorAction: null };

it("keeps compact desktop dictation controls visible when browser speech input is idle", () => {
  expect(compactComposerDictationTakesFooter(true, idle.phase)).toBe(false);
  expect(compactComposerDictationTakesFooter(true, recording.phase)).toBe(true);
});

it("keeps the collapsed mobile footer hidden during native dictation", () => {
  expect(shouldRenderComposerFooter(true, idle.phase)).toBe(false);
  expect(shouldRenderComposerFooter(true, recording.phase)).toBe(true);
  expect(shouldRenderComposerFooter(false, idle.phase)).toBe(true);
});

it("keeps environment speech controls available alongside native desktop dictation", () => {
  expect(
    shouldShowComposerSpeechControls({
      nativeDictationAvailable: true,
      environmentSpeechAvailable: true,
      speechInputPhase: "idle",
      setupOpen: false,
    }),
  ).toBe(true);
  expect(
    shouldShowComposerSpeechControls({
      nativeDictationAvailable: true,
      environmentSpeechAvailable: false,
      speechInputPhase: "idle",
      setupOpen: false,
    }),
  ).toBe(false);
});

it("routes dictation shortcuts to an active environment speech session", () => {
  expect(usesEnvironmentSpeechShortcut(true, "recording")).toBe(true);
  expect(usesEnvironmentSpeechShortcut(true, "idle")).toBe(false);
  expect(usesEnvironmentSpeechShortcut(false, "idle")).toBe(true);
});

it("does not submit a draft after dictation is canceled during transcription", () => {
  const submit = vi.fn();
  const scheduled = transitionPendingDictationSubmission(null, {
    type: "schedule",
    ownerKey: "thread-1",
    submit,
  });
  const canceled = transitionPendingDictationSubmission(scheduled.pending, { type: "cancel" });
  const idled = transitionPendingDictationSubmission(canceled.pending, {
    type: "state",
    ownerKey: "thread-1",
    phase: "idle",
  });

  expect(idled.submit).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it("submits once after an uncanceled transcription returns to idle", () => {
  const submit = vi.fn();
  const scheduled = transitionPendingDictationSubmission(null, {
    type: "schedule",
    ownerKey: "thread-1",
    submit,
  });
  const transcribing = transitionPendingDictationSubmission(scheduled.pending, {
    type: "state",
    ownerKey: "thread-1",
    phase: "transcribing",
  });
  const idled = transitionPendingDictationSubmission(transcribing.pending, {
    type: "state",
    ownerKey: "thread-1",
    phase: "idle",
  });

  idled.submit?.();
  expect(submit).toHaveBeenCalledOnce();
  expect(idled.pending).toBeNull();
});
