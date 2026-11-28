#!/usr/bin/env bash
set -euo pipefail

umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd -- "$script_dir/.." && pwd)"
secrets_repo="${SECRETS_REPO:-$HOME/secrets}"
project_dir="$secrets_repo/projects/t3code-mobile"
project_env="$project_dir/.env"
credentials_json="$app_dir/credentials.json"
env_local="$app_dir/.env.local"
keystore_path=""
credentials_dir=""
encrypted=0

# The downloads are the only local copy until encryption succeeds, so they are kept on failure.
cleanup() {
  if [[ "$encrypted" -ne 1 ]]; then
    rm -f -- "$project_env"
    return
  fi
  rm -f -- "$credentials_json" "$env_local"
  if [[ -n "$keystore_path" && -n "$credentials_dir" && "$keystore_path" == "$credentials_dir"/* ]]; then
    rm -f -- "$keystore_path"
  fi
  if [[ -d "$app_dir/credentials" ]]; then
    find "$app_dir/credentials" -type d -empty -delete 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ -e "$project_env" ]]; then
  echo "Refusing to overwrite $project_env." >&2
  exit 1
fi
if [[ ! -f "$credentials_json" ]]; then
  echo "Missing apps/mobile/credentials.json. Download the preview signing credentials first." >&2
  exit 1
fi
if [[ ! -f "$env_local" ]]; then
  echo "Missing apps/mobile/.env.local. Run 'eas env:pull --environment preview' first." >&2
  exit 1
fi

keystore_path="$(jq -r '.android.keystore.keystorePath // empty' "$credentials_json")"
if [[ -z "$keystore_path" ]]; then
  echo "credentials.json has no Android keystore path." >&2
  exit 1
fi
if [[ "$keystore_path" != /* ]]; then
  keystore_path="$app_dir/$keystore_path"
fi
if [[ ! -f "$keystore_path" ]]; then
  echo "The keystore named by credentials.json does not exist." >&2
  exit 1
fi
# Compare resolved paths: a glob match would let `credentials/../../x` through.
keystore_path="$(cd -- "$(dirname -- "$keystore_path")" && pwd -P)/$(basename -- "$keystore_path")"
credentials_dir="$(cd -- "$app_dir/credentials" 2>/dev/null && pwd -P)" || credentials_dir=""
if [[ -z "$credentials_dir" || "$keystore_path" != "$credentials_dir"/* ]]; then
  keystore_path=""
  echo "Refusing a keystore outside apps/mobile/credentials." >&2
  exit 1
fi

mkdir -p "$project_dir"

APP_DIR="$app_dir" \
CREDENTIALS_JSON="$credentials_json" \
ENV_LOCAL="$env_local" \
KEYSTORE_PATH="$keystore_path" \
PROJECT_ENV="$project_env" \
node --input-type=module <<'NODE'
import fs from "node:fs";
import { parseEnv } from "node:util";

const appDir = process.env.APP_DIR;
const credentialsPath = process.env.CREDENTIALS_JSON;
const envLocalPath = process.env.ENV_LOCAL;
const keystorePath = process.env.KEYSTORE_PATH;
const projectEnvPath = process.env.PROJECT_ENV;

if (!appDir || !credentialsPath || !envLocalPath || !keystorePath || !projectEnvPath) {
  throw new Error("Import paths were not provided.");
}

const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
const keystore = credentials?.android?.keystore;
if (
  typeof keystore?.keystorePassword !== "string" ||
  typeof keystore?.keyAlias !== "string" ||
  (keystore?.keyPassword != null && typeof keystore.keyPassword !== "string")
) {
  throw new Error("credentials.json is missing Android keystore fields.");
}

const pulled = parseEnv(fs.readFileSync(envLocalPath, "utf8"));
// EAS stores the app's public config as T3CODE_* values; app.config derives EXPO_PUBLIC_* from them.
const publicConfigName = /^(EXPO_PUBLIC_|T3CODE_CLERK_|T3CODE_MOBILE_OTLP_)|^T3CODE_RELAY_URL$/;
const expoValues = Object.fromEntries(
  Object.entries(pulled)
    .filter(([name]) => publicConfigName.test(name))
    .sort(([left], [right]) => left.localeCompare(right, "en")),
);
for (const name of ["T3CODE_CLERK_PUBLISHABLE_KEY", "T3CODE_CLERK_JWT_TEMPLATE", "T3CODE_RELAY_URL"]) {
  if (!expoValues[name]) throw new Error(`The pulled preview environment has no ${name}.`);
}

const values = new Map([
  ["ANDROID_KEYSTORE_BASE64", fs.readFileSync(keystorePath).toString("base64")],
  ["ANDROID_KEYSTORE_PASSWORD", keystore.keystorePassword],
  ["ANDROID_KEY_ALIAS", keystore.keyAlias],
  ["ANDROID_KEY_PASSWORD", keystore.keyPassword ?? keystore.keystorePassword],
  ...Object.entries(expoValues),
]);
for (const [name, value] of values) {
  if (/[\r\n]/.test(value)) throw new Error(`${name} contains a line break.`);
}
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
fs.writeFileSync(
  projectEnvPath,
  [...values].map(([name, value]) => `${name}=${quote(value)}`).join("\n") + "\n",
  { mode: 0o600 },
);
fs.chmodSync(projectEnvPath, 0o600);
console.log(`Imported key names: ${[...values.keys()].join(", ")}`);
NODE

(
  cd -- "$secrets_repo"
  secret add "projects/t3code-mobile/.env"
)
encrypted=1

echo "Removed imported EAS credential files."
