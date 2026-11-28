#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Android release builds drive host tools and stream their output directly.

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

import { loadRepoEnv } from "./lib/public-config.ts";

const APK_ASSET_NAME = "t3-code-preview.apk";
const ANDROID_PACKAGE = "com.t3tools.t3code.preview";
const DEFAULT_RELEASE_REPOSITORY = "Subin-Gurung49/t3code";
const DEFAULT_SIGNING_CERT_SHA256 =
  "5fde9beea388c50b1b1f4987bfab93d4ad427ca3630bc231b44913fd85bfa179";
const RELEASE_CHANNEL = "preview";
const PREBUILD_MARKER = ".t3-release-prebuild-fingerprint";
const REQUIRED_ENVIRONMENT = [
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
  // app.config derives the EXPO_PUBLIC_* Clerk values from these, as EAS builds do.
  "T3CODE_CLERK_PUBLISHABLE_KEY",
  "T3CODE_CLERK_JWT_TEMPLATE",
  "T3CODE_RELAY_URL",
] as const;

const SCRIPT_DIR = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const REPO_ROOT = NodePath.resolve(SCRIPT_DIR, "..");
const MOBILE_ROOT = NodePath.join(REPO_ROOT, "apps/mobile");
const ANDROID_ROOT = NodePath.join(MOBILE_ROOT, "android");
const CACHE_ROOT = NodePath.join(MOBILE_ROOT, ".android-cache");
const RELEASE_APK = NodePath.join(ANDROID_ROOT, "app/build/outputs/apk/release/app-release.apk");

interface ReleaseOptions {
  readonly help: boolean;
  readonly noPublish: boolean;
  readonly versionCode: number | undefined;
}

interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface BuildTools {
  readonly aapt: string;
  readonly apksigner: string;
  readonly sdkRoot: string;
}

interface ApkMetadata {
  readonly packageName: string;
  readonly versionCode: number;
  readonly versionName: string;
}

function usage(): string {
  return [
    "Usage: vp run mobile:release:android [--no-publish] [--version-code N]",
    "",
    "Required environment:",
    `  ${REQUIRED_ENVIRONMENT.join(", ")}`,
    "",
    "Publishing also requires a clean checkout, a pushed HEAD, and authenticated gh.",
  ].join("\n");
}

function parseOptions(args: ReadonlyArray<string>): ReleaseOptions {
  let noPublish = false;
  let versionCode: number | undefined;
  let help = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--no-publish") {
      noPublish = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--version-code") {
      versionCode = parseVersionCode(args[++index], "--version-code");
      continue;
    }
    if (argument?.startsWith("--version-code=")) {
      versionCode = parseVersionCode(argument.slice("--version-code=".length), "--version-code");
      continue;
    }
    throw new Error(`Unknown argument: ${argument ?? ""}\n\n${usage()}`);
  }

  return { help, noPublish, versionCode };
}

function parseVersionCode(value: string | undefined, source: string): number {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${source} must be a positive integer.`);
  }
  const versionCode = Number(value);
  if (!Number.isSafeInteger(versionCode) || versionCode > 2_100_000_000) {
    throw new Error(`${source} must be between 1 and 2100000000.`);
  }
  return versionCode;
}

function assertRequiredEnvironment(): void {
  const missing = REQUIRED_ENVIRONMENT.filter((name) => !NodeProcess.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Run this through secret exec.`,
    );
  }
}

function releaseRepository(): string {
  const repository =
    NodeProcess.env.T3CODE_MOBILE_GITHUB_RELEASE_REPOSITORY?.trim() || DEFAULT_RELEASE_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("T3CODE_MOBILE_GITHUB_RELEASE_REPOSITORY must be owner/repository.");
  }
  return repository;
}

function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly inherit?: boolean;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.inherit ? "inherit" : "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

async function runChecked(
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly inherit?: boolean;
    readonly failure: string;
  },
): Promise<CommandResult> {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) throw new Error(`${options.failure} (exit ${result.code}).`);
  return result;
}

async function assertGitHubReady(): Promise<void> {
  const auth = await runCommand("gh", ["auth", "status"]);
  if (auth.code !== 0) {
    throw new Error("Authenticate GitHub CLI first using 'gh auth login'.");
  }
}

async function assertCleanPushedCheckout(repository: string): Promise<string> {
  const status = await runChecked("git", ["status", "--porcelain"], {
    cwd: REPO_ROOT,
    failure: "Could not inspect the checkout",
  });
  if (status.stdout.trim()) {
    throw new Error("Commit and push the build inputs, then run this from a clean checkout.");
  }

  const head = await runChecked("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    failure: "Could not read the source commit",
  });
  const sourceCommit = head.stdout.trim();
  if (!/^[a-f0-9]{40,64}$/.test(sourceCommit)) {
    throw new Error("Could not read the source commit.");
  }

  const pushed = await runCommand("gh", [
    "api",
    `repos/${repository}/commits/${sourceCommit}`,
    "--jq",
    ".sha",
  ]);
  if (pushed.code !== 0 || pushed.stdout.trim() !== sourceCommit) {
    throw new Error(`Push the source commit to ${repository} before publishing its APK.`);
  }
  return sourceCommit;
}

async function publishedVersionCodes(repository: string): Promise<ReadonlyArray<number>> {
  const [refs, releases] = await Promise.all([
    runChecked(
      "gh",
      [
        "api",
        "--paginate",
        `repos/${repository}/git/matching-refs/tags/android-preview-`,
        "--jq",
        ".[].ref",
      ],
      {
        failure: `Could not list Android preview tags in ${repository}`,
      },
    ),
    runChecked(
      "gh",
      [
        "release",
        "list",
        "--repo",
        repository,
        "--limit",
        "1000",
        "--json",
        "tagName",
        "--jq",
        ".[].tagName",
      ],
      {
        failure: `Could not list Android preview releases in ${repository}`,
      },
    ),
  ]);

  return [...refs.stdout.split("\n"), ...releases.stdout.split("\n")].flatMap((tag) => {
    const match = /(?:^|\/)android-preview-(\d+)$/.exec(tag.trim());
    if (!match?.[1]) return [];
    const versionCode = Number(match[1]);
    return Number.isSafeInteger(versionCode) ? [versionCode] : [];
  });
}

async function assertVersionAvailable(repository: string, tag: string): Promise<void> {
  const release = await runCommand("gh", [
    "release",
    "view",
    tag,
    "--repo",
    repository,
    "--json",
    "tagName",
  ]);
  if (release.code === 0) {
    throw new Error(`GitHub release ${tag} already exists; refusing to replace it.`);
  }
  if (!/not found|HTTP 404/i.test(release.stderr)) {
    throw new Error(`Could not check whether GitHub release ${tag} exists.`);
  }

  const ref = await runCommand("gh", [
    "api",
    `repos/${repository}/git/ref/tags/${tag}`,
    "--silent",
  ]);
  if (ref.code === 0) {
    throw new Error(`GitHub tag ${tag} already exists; refusing to publish against it.`);
  }
  if (!/not found|HTTP 404/i.test(ref.stderr)) {
    throw new Error(`Could not check whether GitHub tag ${tag} exists.`);
  }
}

async function resolveAndroidSdkRoot(): Promise<string> {
  const home = NodeProcess.env.HOME ?? NodeProcess.env.USERPROFILE ?? "";
  const candidates = [
    NodeProcess.env.ANDROID_HOME?.trim(),
    NodeProcess.env.ANDROID_SDK_ROOT?.trim(),
    NodePath.join(home, "Library", "Android", "sdk"),
    NodePath.join(home, "Android", "Sdk"),
    NodePath.join(NodeProcess.env.LOCALAPPDATA ?? "", "Android", "Sdk"),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (await directoryExists(NodePath.join(candidate, "build-tools"))) return candidate;
  }
  throw new Error("Could not find the Android SDK. Set ANDROID_HOME or ANDROID_SDK_ROOT.");
}

function resolveJavaHome(): string | undefined {
  const configured = NodeProcess.env.JAVA_HOME?.trim();
  if (configured) return configured;
  const androidStudio = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
  return NodeFS.existsSync(androidStudio) ? androidStudio : undefined;
}

async function directoryExists(path: string): Promise<boolean> {
  return NodeFSP.stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  );
}

async function fileExists(path: string): Promise<boolean> {
  return NodeFSP.stat(path).then(
    () => true,
    () => false,
  );
}

async function resolveBuildTools(): Promise<BuildTools> {
  const sdkRoot = await resolveAndroidSdkRoot();
  const versions = (await NodeFSP.readdir(NodePath.join(sdkRoot, "build-tools"))).sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  for (const version of versions.reverse()) {
    const directory = NodePath.join(sdkRoot, "build-tools", version);
    const aapt = NodePath.join(directory, "aapt");
    const apksigner = NodePath.join(directory, "apksigner");
    if ((await fileExists(aapt)) && (await fileExists(apksigner))) {
      return { aapt, apksigner, sdkRoot };
    }
  }
  throw new Error("Could not find aapt and apksigner in Android SDK build-tools.");
}

function buildEnvironment(buildTools: BuildTools, versionCode: number): NodeJS.ProcessEnv {
  const javaHome = resolveJavaHome();
  return {
    ...NodeProcess.env,
    ANDROID_HOME: buildTools.sdkRoot,
    ANDROID_SDK_ROOT: buildTools.sdkRoot,
    APP_VARIANT: "preview",
    CI: "1",
    EXPO_NO_GIT_STATUS: "1",
    NODE_OPTIONS: "--max-old-space-size=4096",
    T3CODE_MOBILE_ANDROID_VERSION_CODE: String(versionCode),
    T3CODE_MOBILE_UPDATES_CHANNEL: RELEASE_CHANNEL,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
}

async function expoFingerprint(env: NodeJS.ProcessEnv): Promise<string> {
  const script = [
    'const fingerprint = require("expo/fingerprint");',
    "fingerprint.createFingerprintAsync(process.cwd(), {",
    '  platforms: ["android"],',
    '  ignorePaths: ["android/**", "ios/**"],',
    "  silent: true,",
    "}).then((value) => process.stdout.write(`T3_RELEASE_FINGERPRINT=${value.hash}\\n`));",
  ].join("\n");
  const result = await runCommand(NodeProcess.execPath, ["--eval", script], {
    cwd: MOBILE_ROOT,
    env,
  });
  if (result.code !== 0) throw new Error("Expo could not fingerprint the native inputs.");
  const fingerprint = result.stdout
    .split("\n")
    .find((line) => line.startsWith("T3_RELEASE_FINGERPRINT="))
    ?.slice("T3_RELEASE_FINGERPRINT=".length);
  if (!fingerprint || !/^[a-f0-9]{40,64}$/.test(fingerprint)) {
    throw new Error("Expo did not return a valid native fingerprint.");
  }
  return fingerprint;
}

async function moveGradleCaches(toCache: boolean): Promise<void> {
  const caches = [".gradle", ".kotlin", "app/.cxx"];
  if (!toCache) {
    await NodeFSP.mkdir(ANDROID_ROOT, { recursive: true });
  }
  for (const cache of caches) {
    const source = NodePath.join(toCache ? ANDROID_ROOT : CACHE_ROOT, cache);
    const target = NodePath.join(toCache ? CACHE_ROOT : ANDROID_ROOT, cache);
    if (!(await fileExists(source)) || (await fileExists(target))) continue;
    await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
    await NodeFSP.rename(source, target);
  }
}

async function prebuildAndroid(env: NodeJS.ProcessEnv): Promise<{
  readonly clean: boolean;
  readonly fingerprint: string;
  readonly milliseconds: number;
}> {
  const started = performance.now();
  const fingerprint = await expoFingerprint(env);
  const prebuildKey = `${fingerprint}\nversionCode=${env.T3CODE_MOBILE_ANDROID_VERSION_CODE}\nchannel=${RELEASE_CHANNEL}\n`;
  const markerPath = NodePath.join(ANDROID_ROOT, PREBUILD_MARKER);
  const androidExists = await directoryExists(ANDROID_ROOT);
  const previousKey = androidExists
    ? await NodeFSP.readFile(markerPath, "utf8").catch(() => null)
    : null;
  const clean = !androidExists || previousKey !== prebuildKey;

  console.log(`Prebuilding Android ${clean ? "with --clean" : "incrementally"}...`);
  if (clean) {
    await NodeFSP.rm(CACHE_ROOT, { recursive: true, force: true });
    await moveGradleCaches(true);
  }

  try {
    await runChecked(
      "vp",
      [
        "exec",
        "expo",
        "prebuild",
        clean ? "--clean" : "--no-clean",
        "--platform",
        "android",
        "--no-install",
      ],
      {
        cwd: MOBILE_ROOT,
        env,
        inherit: true,
        failure: "Expo prebuild failed",
      },
    );
  } finally {
    if (clean) {
      await moveGradleCaches(false);
      await NodeFSP.rm(CACHE_ROOT, { recursive: true, force: true });
    }
  }

  await NodeFSP.mkdir(ANDROID_ROOT, { recursive: true });
  await NodeFSP.writeFile(markerPath, prebuildKey, { mode: 0o600 });
  return { clean, fingerprint, milliseconds: performance.now() - started };
}

function decodeKeystore(value: string): Buffer {
  const base64 = value.replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("ANDROID_KEYSTORE_BASE64 is not valid base64.");
  }
  const decoded = Buffer.from(base64, "base64");
  if (decoded.length === 0) throw new Error("ANDROID_KEYSTORE_BASE64 decoded to an empty file.");
  return decoded;
}

async function writeKeystore(keystore: Buffer): Promise<{ directory: string; path: string }> {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-android-release-"));
  const path = NodePath.join(directory, "release.jks");
  try {
    await NodeFSP.writeFile(path, keystore, { mode: 0o600 });
    await NodeFSP.chmod(path, 0o600);
  } catch (error) {
    await NodeFSP.rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { directory, path };
}

async function assembleRelease(env: NodeJS.ProcessEnv, keystorePath: string): Promise<number> {
  const started = performance.now();
  const gradleEnv: NodeJS.ProcessEnv = {
    ...env,
    "ORG_GRADLE_PROJECT_android.injected.signing.store.file": keystorePath,
    "ORG_GRADLE_PROJECT_android.injected.signing.store.password":
      NodeProcess.env.ANDROID_KEYSTORE_PASSWORD,
    "ORG_GRADLE_PROJECT_android.injected.signing.key.alias": NodeProcess.env.ANDROID_KEY_ALIAS,
    "ORG_GRADLE_PROJECT_android.injected.signing.key.password":
      NodeProcess.env.ANDROID_KEY_PASSWORD,
  };
  console.log("Building the signed release APK with Gradle...");
  await runChecked(
    NodePath.join(ANDROID_ROOT, NodeProcess.platform === "win32" ? "gradlew.bat" : "gradlew"),
    ["app:assembleRelease"],
    {
      cwd: ANDROID_ROOT,
      env: gradleEnv,
      inherit: true,
      failure: "Gradle release build failed",
    },
  );
  return performance.now() - started;
}

function parseApkMetadata(aaptOutput: string): ApkMetadata {
  const match = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m.exec(
    aaptOutput,
  );
  if (!match?.[1] || !match[2] || match[3] === undefined) {
    throw new Error("Could not read the package, versionCode, or versionName from the APK.");
  }
  const versionCode = Number(match[2]);
  if (!Number.isSafeInteger(versionCode)) {
    throw new Error("The APK has an invalid Android versionCode.");
  }
  return { packageName: match[1], versionCode, versionName: match[3] };
}

function certificateSha256(apksignerOutput: string): string {
  const hashes = Array.from(
    apksignerOutput.matchAll(/certificate SHA-256 digest:\s*([a-f0-9]{64})/gi),
    (match) => match[1]?.toLowerCase(),
  ).filter((hash): hash is string => hash !== undefined);
  const unique = new Set(hashes);
  if (unique.size !== 1) throw new Error("Could not identify one signing certificate in the APK.");
  return unique.values().next().value!;
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = NodeCrypto.createHash("sha256");
    const stream = NodeFS.createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function verifyUpdatesChannel(manifestTree: string): void {
  const lines = manifestTree.split("\n");
  const metadataIndex = lines.findIndex((line) =>
    line.includes("expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY"),
  );
  const valueLine =
    metadataIndex === -1
      ? undefined
      : lines
          .slice(metadataIndex, metadataIndex + 5)
          .find((line) => line.includes("android:value"));
  if (!valueLine?.includes("expo-channel-name") || !valueLine.includes(RELEASE_CHANNEL)) {
    throw new Error(
      `The APK manifest does not embed the expo-channel-name=${RELEASE_CHANNEL} updates header.`,
    );
  }
}

async function verifyApk(
  buildTools: BuildTools,
  versionCode: number,
  noPublish: boolean,
): Promise<{ certSha256: string; metadata: ApkMetadata; sha256: string }> {
  if (!(await fileExists(RELEASE_APK))) {
    throw new Error(`Gradle did not produce ${RELEASE_APK}.`);
  }

  const badging = await runChecked(buildTools.aapt, ["dump", "badging", RELEASE_APK], {
    failure: "aapt could not read the APK",
  });
  const metadata = parseApkMetadata(badging.stdout);
  if (metadata.packageName !== ANDROID_PACKAGE) {
    throw new Error(`Unexpected Android package ${metadata.packageName}.`);
  }
  if (metadata.versionCode !== versionCode) {
    throw new Error(`The APK versionCode is ${metadata.versionCode}, expected ${versionCode}.`);
  }
  if (!metadata.versionName) throw new Error("The APK has no versionName.");

  await runChecked("unzip", ["-tq", RELEASE_APK], {
    failure: "The APK zip archive failed its integrity check",
  });
  const signature = await runChecked(
    buildTools.apksigner,
    ["verify", "--verbose", "--print-certs", RELEASE_APK],
    { failure: "apksigner rejected the APK signature" },
  );
  const certSha256 = certificateSha256(signature.stdout);
  const expectedCertSha256 = (
    NodeProcess.env.T3CODE_MOBILE_ANDROID_SIGNING_CERT_SHA256 ?? DEFAULT_SIGNING_CERT_SHA256
  )
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedCertSha256)) {
    throw new Error("T3CODE_MOBILE_ANDROID_SIGNING_CERT_SHA256 must be a SHA-256 hex digest.");
  }
  if (certSha256 !== expectedCertSha256) {
    const message = `Signing certificate mismatch: APK is ${certSha256}, expected ${expectedCertSha256}.`;
    if (noPublish) {
      console.warn(`Warning: ${message}`);
    } else {
      throw new Error(message);
    }
  }

  const manifestTree = await runChecked(
    buildTools.aapt,
    ["dump", "xmltree", RELEASE_APK, "AndroidManifest.xml"],
    { failure: "aapt could not read the built AndroidManifest.xml" },
  );
  verifyUpdatesChannel(manifestTree.stdout);
  return { certSha256, metadata, sha256: await sha256File(RELEASE_APK) };
}

async function publishRelease(options: {
  readonly certSha256: string;
  readonly metadata: ApkMetadata;
  readonly repository: string;
  readonly sha256: string;
  readonly sourceCommit: string;
  readonly versionCode: number;
}): Promise<void> {
  const tag = `android-preview-${options.versionCode}`;
  await assertVersionAvailable(options.repository, tag);

  const assetPath = NodePath.join(NodePath.dirname(RELEASE_APK), APK_ASSET_NAME);
  await NodeFSP.rm(assetPath, { force: true });
  await NodeFSP.link(RELEASE_APK, assetPath);
  try {
    const title = `T3 Code Fork ${options.metadata.versionName} - Android build ${options.versionCode}`;
    const notes = [
      "Android preview APK built locally with Gradle.",
      `Source commit: ${options.sourceCommit}`,
      `Version code: ${options.versionCode}`,
      `APK SHA-256: ${options.sha256}`,
      `Signing certificate SHA-256: ${options.certSha256}`,
    ].join("\n");
    await runChecked(
      "gh",
      [
        "release",
        "create",
        tag,
        assetPath,
        "--repo",
        options.repository,
        "--target",
        options.sourceCommit,
        "--title",
        title,
        "--notes",
        notes,
        "--latest",
      ],
      { failure: `GitHub could not create release ${tag}`, inherit: true },
    );

    const uploaded = await runChecked(
      "gh",
      ["release", "view", tag, "--repo", options.repository, "--json", "assets"],
      { failure: `Could not verify uploaded assets for ${tag}` },
    );
    const assets: unknown = JSON.parse(uploaded.stdout);
    if (!Array.isArray(assets)) throw new Error("GitHub returned an invalid release asset list.");
    const matchingAsset = assets.find(
      (value): value is { digest?: unknown; name?: unknown } =>
        typeof value === "object" &&
        value !== null &&
        "name" in value &&
        value.name === APK_ASSET_NAME,
    );
    const digest = matchingAsset?.digest;
    if (digest !== `sha256:${options.sha256}`) {
      throw new Error(`Uploaded ${APK_ASSET_NAME} digest does not match the built APK.`);
    }
    console.log(`Published https://github.com/${options.repository}/releases/tag/${tag}`);
  } finally {
    await NodeFSP.rm(assetPath, { force: true });
  }
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

async function main(): Promise<void> {
  const options = parseOptions(NodeProcess.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const started = performance.now();
  Object.assign(NodeProcess.env, loadRepoEnv());
  assertRequiredEnvironment();

  const repository = releaseRepository();
  const needsGitHub = !options.noPublish || options.versionCode === undefined;
  if (needsGitHub) await assertGitHubReady();
  const sourceCommit = options.noPublish ? undefined : await assertCleanPushedCheckout(repository);

  let highestVersionCode = 0;
  if (options.versionCode === undefined) {
    highestVersionCode = Math.max(0, ...(await publishedVersionCodes(repository)));
  }
  const versionCode = options.versionCode ?? highestVersionCode + 1;
  if (versionCode > 2_100_000_000) throw new Error("The next Android versionCode is too large.");
  const tag = `android-preview-${versionCode}`;
  if (!options.noPublish) {
    if (versionCode <= highestVersionCode) {
      throw new Error(
        `--version-code must exceed the latest published build ${highestVersionCode}.`,
      );
    }
    await assertVersionAvailable(repository, tag);
  }

  const buildTools = await resolveBuildTools();
  const env = buildEnvironment(buildTools, versionCode);
  const keystore = decodeKeystore(NodeProcess.env.ANDROID_KEYSTORE_BASE64!);
  const temporaryKeystore = await writeKeystore(keystore);
  try {
    const prebuild = await prebuildAndroid(env);
    const gradleMilliseconds = await assembleRelease(env, temporaryKeystore.path);
    const result = await verifyApk(buildTools, versionCode, options.noPublish);

    console.log(`APK: ${RELEASE_APK}`);
    console.log(`Package: ${result.metadata.packageName}`);
    console.log(`Version: ${result.metadata.versionName} (${result.metadata.versionCode})`);
    console.log(`SHA-256: ${result.sha256}`);
    console.log(`Signing certificate SHA-256: ${result.certSha256}`);
    console.log(
      `Prebuild: ${seconds(prebuild.milliseconds)} (${prebuild.clean ? "clean" : "incremental"})`,
    );
    console.log(`Gradle: ${seconds(gradleMilliseconds)}`);

    if (!options.noPublish) {
      await publishRelease({
        certSha256: result.certSha256,
        metadata: result.metadata,
        repository,
        sha256: result.sha256,
        sourceCommit: sourceCommit!,
        versionCode,
      });
    }
    console.log(`Total: ${seconds(performance.now() - started)}`);
  } finally {
    await NodeFSP.rm(temporaryKeystore.directory, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  NodeProcess.exit(1);
});
