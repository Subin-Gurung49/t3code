import { describe, expect, it } from "vite-plus/test";

import { uploadedReleaseAssetDigest } from "./mobile-android-release.ts";

describe("uploadedReleaseAssetDigest", () => {
  it("reads the APK digest from the gh release view response", () => {
    const digest = "sha256:c6a5d82e115206ef6915306b35ba4c995840448b07cc68b1d800e3ae1f564082";
    const stdout = JSON.stringify({
      assets: [
        { digest: "sha256:other", name: "other.apk" },
        { digest, name: "t3-code-preview.apk" },
      ],
    });

    expect(uploadedReleaseAssetDigest(stdout, "t3-code-preview.apk")).toBe(digest);
  });

  it("rejects a response without an asset list", () => {
    expect(() => uploadedReleaseAssetDigest('{"tagName":"android-preview-24"}', "app.apk")).toThrow(
      "invalid release asset list",
    );
  });
});
