// @effect-diagnostics nodeBuiltinImport:off - repository guard tests plain file markers.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { expect, it } from "vite-plus/test";

import { checkForkDivergences, type ForkDivergenceManifest } from "./fork-divergences.ts";

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));

it("keeps every fork-only feature wired", async () => {
  const manifest = JSON.parse(
    await NodeFSP.readFile(new URL("./fork-divergences.json", import.meta.url), "utf8"),
  ) as ForkDivergenceManifest;
  expect(await checkForkDivergences(root, manifest)).toEqual([]);
});

it("reports missing files, missing markers, and forbidden markers", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "fork-divergences-"));
  try {
    await NodeFSP.writeFile(
      NodePath.join(directory, "present.ts"),
      "export const kept = true;\nexport const stale = true;\n",
    );
    const manifest: ForkDivergenceManifest = {
      entries: [
        {
          id: "fixture",
          why: "test",
          files: {
            "present.ts": { require: ["kept"], forbid: ["stale"] },
            "missing.ts": { require: ["anything"] },
            "absent-marker.ts": { require: ["not-there"] },
          },
        },
      ],
    };
    await NodeFSP.writeFile(
      NodePath.join(directory, "absent-marker.ts"),
      "export const other = 1;\n",
    );

    expect(await checkForkDivergences(directory, manifest)).toEqual([
      { entryId: "fixture", file: "present.ts", marker: "stale", kind: "forbidden" },
      { entryId: "fixture", file: "missing.ts", marker: "(file)", kind: "missing-file" },
      { entryId: "fixture", file: "absent-marker.ts", marker: "not-there", kind: "missing" },
    ]);
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
