import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type ContainerProps = {
  readonly children?: ReactNode;
};

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  (globalThis as { expo?: { EventEmitter: unknown } }).expo = { EventEmitter: { prototype: {} } };
});

const mocks = vi.hoisted(() => ({
  useVoiceInputController: vi.fn(),
}));

vi.mock("react-native", () => ({
  I18nManager: { isRTL: false },
  Keyboard: { dismiss: vi.fn() },
  Platform: { OS: "android", isPad: false },
  View: ({ children }: ContainerProps) => <div>{children}</div>,
}));
vi.mock("react-native-reanimated", () => {
  const animated = ({ children }: ContainerProps) => <div>{children}</div>;
  const transition = {
    delay: () => transition,
    duration: () => transition,
    reduceMotion: () => transition,
  };
  return {
    default: {
      View: animated,
      createAnimatedComponent: () => animated,
    },
    FadeIn: transition,
    FadeOut: transition,
    ReduceMotion: { System: "system" },
    useAnimatedStyle: () => ({}),
    useDerivedValue: () => ({ value: 0 }),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  };
});
vi.mock("expo-asset", () => ({ Asset: { fromModule: () => ({}) } }));
vi.mock("expo-audio", () => ({
  AudioModule: { setAudioSessionOwner: () => {} },
  RecordingPresets: { HIGH_QUALITY: { ios: {}, android: {}, extension: ".m4a" } },
  createAudioPlayer: () => ({ pause: () => {}, release: () => {} }),
  useAudioPlayerStatus: () => ({}),
  setAudioModeAsync: async () => {},
  setIsAudioActiveAsync: async () => {},
  requestRecordingPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  getRecordingPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
}));
vi.mock("expo-modules-core", () => ({
  EventEmitter: { prototype: {} },
  NativeModulesProxy: {},
  requireNativeModule: () => ({}),
  requireOptionalNativeModule: () => null,
}));
vi.mock("expo", () => ({
  requireNativeModule: () => ({}),
  requireOptionalNativeModule: () => null,
}));
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock("expo-secure-store", () => ({
  getItem: () => null,
  getItemAsync: () => Promise.resolve(null),
  setItem: () => undefined,
  setItemAsync: () => Promise.resolve(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA1: "SHA-1", SHA256: "SHA-256", SHA384: "SHA-384", SHA512: "SHA-512" },
  getRandomBytes: (byteCount: number) => new Uint8Array(byteCount),
  getRandomBytesAsync: (byteCount: number) => Promise.resolve(new Uint8Array(byteCount)),
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
}));
vi.mock("@effect/atom-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effect/atom-react")>()),
  useAtomValue: () => ({}),
}));
vi.mock("@react-navigation/native", () => ({
  StackActions: { push: (...args: unknown[]) => ({ type: "PUSH", args }) },
  useFocusEffect: () => undefined,
  useNavigation: () => ({
    addListener: () => () => undefined,
    dispatch: vi.fn(),
    isFocused: () => true,
    navigate: vi.fn(),
  }),
}));
vi.mock("../../components/ComposerAttachmentStrip", () => ({
  ComposerAttachmentStrip: () => null,
  ComposerAttachmentThumbnail: () => null,
}));
vi.mock("../../components/ComposerEditor", () => ({ ComposerEditor: () => null }));
vi.mock("../../components/ComposerModelControl", () => ({ ComposerModelControl: () => null }));
vi.mock("../../components/ComposerToolbar", () => ({
  ComposerActionButton: () => null,
  ComposerToolbarRow: ({ children }: ContainerProps) => <div>{children}</div>,
}));
vi.mock("../../components/FilePreviewModal", () => ({ FilePreviewModal: () => null }));
vi.mock("../../components/VideoPreviewModal", () => ({ VideoPreviewModal: () => null }));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: ContainerProps) => <span>{children}</span>,
}));
vi.mock("../../components/ui/Button", () => ({ Button: () => null }));
vi.mock("../../components/ui/Dialog", () => ({ alert: vi.fn() }));
vi.mock("../../components/ui/GlassSurface", () => ({
  GlassSurface: ({ children }: ContainerProps) => <div>{children}</div>,
}));
vi.mock("../../components/ui/Menu", () => ({
  Menu: ({ children }: ContainerProps) => <div>{children}</div>,
}));
vi.mock("../../lib/composerImageGallery", () => ({ composerImageGallery: () => [] }));
vi.mock("../../lib/composerImages", () => ({ composerStripAttachments: () => [] }));
vi.mock("../../lib/filePreviewGallery", () => ({ filePreviewGallery: () => [] }));
vi.mock("../../lib/useUniwindTheme", () => ({
  useUniwindTheme: () => ({
    "--color-composer-panel": "#111111",
    "--color-foreground": "#ffffff",
  }),
}));
vi.mock("../../state/atom-registry", () => ({
  appAtomRegistry: { subscribe: () => () => undefined },
}));
vi.mock("../../state/composer-attachment-uploads", () => ({
  composerAttachmentUploadBlockReason: () => null,
  composerAttachmentUploadsAtom: {},
  composerAttachmentsStillUploading: () => false,
}));
vi.mock("../../state/entities", () => ({
  useProject: () => null,
  useThreadShells: () => [],
  useVisibleThreadShells: () => [],
}));
vi.mock("../../state/environments", () => ({ useMentionableEnvironments: () => [] }));
vi.mock("../../state/peerLinks", () => ({ useLinkedEnvironments: () => [] }));
vi.mock("../../state/use-composer-drafts", () => ({
  composerContextImportsAtom: {},
  composerDraftsAtom: {},
  countComposerDraftAttachmentsAfterSelection: () => 0,
  getComposerDraftSnapshot: () => ({ attachments: [], text: "" }),
  setComposerDraftText: vi.fn(),
  useComposerDraft: () => ({ attachments: [], text: "" }),
}));
vi.mock("../agent-awareness/remoteRegistration", () => ({
  armAgentAwarenessLiveActivityForLocalWork: vi.fn(),
}));
vi.mock("../layout/AdaptiveWorkspaceLayout", () => ({
  useAdaptiveWorkspaceLayout: () => ({
    layout: { usesSplitView: false },
    setComposerEditing: vi.fn(),
  }),
}));
vi.mock("../settings/appearance/AppearancePreferencesProvider", () => ({
  useAndroidFloatingTabs: () => false,
  useAppearancePreferences: () => ({
    themeVariables: { "--color-composer-panel": "#111111" },
  }),
}));
vi.mock("../settings/appearance/useScaledTextRole", () => ({
  useScaledTextRole: () => ({ fontSize: 16, lineHeight: 22 }),
}));
vi.mock("../voice-input/ComposerDictationControl", () => ({
  ComposerDictationCancelAction: () => null,
  ComposerDictationDraftContent: ({ children }: ContainerProps) => <div>{children}</div>,
  ComposerDictationError: () => null,
  ComposerDictationPrimaryAction: () => null,
  ComposerDictationStartAction: ({ isAvailable }: { readonly isAvailable: boolean }) =>
    isAvailable ? <button type="button">Start dictation</button> : null,
  ComposerDictationStatus: () => null,
  ComposerDictationToolbar: () => null,
}));
vi.mock("../voice-input/useVoiceInputController", () => ({
  useVoiceInputController: mocks.useVoiceInputController,
}));
vi.mock("./ComposerPolishBar", () => ({
  ComposerPolishBar: () => null,
  ComposerPolishButton: () => null,
}));
vi.mock("./ComposerAttachmentButton", () => ({ ComposerAttachmentButton: () => null }));
vi.mock("./ComposerCommandPopover", () => ({ ComposerCommandPopover: () => null }));
vi.mock("./ComposerPopoverAnchor", () => ({
  ComposerPopoverAnchor: ({ children }: ContainerProps) => <div>{children}</div>,
}));
vi.mock("./ComposerQueuedEdit", () => ({ ComposerQueuedEditAttachments: () => null }));
vi.mock("./use-composer-command-menu", () => ({
  useComposerCommandMenu: () => ({
    error: null,
    isLoading: false,
    items: [],
    onSelect: vi.fn(),
    onSelectionChange: vi.fn(),
    selection: { end: 0, start: 0 },
    skills: [],
    trigger: null,
  }),
}));
vi.mock("./use-thread-settings-sheet-presentation", () => ({
  useThreadSettingsSheetPresentation: () => ({
    dispose: vi.fn(),
    keepsComposerExpanded: false,
    onDismissed: vi.fn(),
    onEditorFocusChange: vi.fn(),
    onStackTransitionsFinished: vi.fn(),
    open: vi.fn(),
  }),
}));
vi.mock("../workspace/useSystemWorkspaceTabBar", () => ({
  useSidebarWorkspaceTabs: () => "hide",
}));

import { ThreadComposer, type ThreadComposerProps } from "./ThreadComposer";

const environmentId = "environment-android" as EnvironmentId;

it("keeps Android dictation on the provider's transcription choice", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.useVoiceInputController.mockImplementation(() => ({
    audioLevels: { value: [] },
    blocksSubmission: false,
    cancel: vi.fn(),
    elapsedSeconds: 0,
    freezesEditor: false,
    isAvailable: true,
    isBusy: false,
    start: vi.fn(),
    state: { error: null, errorAction: null, phase: "idle" },
    stop: vi.fn(),
  }));
  const props: ThreadComposerProps = {
    activeThreadBusy: false,
    canOperateThread: true,
    canSteerActiveTurn: false,
    canStopThread: false,
    canSwitchProvider: true,
    connectionState: "connected",
    environmentId,
    environmentLabel: null,
    followUpBehavior: "queue",
    hasCompactableConversation: false,
    hidden: false,
    onChangeDraftMessage: vi.fn(),
    onNativePasteImages: async () => undefined,
    onNativePasteText: async () => undefined,
    onPickDraftFiles: async () => undefined,
    onPickDraftMedia: async () => undefined,
    onRemoveDraftImage: vi.fn(),
    onResumeQueue: null,
    onSendMessage: async () => null,
    onShowUsageLimits: vi.fn(),
    onStopThread: vi.fn(),
    placeholder: "Message",
    projectCwd: null,
    queueCount: 0,
    selectedThread: {
      id: "thread-android",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      projectId: "project-android",
      pullRequests: [],
      title: "Android thread",
    } as unknown as EnvironmentThreadShell,
    serverConfig: null,
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  using _root = { [Symbol.dispose]: () => act(() => root.unmount()) };

  act(() => root.render(<ThreadComposer {...props} />));

  const voiceInput = mocks.useVoiceInputController.mock.calls[0]?.[0];
  expect(voiceInput).toBeDefined();
  expect(voiceInput).not.toHaveProperty("environmentId");
  expect(voiceInput).not.toHaveProperty("transcriber");
  expect(container.textContent).toContain("Start dictation");
});
