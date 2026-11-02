import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { DesktopUpdateStateSchema } from "./ipc.ts";

describe("desktop update IPC", () => {
  it("preserves the policy-blocked channel flag through transport encoding", () => {
    const decode = Schema.decodeUnknownSync(DesktopUpdateStateSchema);
    const encode = Schema.encodeSync(DesktopUpdateStateSchema);
    const state = {
      enabled: false,
      status: "disabled",
      channel: "latest",
      currentVersion: "1.0.0",
      hostArch: "arm64",
      appArch: "arm64",
      runningUnderArm64Translation: false,
      availableVersion: null,
      downloadedVersion: null,
      releaseNotes: [],
      omittedReleaseCount: 0,
      downloadPercent: null,
      checkedAt: null,
      message: null,
      errorContext: null,
      canRetry: false,
      channelBlockedByPolicy: true,
    } as const;

    expect(encode(decode(state))).toEqual(state);
  });
});
