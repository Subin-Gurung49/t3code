// @effect-diagnostics nodeBuiltinImport:off - repository guard runs as plain Node tooling.
import * as NodeFSP from "node:fs/promises";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

import { checkForkDivergences, type ForkDivergenceManifest } from "./fork-divergences.ts";

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const manifestPath = NodeURL.fileURLToPath(new URL("./fork-divergences.json", import.meta.url));
const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8")) as ForkDivergenceManifest;
const failures = await checkForkDivergences(root, manifest);

if (failures.length === 0) {
  NodeProcess.stdout.write(
    `Fork divergences OK: ${manifest.entries.length} entries still wired.\n`,
  );
} else {
  NodeProcess.stderr.write(
    "Fork-only wiring is missing or stale. A sync may have dropped it, or upstream now owns it.\n",
  );
  for (const failure of failures) {
    NodeProcess.stderr.write(
      `  [${failure.kind}] ${failure.entryId}: ${failure.file} -> ${failure.marker}\n`,
    );
  }
  NodeProcess.stderr.write(
    "\nRestore the fork behavior, or update scripts/fork-divergences.json when upstream replaces it.\n",
  );
  NodeProcess.stderr.write("See docs/operations/fork-maintenance.md.\n");
  NodeProcess.exit(1);
}
