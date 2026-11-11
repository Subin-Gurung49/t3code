// @effect-diagnostics nodeBuiltinImport:off - repository guard runs as plain Node tooling.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

export interface ForkDivergenceFileRule {
  readonly require?: ReadonlyArray<string>;
  readonly forbid?: ReadonlyArray<string>;
}

export interface ForkDivergenceEntry {
  readonly id: string;
  readonly why: string;
  readonly files: Readonly<Record<string, ForkDivergenceFileRule>>;
}

export interface ForkDivergenceManifest {
  readonly entries: ReadonlyArray<ForkDivergenceEntry>;
}

export interface ForkDivergenceFailure {
  readonly entryId: string;
  readonly file: string;
  readonly marker: string;
  readonly kind: "missing-file" | "missing" | "forbidden";
}

/**
 * Checks the fork's intentional wiring by stable source markers. A missing
 * marker means an upstream sync dropped fork code; a forbidden marker means an
 * override that upstream has outgrown came back.
 */
export async function checkForkDivergences(
  root: string,
  manifest: ForkDivergenceManifest,
): Promise<ReadonlyArray<ForkDivergenceFailure>> {
  const failures: ForkDivergenceFailure[] = [];
  for (const entry of manifest.entries) {
    for (const [file, rule] of Object.entries(entry.files)) {
      const path = NodePath.join(root, file);
      let source: string;
      try {
        source = await NodeFSP.readFile(path, "utf8");
      } catch {
        failures.push({ entryId: entry.id, file, marker: "(file)", kind: "missing-file" });
        continue;
      }
      for (const marker of rule.require ?? []) {
        if (!source.includes(marker)) {
          failures.push({ entryId: entry.id, file, marker, kind: "missing" });
        }
      }
      for (const marker of rule.forbid ?? []) {
        if (source.includes(marker)) {
          failures.push({ entryId: entry.id, file, marker, kind: "forbidden" });
        }
      }
    }
  }
  return failures;
}
