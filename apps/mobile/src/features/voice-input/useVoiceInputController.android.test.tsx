import type { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const transcriber = { prepare: vi.fn() };
  return {
    start: vi.fn(async () => undefined),
    transcriber,
    useMobileVoiceTranscriber: vi.fn(() => transcriber),
  };
});

vi.mock("@react-navigation/native", () => ({ useFocusEffect: () => undefined }));
vi.mock("./VoiceInputProvider", () => ({
  useGlobalVoiceInput: () => ({
    audioLevels: { value: [] },
    cancel: vi.fn(),
    elapsedSeconds: 0,
    isAvailable: false,
    isBusy: false,
    ownerKey: null,
    session: {
      cancel: vi.fn(),
      setOwnerFocused: vi.fn(),
      start: mocks.start,
      stop: vi.fn(),
    },
    state: { error: null, errorAction: null, phase: "idle" },
    stop: vi.fn(),
  }),
}));
vi.mock("./useMobileVoiceTranscriber", () => ({
  useMobileVoiceTranscriber: mocks.useMobileVoiceTranscriber,
}));

import { useVoiceInputController } from "./useVoiceInputController";

const environmentId = "environment-android" as EnvironmentId;

function ThreadComposerVoiceProbe() {
  const voice = useVoiceInputController({
    environmentId,
    label: "Android thread",
    onChangeDraftMessage: vi.fn(),
    onChangeSelection: vi.fn(),
    ownerKey: "thread-android",
    readDraftMessage: () => "",
    selection: { start: 0, end: 0 },
    subscribeToDraftChanges: () => () => undefined,
  });
  return voice.isAvailable ? (
    <button type="button" onClick={voice.start}>
      Start dictation
    </button>
  ) : null;
}

it("shows and starts Android composer dictation with the environment transcriber", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  using _root = { [Symbol.dispose]: () => act(() => root.unmount()) };

  act(() => root.render(<ThreadComposerVoiceProbe />));
  act(() => container.querySelector("button")?.click());

  expect(container.textContent).toBe("Start dictation");
  expect(mocks.useMobileVoiceTranscriber).toHaveBeenCalledWith(environmentId);
  expect(mocks.start).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerKey: "thread-android",
      transcriber: mocks.transcriber,
    }),
  );
});
