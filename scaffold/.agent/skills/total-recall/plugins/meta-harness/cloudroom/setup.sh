#!/usr/bin/env bash
# Cloudroom cloud environment setup script: Total Recall in every cloud sandbox.
# Paste into Settings -> Cloud environment -> Setup script. It runs once per new
# sandbox as the agent, may run again on wake, and must stay idempotent.
# Output: /var/log/cloudroom/setup.log. "setup-failed: NAME" marks a failed step.
set -u

TR_VERSION=3.41.2
SSSS_VERSION=0.11.2
SUDO=sudo; [ "$(id -u)" = 0 ] && SUDO=

# 1. Total Recall CLI and SSSS, pinned. Agents only search /usr/local/bin,
#    /usr/bin and /bin (plus ~/.local/bin), so the binaries are linked there.
if ! total-recall --version 2>/dev/null | grep -q "v$TR_VERSION"; then
  $SUDO npm install -g --no-audit --no-fund "total-recall-brain@$TR_VERSION" "@gregiteen/ssss-cli@$SSSS_VERSION" >/dev/null 2>&1 \
    || echo "setup-failed: total-recall"
fi
prefix=$(npm prefix -g 2>/dev/null)
for bin in total-recall ssss; do
  command -v "$bin" >/dev/null || { [ -x "$prefix/bin/$bin" ] && $SUDO ln -sf "$prefix/bin/$bin" "/usr/local/bin/$bin"; }
done
command -v total-recall >/dev/null || echo "setup-failed: total-recall-path"

# 2. This sandbox's own auth store. The master password is random per sandbox
#    and lives only in the owner-only carrier ~/.agent/tr.env; it never leaves.
mkdir -p "$HOME/.agent" && chmod 700 "$HOME/.agent"
if [ ! -s "$HOME/.agent/tr.env" ]; then
  ( umask 077; printf 'TR_SECRETS_PASSWORD=%s\n' "$(openssl rand -hex 32)" > "$HOME/.agent/tr.env" )
fi

# 3. Import the keys Cloudroom holds (Settings -> Cloud environment -> API keys)
#    into the sandbox auth store, so agents read credentials through Total
#    Recall auth as they do on every other host. TR_IMPORT_KEYS lists the names.
for key in ${TR_IMPORT_KEYS:-}; do
  value="${!key:-}"
  [ -n "$value" ] || { echo "setup-failed: key $key is not in the cloud environment"; continue; }
  printf '%s' "$value" | total-recall auth secret set "$key" --stdin >/dev/null 2>&1 || echo "setup-failed: key $key"
done

# 4. The nine default plugins, installed once in the global brain as on every
#    other machine (private plugins such as operator-alerts require auth).
for id in auth mesh openwiki composable-cli cli-agents code-quality security embeddings git-sentinel; do
  total-recall plugin info "$id" >/dev/null 2>&1 || total-recall plugin install "$id" --global >/dev/null 2>&1 || echo "setup-failed: plugin $id"
done

# 5. Private plugins. Add each tr-plugin-* repository under Cloud environment ->
#    Repos; Cloudroom clones them into /repos. Bundled plugins ship with the CLI.
for dir in /repos/tr-plugin-*; do
  [ -f "$dir/plugin.json" ] || continue
  id=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id)' "$dir/plugin.json" 2>/dev/null)
  [ -n "$id" ] || { echo "setup-failed: plugin manifest $dir"; continue; }
  total-recall plugin info "$id" >/dev/null 2>&1 && continue
  [ -f "$dir/package.json" ] && [ ! -d "$dir/node_modules" ] && (cd "$dir" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1)
  total-recall plugin install "$dir" --global >/dev/null 2>&1 || echo "setup-failed: plugin $id"
done

# 6. Give every agent harness Total Recall's instructions and skills, in the
#    project and in each cloned repo that carries compiled instructions.
for repo in "$PWD" /repos/*; do
  [ -f "$repo/INSTRUCTIONS.md" ] || continue
  for client in claude-code codex hermes; do
    (cd "$repo" && total-recall connect "$client" >/dev/null 2>&1) || echo "setup-failed: connect $client in $repo"
  done
done
echo "total-recall $(total-recall --version 2>/dev/null | tail -1) ready"
