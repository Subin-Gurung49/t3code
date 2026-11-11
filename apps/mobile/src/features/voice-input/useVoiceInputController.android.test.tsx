import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  available: true,
  start: vi.fn(async (_target: unknown) => undefined),
}));

vi.mock("@react-navigation/native", () => ({ useFocusEffect: () => undefined }));
vi.mock("./VoiceInputProvider", () => ({
  useGlobalVoiceInput: () => ({
    audioLevels: { value: [] },
    cancel: vi.fn(),
    elapsedSeconds: 0,
    isAvailable: mocks.available,
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

import { useVoiceInputController } from "./useVoiceInputController";

function ThreadComposerVoiceProbe() {
  const voice = useVoiceInputController({
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

it("starts Android composer dictation with the provider's transcriber", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.available = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  using _root = { [Symbol.dispose]: () => act(() => root.unmount()) };

  act(() => root.render(<ThreadComposerVoiceProbe />));
  act(() => container.querySelector("button")?.click());

  expect(container.textContent).toBe("Start dictation");
  const target = mocks.start.mock.calls[0]?.[0];
  expect(target).toMatchObject({ ownerKey: "thread-android" });
  expect(target).not.toHaveProperty("transcriber");
});

it("does not bypass the device transcription choice on Android", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.available = false;
  const container = document.createElement("div");
  const root = createRoot(container);
  using _root = { [Symbol.dispose]: () => act(() => root.unmount()) };

  act(() => root.render(<ThreadComposerVoiceProbe />));

  expect(container.textContent).toBe("");
});
