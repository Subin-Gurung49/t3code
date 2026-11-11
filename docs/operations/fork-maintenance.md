# Maintaining this fork

This fork carries changes that upstream does not have. An upstream sync can lose
them in two ways:

- A conflict resolution drops fork code while the merge still succeeds.
- Upstream ships the same capability, and a fork override that was once correct
  becomes wrong. The Android dictation override was correct before upstream
  added local live transcription; afterward it made the local recorder write
  into a pipe nobody read.

`pnpm check:fork` guards both. It reads `scripts/fork-divergences.json` and
checks a stable marker for each fork-only behavior. A missing marker fails; a
`forbid` marker that comes back also fails. The check runs on every push and
pull request and in `pnpm sync:upstream`.
`scripts/fork-divergences.test.ts` covers the checker itself.

## Rules

1. Every intentional fork behavior needs an entry in
   `scripts/fork-divergences.json`. Prefer a marker on the smallest file that
   would break if the behavior disappeared, not a screenshot or copy string.
2. Prefer fork-only files and one-line hooks in upstream files. The prompt polish
   bar and the Android APK updater are fork-owned files; the composer slot and
   settings row are one-line hook sites.
3. Give the behavior a test when it is behavioral. `forbid` markers catch a
   stale override coming back; a test catches it doing the wrong thing.
4. When upstream ships a capability, remove the fork implementation and its
   manifest entry in the same pull request. Do not keep both.
5. Do not add an entry for a change that upstream already owns. The manifest is
   for divergence, not a file inventory.

## Sync procedure

```bash
pnpm sync:upstream
# Resolve conflicts. rerere replays earlier resolutions.
pnpm install --frozen-lockfile
vp run check:changed <pre-sync-fork-sha>
pnpm check:fork
git commit
```

`check:changed` only runs tests beside changed files. A fork-only row in an
unchanged settings panel will not be tested, which is why `check:fork` runs
separately. When a check fails, restore the fork behavior or update the
manifest because upstream now owns it. Say which in the commit message.

`git rerere` is enabled by `sync-upstream.sh`, so repeated conflict shapes reuse
the earlier resolution. It is local state, not a substitute for the manifest.

## Adding an entry

```json
{
  "id": "short-name",
  "why": "What the fork adds and what breaks without it.",
  "files": {
    "path/from/repo/root.ts": {
      "require": ["stableSymbol"],
      "forbid": ["overrideThatShouldStayGone"]
    }
  }
}
```

Keep markers short and structural: an exported name, a setting key, a component
name. Avoid prose, formatting, and line numbers. Run `pnpm check:fork` after
editing.
