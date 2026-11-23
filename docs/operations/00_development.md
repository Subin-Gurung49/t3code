# Development

## First checkout

Install [Vite+](https://viteplus.dev/guide/) (`vp` provides the pinned Node version from `package.json`):

```sh
curl -fsSL https://vite.plus | bash
# Windows PowerShell: irm https://vite.plus/ps1 | iex
```

On Windows, clone with long paths enabled so `.repos/` checks out cleanly:

```powershell
git clone -c core.longpaths=true https://github.com/pingdotgg/t3code.git
```

From the repository root:

```sh
vp i
vp run dev
```

Open the pairing URL printed by the dev runner (the bare origin does not authenticate a new browser). Prefer a container? See [Dev container](./01_devcontainer.md).

## Forge mirror (optional)

GitHub is the source of truth; [source.tanstack.com/@pingdotgg/t3code](https://source.tanstack.com/@pingdotgg/t3code) is a two-way mirror for parallel agent work:

```sh
git remote set-url origin https://source.tanstack.com/@pingdotgg/t3code.git
git remote add github https://github.com/pingdotgg/t3code.git
src auth login --web && src auth setup-git
```

With `origin` on the mirror, use `src` instead of `gh`. PRs into `main` still merge on GitHub, and numbers can differ between forges—use the GitHub number in text that reaches GitHub.

## Running dev servers

- `vp run dev` (server + web), `vp run dev:desktop` (Electron), `vp run dev:server`, `vp run dev:web`. See [apps/mobile/README.md](../../apps/mobile/README.md) for mobile.
- Pass flags directly after the task name (e.g. `vp run dev --home-dir /tmp/t3code-dev`, `--browser`).
- **State and ports:** Linked worktrees default to `<worktree>/.t3/userdata` (outranking `T3CODE_HOME`) and seed on first start from a read-only snapshot of `~/.t3/userdata/statev2.sqlite` when it is at most 500 MiB (`--no-seed` or `T3CODE_DEV_SEED=0` skips; `vp run migrate-dev-db` refreshes manually). Plain clones and the main checkout default to `~/.t3/dev`. Never point a dev server at `~/.t3/userdata`. Read actual ports from `[dev-runner]` output (`T3CODE_PORT_OFFSET` / `T3CODE_DEV_INSTANCE` override).
- **Resource monitor:** First start builds `native/resource-monitor` via Cargo when missing; without Rust, dev starts without process telemetry.
- **Sharing:** `vp run dev --share` exposes the web port over Tailscale and prints a pairing URL. Add `--built` to serve `apps/web/dist` via `vp build --watch` (no HMR, faster over slow links). Never set `VITE_HTTP_URL` or `VITE_WS_URL` in dev—Vite proxies `/api` and `/ws` single-origin.
- **Startup profiling:** `vp run profile:startup` captures the first 20 s of Node processes under `.t3/startup-profiles/<timestamp>`.

### Voice input development on Windows

Use this fork's `main`, not an older upstream desktop installation. After cloning
the fork, install `vp` using the [root README](../../README.md#install-vp), then run
from the repository root in PowerShell:

```powershell
git pull --ff-only
vp i
vp run dev:desktop
```

The [Windows and Android voice setup](../user/composer.md#android-transcription-with-a-windows-pc)
covers FFmpeg, microphone permission, pairing, and a short acceptance test. Desktop
dictation uses its local worker; Android uses the connected environment's server
worker, so test both paths separately. For an installed Windows build, follow the
[Windows installer prerequisites](#windows-installer-prerequisites) and run
`vp run dist:desktop:win` on Windows. Restart the installed app after updating it.

Use the [mobile README](../../apps/mobile/README.md) only when building or changing
the native app. Keep pairing URLs and signing credentials out of shared docs.

### macOS dev launcher

Run `./scripts/install-desktop-dev-launcher.command` to install **T3 Code Fork Dev** in
`~/Applications`, with a shortcut on the Desktop. Double-click it to open Terminal and start
the Electron dev app. Keep that terminal open while using the app; press `Ctrl+C` there to stop it.

The launcher uses this checkout's `.t3` profile, follows source edits, and ignores repeated
launches while its dev process is running. Stop any separately started web or desktop dev
server using that profile before switching to the launcher. Run the installer again after
moving the checkout. The command can also be run directly as
`./scripts/launch-desktop-dev.command`. Its output is saved to
`.t3/desktop-dev-launcher.log`.

To stop a worktree's dev stack when its thread settles, import the **Dev** action from
`t3.json` in Settings > Projects > Actions and start it through the action menu or its
keybinding. Its `stopOnSettle` option lets T3 stop the terminal and its child processes.
Running `vp run dev` through an agent's own shell tool does not attach it to this lifecycle.

### Replay provider

`vp run dev` registers `Replay (dev)` ([dev-replay-agent.ts](../../apps/server/scripts/dev-replay-agent.ts)), a local ACP agent that streams recorded transcripts without calling a paid model. Add scenarios under `SCENARIOS` pointing at a generic ACP fixture (`registry_transcript.ndjson`) or a file in `apps/server/scripts/dev-replay`.

### Reusable dev credential

Only use this on a hostname where you trust every service (browsers share cookies across ports on the same hostname). Generate one secret once and put it in the main checkout's gitignored `.env` (which `t3.json` links into worktrees):

```sh
openssl rand -hex 32
# Add to .env: T3CODE_DEV_AUTH_TOKEN=<value>
```

Restart `vp run dev --share` and open its printed pairing URL once per browser profile. Never commit or publish the token or startup URLs. Desktop and non-dev servers ignore it; see [environment auth](../internals/04_environment-auth.md#reusable-dev-credential).

## Checks

- `vp run check:changed` — CI's fast checks for your branch (format, lint, knip, affected typechecks, nearby tests, and React Compiler coverage).
- Focused iteration: `vp test run <files>`, `vp lint <files>`, `vp run --filter <pkg> typecheck`, `vp run knip:check`, `vp run lint:mobile`.
- `apps/web` uses real Chromium (`*.browser.test.{ts,tsx}`) for DOM/React tests (no jsdom) and Node for `*.test.ts`.
- Typechecking uses `effect-tsgo tsrs --noEmit` (`@effect/tsgo`), not `typescript` (except `apps/marketing` for Astro). On Windows, open the workspace through WSL for VS Code's `.vscode/tsdk/tsgo`.

## Desktop artifacts

Unsigned local builds write to `release/`:

```sh
vp run dist:desktop:dmg
vp run dist:desktop:linux
vp run dist:desktop:win
# Linux ARM64: vp run dist:desktop:artifact --platform linux --target AppImage --arch arm64
```

Run `vp run dist:desktop:artifact --help` for `--arch`, `--signed`, and `--keep-stage`.

### Linux AppImage prerequisites

Build on Linux (the browser-secret helper links against `libsecret`). Install Rust stable (`rustup`), C/C++ build tools, `libsecret` dev headers, `pkg-config`, ImageMagick, and Electron runtime libs (`gtk3`, `nss`, `alsa`, `gbm`):

```sh
# Ubuntu 24.04 / Debian 13 (on 22.04/Debian 12 use libgtk-3-0 and libasound2)
sudo apt-get install build-essential libsecret-1-dev pkg-config imagemagick libgtk-3-0t64 libnss3 libasound2t64 libgbm1

# Fedora
sudo dnf install gcc gcc-c++ make libsecret-devel pkgconf-pkg-config ImageMagick gtk3 nss alsa-lib mesa-libgbm

# Arch
sudo pacman -S base-devel libsecret pkgconf imagemagick gtk3 nss alsa-lib mesa
```

### macOS DMG prerequisites

Install Xcode Command Line Tools (`xcode-select --install`) and Rust. For cross-arch/universal builds:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

### Windows installer prerequisites

Install Rust, Python 3, and Visual Studio Build Tools (**Desktop development with C++**, Windows SDK, MSVC build tools, Spectre-mitigated libraries), then add the Rust target:

```powershell
rustup target add x86_64-pc-windows-msvc   # or aarch64-pc-windows-msvc
```

WSL support also requires passing the Linux CLI archive via `--wsl-runtime`; see [release runbook](./03_release.md#windows-payload-topology-and-update-validation). For signing and macOS passkeys, see [release](./03_release.md) and [Connect setup](./02_connect-setup.md#desktop-passkeys).
