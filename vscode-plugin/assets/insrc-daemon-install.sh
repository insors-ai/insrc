#!/bin/bash
#
# insrc daemon bootstrap installer.
#
# What this script does:
#   1. Provision verified local Node/npm and check git.
#   2. Clone insors-ai/insrc.git into ~/.insrc/daemon (configurable).
#      (The daemon lives in its own repo; repo root carries package.json
#       + src/ + out/ directly.)
#   3. Fast-forward the checkout to the configured branch head.
#   4. npm install + npm run build at the repo root.
#   5. Symlink out/node_modules -> ../node_modules so the compiled MCP
#      binary at out/bin/insrc-mcp.js resolves its deps.
#   6. Start the daemon (unless --no-start).
#   7. Print next-step guidance (MCP registration, interactive TUI).
#
# The release script includes the trusted macOS upgrade verifier. The
# daemon source is pulled from GitHub at install time.
# Update the install by re-running this script or by
# running $INSTALL_ROOT/scripts/daemon-ctl.sh update.
#
# Usage:
#   ./insrc-daemon-install.sh                       # install to ~/.insrc/daemon on default branch
#   ./insrc-daemon-install.sh --target /custom/path # override install location
#   ./insrc-daemon-install.sh --branch main         # track a different branch
#   ./insrc-daemon-install.sh --migrate-runtime    # explicitly stage migration from an old global runtime record
#   ./insrc-daemon-install.sh --runtime-archive <file> # supply the pinned official archive offline
#   ./insrc-daemon-install.sh --no-start            # install + build but don't start
#   ./insrc-daemon-install.sh --repo <url>          # install from a fork
#   ./insrc-daemon-install.sh --embedder onnx       # force embedded ONNX (skip Ollama probe)
#   ./insrc-daemon-install.sh --embedder ollama     # force Ollama (error if not reachable)
#   ./insrc-daemon-install.sh --embedder auto       # default: prompt if Ollama detected
#   ./insrc-daemon-install.sh -y                    # non-interactive, assume defaults
#   ./insrc-daemon-install.sh --help
#
# One-liner:
#   curl -fsSL https://github.com/insors-ai/insrc/releases/latest/download/insrc-daemon-install.sh | bash
#
# Exit codes:
#   0 success
#   1 usage error / user abort
#   2 prerequisites or verified local runtime unavailable
#   3 install target not usable (exists but not a git checkout, or unwritable)
#   4 git / npm / build step failed

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults + argv
# ---------------------------------------------------------------------------

DEFAULT_REPO_URL='https://github.com/insors-ai/insrc.git'
DEFAULT_BRANCH='main'
DEFAULT_TARGET="$HOME/.insrc/daemon"


INSTALL_ROOT="$DEFAULT_TARGET"
REPO_URL="$DEFAULT_REPO_URL"
BRANCH="$DEFAULT_BRANCH"
EXPLICIT_REPO=0
EXPLICIT_BRANCH=0
START_AFTER_INSTALL=1
ASSUME_YES=0
FRESH_MAC_INSTALL=0
# Filled by release packaging with the verifier and independently provisioned public key.
INSRC_RELEASE_BOOTSTRAP_B64=''
INSRC_NODE_BOOTSTRAP_B64='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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
INSRC_NODE_BOOTSTRAP_SHA256='e9315c4d5a1e115f60fd4a40719695002c38a9424b40bf31acf2511af18a8195'
PRINT_RUNTIME=0
RUNTIME_ARCHIVE=''
MIGRATE_RUNTIME=0
RUNTIME_ASSET_STAGE=''
BRIDGE=''
CANDIDATE_MARKER=''
TECHNICAL_READY=0
cleanup_install() {
  if [ "$TECHNICAL_READY" -eq 0 ] && [ -n "$CANDIDATE_MARKER" ]; then /bin/rm -f "$CANDIDATE_MARKER"; fi
  [ -z "$BRIDGE" ] || /bin/rm -rf "$BRIDGE"
  [ -z "$RUNTIME_ASSET_STAGE" ] || /bin/rm -rf "$RUNTIME_ASSET_STAGE"
}
trap cleanup_install EXIT

write_release_verifier() {
	(
		unset NODE_OPTIONS NODE_PATH
		"$NODE_BIN" --input-type=commonjs -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], Buffer.from(process.argv[2],"base64"), {flag:"wx",mode:0o600});' "$1" "$INSRC_RELEASE_BOOTSTRAP_B64"
	)
}
EMBEDDER_CHOICE="auto"     # auto | ollama | onnx
LOG_FILE=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
	C_CYAN=$(tput setaf 6); C_GREEN=$(tput setaf 2)
	C_YELLOW=$(tput setaf 3); C_RED=$(tput setaf 1)
	C_BOLD=$(tput bold); C_RESET=$(tput sgr0)
else
	C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BOLD=""; C_RESET=""
fi

log()  { printf '%s[%s]%s %s\n' "$C_CYAN" "$(date +%H:%M:%S)" "$C_RESET" "$*"; [ -n "$LOG_FILE" ] && echo "[$(date +%H:%M:%S)] $*" >>"$LOG_FILE" || true; }
ok()   { printf '%s[OK]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; [ -n "$LOG_FILE" ] && echo "OK: $*" >>"$LOG_FILE" || true; }
warn() { printf '%s[WARN]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; [ -n "$LOG_FILE" ] && echo "WARN: $*" >>"$LOG_FILE" || true; }
die()  { printf '%s[FATAL]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; [ -n "$LOG_FILE" ] && echo "FATAL: $*" >>"$LOG_FILE" || true; exit "${2:-1}"; }

usage() {
	sed -n '3,40p' "$0" | sed 's/^# \{0,1\}//'
	exit 1
}

confirm() {
	if [ "$ASSUME_YES" -eq 1 ]; then return 0; fi
	local prompt="$1"
	printf '%s? %s [Y/n] ' "$C_BOLD" "$prompt$C_RESET"
	read -r reply || return 1
	case "$reply" in
		''|y|Y|yes|Yes|YES) return 0 ;;
		*) return 1 ;;
	esac
}

# ---------------------------------------------------------------------------
# Argv parsing
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
	case "$1" in
		--target)    shift; INSTALL_ROOT="${1:-}"; [ -n "$INSTALL_ROOT" ] || die "--target requires a value" ;;
		--branch)    shift; BRANCH="${1:-}"; EXPLICIT_BRANCH=1; [ -n "$BRANCH" ] || die "--branch requires a value" ;;
		--repo)      shift; REPO_URL="${1:-}"; EXPLICIT_REPO=1; [ -n "$REPO_URL" ] || die "--repo requires a value" ;;
		--no-start)  START_AFTER_INSTALL=0 ;;
		--print-runtime) PRINT_RUNTIME=1 ;;
		--migrate-runtime) MIGRATE_RUNTIME=1 ;;
		--runtime-archive) shift; RUNTIME_ARCHIVE="${1:-}"; [ -n "$RUNTIME_ARCHIVE" ] || die "--runtime-archive requires a file" ;;
		--embedder)
			shift
			EMBEDDER_CHOICE="${1:-}"
			case "$EMBEDDER_CHOICE" in
				auto|ollama|onnx) ;;
				*) die "--embedder must be one of: auto | ollama | onnx (got '$EMBEDDER_CHOICE')" ;;
			esac
			;;
		-y|--yes)    ASSUME_YES=1 ;;
		-h|--help)   usage ;;
		*)           die "unknown arg: $1 (see --help)" ;;
	esac
	shift
done

RUNTIME_TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" && pwd -P)"
if [ -n "$INSRC_NODE_BOOTSTRAP_B64" ]; then
  RUNTIME_ASSET_STAGE=$(mktemp -d "${TMPDIR:-/tmp}/insrc-runtime-assets-XXXXXXXX")
  chmod 700 "$RUNTIME_ASSET_STAGE"
  printf '%s' "$INSRC_NODE_BOOTSTRAP_B64" | /usr/bin/base64 -d > "$RUNTIME_ASSET_STAGE/assets.tar.gz" || die 'invalid embedded runtime assets' 2
  asset_hash=$(/usr/bin/shasum -a 256 < "$RUNTIME_ASSET_STAGE/assets.tar.gz")
  [ "${asset_hash%% *}" = "$INSRC_NODE_BOOTSTRAP_SHA256" ] || die 'embedded runtime asset digest mismatch' 2
  /usr/bin/tar -xzf "$RUNTIME_ASSET_STAGE/assets.tar.gz" -C "$RUNTIME_ASSET_STAGE" || die 'embedded runtime extraction failed' 2
  RUNTIME_TOOLS="$RUNTIME_ASSET_STAGE/scripts"
fi
[ -f "$RUNTIME_TOOLS/node-runtime-env.sh" ] || die "runtime bootstrap assets missing; use the matching packaged installer" 2
. "$RUNTIME_TOOLS/node-runtime-env.sh"
RUNTIME_MODE=
[ "$MIGRATE_RUNTIME" -eq 0 ] || RUNTIME_MODE=migration
[ "$PRINT_RUNTIME" -eq 0 ] || RUNTIME_MODE=bootstrap
insrc_source_toolchain "$RUNTIME_TOOLS" "$HOME/.insrc" "$RUNTIME_ARCHIVE" "$RUNTIME_MODE" || die "verified local Node toolchain is unavailable" 2
if [ "$PRINT_RUNTIME" -eq 1 ]; then printf '%s\n' "$NODE_BIN"; exit 0; fi

DAEMON_SRC="$INSTALL_ROOT"
LOG_DIR="/tmp/insrc"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="/tmp"
LOG_FILE="$LOG_DIR/daemon-install-$(date +%Y%m%d-%H%M%S)-$$.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE=""

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

printf '\n%s%s=== insrc daemon installer ===%s\n\n' "$C_BOLD" "$C_CYAN" "$C_RESET"
log "target:    $INSTALL_ROOT"
log "repo URL:  $REPO_URL"
log "branch:    $BRANCH"
log "auto-start: $([ "$START_AFTER_INSTALL" -eq 1 ] && echo yes || echo no)"
case "$EMBEDDER_CHOICE" in
	auto)   log "embedder mode: auto (probe Ollama; prompt if detected)" ;;
	ollama) log "embedder mode: ollama (force Ollama; fail if unreachable)" ;;
	onnx)   log "embedder mode: onnx (force embedded nomic-embed-text-v1.5)" ;;
esac
[ -n "$LOG_FILE" ] && log "install log: $LOG_FILE"
printf '\n'

# ---------------------------------------------------------------------------
# Step 1: prerequisites
# ---------------------------------------------------------------------------

log "checking prerequisites..."
command -v git >/dev/null 2>&1 || die "git not found on PATH" 2

ok "local Node $("$NODE_BIN" -v) + git $(git --version | awk '{print $3}')"

# ---------------------------------------------------------------------------
# Step 2: clone or update the checkout
# ---------------------------------------------------------------------------

FRESH_MARKER="$HOME/.insrc/managed-lifecycle/fresh-install.pending"
if [ "$(uname -s)" = Darwin ] && [ -f "$FRESH_MARKER" ] && [ ! -L "$FRESH_MARKER" ]; then
	[ "$(cat "$FRESH_MARKER")" = "$INSTALL_ROOT" ] || die "fresh installation is pending for a different target" 4
	FRESH_MAC_INSTALL=1
fi
if [ "$(uname -s)" = Darwin ] && [ -f "$INSTALL_ROOT/out/bin/insrc-daemon-control.js" ] && [ -f "$HOME/.insrc/managed-lifecycle/journal.json" ]; then
	RESUME_ARGS=(resume-fresh)
	if [ "$FRESH_MAC_INSTALL" -eq 1 ]; then RESUME_ARGS+=("$INSTALL_ROOT"); fi
	if "$NODE_BIN" "$INSTALL_ROOT/out/bin/insrc-daemon-control.js" "${RESUME_ARGS[@]}"; then
		if [ "$FRESH_MAC_INSTALL" -eq 1 ]; then rm -f "$FRESH_MARKER"; fi
		ok "recovered managed daemon installation"
		exit 0
	else
		rc=$?
		[ "$rc" -eq 10 ] || die "managed daemon activation could not be recovered" 4
	fi
fi

# An existing macOS installation must stay executable while its replacement is built.
if [ "$(uname -s)" = Darwin ] && [ "$FRESH_MAC_INSTALL" -eq 0 ] && [ -e "$INSTALL_ROOT" ]; then
	if [ ! -d "$INSTALL_ROOT/.git" ] && [ ! -f "$HOME/.insrc/managed-lifecycle/installation.json" ] \
		&& [ -f "$HOME/.insrc/managed-lifecycle/journal.json" ] && [ -x "$INSTALL_ROOT/scripts/daemon-ctl.sh" ]; then
		"$INSTALL_ROOT/scripts/daemon-ctl.sh" recover || die "interrupted macOS upgrade could not be recovered" 4
	fi
	if [ -f "$HOME/.insrc/managed-lifecycle/installation.json" ] && [ -x "$INSTALL_ROOT/scripts/daemon-ctl.sh" ]; then
		if "$NODE_BIN" -e 'const fs=require("fs"); process.exit(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).enabled === true ? 0 : 1)' "$HOME/.insrc/managed-lifecycle/installation.json"; then
			UPDATE_ARGS=(update)
			if [ "$EXPLICIT_REPO" -eq 1 ]; then UPDATE_ARGS+=(--repo-url "$REPO_URL"); fi
			if [ "$EXPLICIT_BRANCH" -eq 1 ]; then UPDATE_ARGS+=(--branch "$BRANCH"); fi
			cd /
			cleanup_install
			INSRC_DAEMON_UPDATE_WAIT=1 INSRC_DAEMON_ROOT="$INSTALL_ROOT" exec "$INSTALL_ROOT/scripts/daemon-ctl.sh" "${UPDATE_ARGS[@]}"
		fi
	fi
	[ -d "$INSTALL_ROOT/.git" ] || die "existing target is neither a legacy checkout nor a managed launcher" 3
	confirm "stage a verified macOS daemon upgrade" || die "user declined" 1
	if [ "$EXPLICIT_REPO" -eq 0 ]; then
		REPO_URL=$(git -C "$INSTALL_ROOT" remote get-url origin)
		CONFIG_REPO=$("$NODE_BIN" -e 'try {const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(c.daemonUpdate?.repoUrl ?? "");}catch(e){if(e.code!=="ENOENT")throw e;}' "$HOME/.insrc/config.json")
		if [ -n "$CONFIG_REPO" ]; then REPO_URL="$CONFIG_REPO"; fi
	fi
	if [ "$EXPLICIT_BRANCH" -eq 0 ]; then
		BRANCH=$(git -C "$INSTALL_ROOT" symbolic-ref --short HEAD)
		CONFIG_BRANCH=$("$NODE_BIN" -e 'try {const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(c.daemonUpdate?.branch ?? "");}catch(e){if(e.code!=="ENOENT")throw e;}' "$HOME/.insrc/config.json")
		if [ -n "$CONFIG_BRANCH" ]; then BRANCH="$CONFIG_BRANCH"; fi
	fi
	case "$REPO_URL" in https://*|http://*|ssh://*|git://*|file://*|/*|*@*:*) ;; *) die "unsupported daemon origin" 3 ;; esac
	git check-ref-format --branch "$BRANCH" >/dev/null || die "invalid daemon branch" 3
	BRIDGE=$(mktemp -d "${TMPDIR:-/tmp}/insrc-upgrade-XXXXXXXX")
	trap cleanup_install EXIT
	log "preparing the macOS upgrade bridge beside the installed release"
	[ -n "$INSRC_RELEASE_BOOTSTRAP_B64" ] || die "production source release signing key is not provisioned" 4
	write_release_verifier "$BRIDGE/verifier.mjs"
	(
		unset NODE_OPTIONS NODE_PATH
		"$NODE_BIN" "$BRIDGE/verifier.mjs" authorize "$BRIDGE" "$HOME/.insrc" "$REPO_URL" "$BRANCH"
	) || die "macOS upgrade bridge authorization failed" 4
	( cd "$BRIDGE/checkout" && CXXFLAGS="${CXXFLAGS:+$CXXFLAGS }-std=c++17" "$NODE_BIN" "$NPM_CLI" ci --no-fund --no-audit && "$NODE_BIN" "$NPM_CLI" run --silent build )
	[ -f "$BRIDGE/checkout/out/bin/insrc-daemon-control.js" ] || die "selected branch has no macOS upgrade bridge" 4
	INSTALL_ROOT=$(cd "$INSTALL_ROOT" && pwd -P)
	cd /
	# The controller owns bridge cleanup after exec; bootstrap assets are no longer needed.
	[ -z "$RUNTIME_ASSET_STAGE" ] || /bin/rm -rf "$RUNTIME_ASSET_STAGE"
	RUNTIME_ASSET_STAGE=''
	# No old checkout shell remains during the fence census.
	unset NODE_OPTIONS NODE_PATH
	exec "$NODE_BIN" "$BRIDGE/checkout/out/bin/insrc-daemon-control.js" prepare-legacy-upgrade "$INSTALL_ROOT" "$REPO_URL" "$BRANCH" "$BRIDGE"
fi

if [ -e "$INSTALL_ROOT" ] && [ "$FRESH_MAC_INSTALL" -eq 0 ]; then
 die 'existing source installation requires a staged update; in-place replacement is unavailable on this target. Retain the current installation and use a qualified staged migration.' 4
fi

if [ -e "$INSTALL_ROOT" ]; then
	if [ ! -d "$INSTALL_ROOT/.git" ]; then
		die "$INSTALL_ROOT exists but is not a git checkout -- move it aside or use --target <other>" 3
	fi
	log "existing checkout found at $INSTALL_ROOT"
	confirm "update it (fast-forward to origin/$BRANCH)" || die "user declined" 1
	log "fetching origin..."
	git -C "$INSTALL_ROOT" fetch --quiet origin "$BRANCH"
	# A prior `npm install` rewrites package-lock.json; the install
	# mirrors origin exactly, so discard that churn before the ff-merge
	# (otherwise `git merge --ff-only` refuses on the local change).
	git -C "$INSTALL_ROOT" checkout -- package-lock.json 2>/dev/null || true
	CURRENT=$(git -C "$INSTALL_ROOT" rev-parse HEAD)
	INCOMING=$(git -C "$INSTALL_ROOT" rev-parse "origin/$BRANCH")
	if [ "$CURRENT" != "$INCOMING" ]; then
		if ! git -C "$INSTALL_ROOT" merge-base --is-ancestor "$CURRENT" "$INCOMING"; then
			die "$INSTALL_ROOT/HEAD has diverged from origin/$BRANCH -- resolve manually or move the tree aside" 3
		fi
		git -C "$INSTALL_ROOT" checkout --quiet "$BRANCH" 2>/dev/null || true
		git -C "$INSTALL_ROOT" merge --quiet --ff-only "$INCOMING"
		ok "fast-forwarded ${CURRENT:0:8} -> ${INCOMING:0:8}"
	else
		ok "already at ${CURRENT:0:8} (no-op)"
	fi
else
	if [ "$(uname -s)" = Darwin ]; then FRESH_MAC_INSTALL=1; fi
	log "cloning $REPO_URL into $INSTALL_ROOT (branch: $BRANCH) ..."
	mkdir -p "$(dirname "$INSTALL_ROOT")"
	git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_ROOT"
	ok "clone complete"
	if [ "$FRESH_MAC_INSTALL" -eq 1 ] && [ ! -e "$FRESH_MARKER" ]; then
		mkdir -m 700 -p "$(dirname "$FRESH_MARKER")"
		(umask 077; set -C; printf '%s\n' "$INSTALL_ROOT" > "$FRESH_MARKER")
	fi
fi

# ---------------------------------------------------------------------------
# Step 3: npm install + build
# ---------------------------------------------------------------------------

[ -d "$DAEMON_SRC" ] || die "expected daemon source at $DAEMON_SRC but not found -- was the branch renamed?" 3

# The install marker (INSTALL_MARKER in src/cli/services/maintenance.ts, also
# read by scripts/daemon-ctl.sh): the blob hash of the package-lock.json the last
# successful npm install ran from. Removed before the install and written after
# it, so the first update after a good install skips and one after a failed
# install installs again. CXXFLAGS asks for C++17 (NATIVE_CXX_STD there): fs-ext
# sets no standard and does not build on the Node 22.22.1 headers without it.
INSTALL_MARKER="$DAEMON_SRC/node_modules/.insrc-install-ok"
CANDIDATE_MARKER="$INSTALL_MARKER"
rm -f "$INSTALL_MARKER"
# The lockfile's hash before npm can rewrite it: the one the update paths compare.
LOCK_HASH=$(git -C "$DAEMON_SRC" hash-object package-lock.json 2>/dev/null || echo "")
log "installing daemon dependencies (may take a few minutes on first install) ..."
INSTALL_COMMAND=install
if [ "$FRESH_MAC_INSTALL" -eq 1 ]; then INSTALL_COMMAND=ci; fi
( cd "$DAEMON_SRC" && CXXFLAGS="${CXXFLAGS:+$CXXFLAGS }-std=c++17" "$NODE_BIN" "$NPM_CLI" "$INSTALL_COMMAND" --no-fund --no-audit ) 2>&1 | tail -3 | while IFS= read -r line; do
	printf '   %s\n' "$line"
done
if [ -n "$LOCK_HASH" ]; then
	mkdir -p "$(dirname "$INSTALL_MARKER")"
	printf '%s\n' "v2:$LOCK_HASH:$TOOLCHAIN_ID" > "$INSTALL_MARKER"
fi
ok "npm install done"

log "building daemon (tsc) ..."
( cd "$DAEMON_SRC" && "$NODE_BIN" "$NPM_CLI" run --silent build ) 2>&1 | tail -5 | while IFS= read -r line; do
	printf '   %s\n' "$line"
done
ok "build done"

# ---------------------------------------------------------------------------
# Step 4: symlink out/node_modules -> ../node_modules
# ---------------------------------------------------------------------------

# Technical readiness precedes binding and the existing lifecycle activation.
( cd "$DAEMON_SRC" && "$NODE_BIN" out/bin/insrc-runtime-smoke.js ) || die 'candidate native module smoke failed; activation withheld' 4
"$NODE_BIN" "$RUNTIME_TOOLS/node-runtime-store.mjs" bind "$HOME/.insrc" "$DAEMON_SRC" "${NODE_BIN%/bin/node}" || die 'runtime binding failed; activation withheld' 4
TECHNICAL_READY=1

# The compiled binary at out/bin/insrc-mcp.js needs node_modules resolvable
# from out/. tsc doesn't copy them, and a symlink is the least-fragile fix.
OUT_DIR="$INSTALL_ROOT/out"
if [ -d "$OUT_DIR" ] && [ ! -e "$OUT_DIR/node_modules" ]; then
	ln -sf ../node_modules "$OUT_DIR/node_modules"
	ok "symlinked out/node_modules -> ../node_modules"
fi

# ---------------------------------------------------------------------------
# Step 4b: embedder selection + first-boot config
# ---------------------------------------------------------------------------

CONFIG_FILE="$HOME/.insrc/config.json"
OLLAMA_HOST_URL="${OLLAMA_HOST:-http://localhost:11434}"
HAS_OLLAMA=0
RESOLVED_EMBEDDER=""

if [ "$EMBEDDER_CHOICE" != "onnx" ]; then
	if curl -fsS --max-time 2 "$OLLAMA_HOST_URL/api/tags" >/dev/null 2>&1; then
		HAS_OLLAMA=1
	fi
fi

case "$EMBEDDER_CHOICE" in
	ollama)
		[ "$HAS_OLLAMA" -eq 1 ] || die "--embedder ollama specified but Ollama is not reachable at $OLLAMA_HOST_URL" 2
		RESOLVED_EMBEDDER="ollama"
		ok "using Ollama at $OLLAMA_HOST_URL (forced by --embedder ollama)"
		;;
	onnx)
		RESOLVED_EMBEDDER="onnx"
		ok "using embedded ONNX (nomic-embed-text-v1.5, 768-dim) -- forced by --embedder onnx"
		;;
	auto)
		if [ "$HAS_OLLAMA" -eq 1 ]; then
			if [ "$ASSUME_YES" -eq 1 ]; then
				RESOLVED_EMBEDDER="ollama"
				ok "detected Ollama at $OLLAMA_HOST_URL (using it; pass --embedder onnx to override)"
			else
				printf '\n%sOllama detected at %s.%s\n' "$C_BOLD" "$OLLAMA_HOST_URL" "$C_RESET"
				printf 'Choose an embedder:\n'
				printf '  1) Ollama          -- qwen3-embedding:0.6b (~700 MB, GPU-accelerated, 1024-dim)\n'
				printf '  2) Embedded ONNX   -- nomic-embed-text-v1.5 (~140 MB, CPU, no external deps, 768-dim)\n\n'
				printf 'Which one? [1/2] (default 1): '
				read -r reply || reply=""
				case "$reply" in
					2|onnx|nomic|N|n) RESOLVED_EMBEDDER="onnx"; ok "chose embedded ONNX" ;;
					*)                RESOLVED_EMBEDDER="ollama"; ok "chose Ollama" ;;
				esac
			fi
		else
			RESOLVED_EMBEDDER="onnx"
			log "Ollama not detected at $OLLAMA_HOST_URL -- using embedded ONNX (nomic-embed-text-v1.5, ~140 MB on first use)"
		fi
		;;
esac

# ---------------------------------------------------------------------------
# Step 4b: preferred CLI + per-role model tiers (Epic per-role-per-step)
#   The RoleRouter routes each operation to a capability tier: core (high) for
#   design/review/build, mid for synthesis/grounding, cheap (the cheapest CLI model) for
#   classification/probes/summaries. Preconfigure the tier->model map for the
#   chosen CLI from the model definitions file cloned and built in steps 2-3
#   (src/assets/models/cloud-model-catalog.json): the tier defaults of the
#   family that CLI runs, and the Ollama tool-loop model as the local coreModel.
# ---------------------------------------------------------------------------
MODEL_DEFS="$DAEMON_SRC/src/assets/models/cloud-model-catalog.json"
[ -f "$MODEL_DEFS" ] || die "model definitions not found at $MODEL_DEFS -- was the build incomplete?" 3
# model_defs <cli kind> <tiers|summary|toolloop>: read the definitions file.
model_defs() {
	"$NODE_BIN" -e '
const [file, kind, what] = process.argv.slice(1);
const defs = JSON.parse(require("fs").readFileSync(file, "utf8"));
if (what === "toolloop") { process.stdout.write(defs.families.find(f => f.cliKind === undefined).toolLoopModel); process.exit(0); }
const def = defs.families.find(f => f.id === defs.defaultFamily);
const fam = def !== undefined && def.cliKind === kind ? def : defs.families.find(f => f.cliKind === kind);
if (fam === undefined) { process.stderr.write("no model family in " + file + " runs the " + kind + " CLI\n"); process.exit(3); }
const t = fam.tierDefaults;
if (what === "summary") { process.stdout.write(["core", "mid", "cheap"].map(n => n + "=" + t[n].model).join(", ")); process.exit(0); }
const tier = n => JSON.stringify({ runner: fam.id, model: t[n].model, ...(t[n].effort !== undefined ? { effort: t[n].effort } : {}) });
process.stdout.write("\"coreFloor\": \"core\",\n\t\t\"tiers\": {\n" + ["core", "mid", "cheap"].map(n => "\t\t\t\"" + n + "\": " + tier(n)).join(",\n") + "\n\t\t},");
' "$MODEL_DEFS" "$1" "$2"
}
CLI_CHOICE="claude"
if [ "$ASSUME_YES" -eq 0 ]; then
	printf '%s? Preferred CLI for reasoning (core=high / mid models)? [claude/codex] %s' "$C_BOLD" "$C_RESET"
	read -r reply || reply=""
	case "$reply" in
		codex|Codex|CODEX|c|C) CLI_CHOICE="codex" ;;
		*)                     CLI_CHOICE="claude" ;;
	esac
fi
CLI_SUMMARY="$(model_defs "$CLI_CHOICE" summary)" || die "no model family in $MODEL_DEFS runs the $CLI_CHOICE CLI -- choose another CLI or fix the definitions file" 3
ok "CLI: $CLI_CHOICE ($CLI_SUMMARY)"
ANALYZE_TIERS_JSON="$(model_defs "$CLI_CHOICE" tiers)"
LOCAL_CORE_MODEL="$(model_defs "$CLI_CHOICE" toolloop)"

if [ "$RESOLVED_EMBEDDER" = "onnx" ]; then
	if [ ! -f "$CONFIG_FILE" ]; then
		mkdir -p "$HOME/.insrc"
		# models.tiers pins the per-role capability tiers for the chosen CLI.
		# The shaper/summariser providers are DERIVED from the tiers (core/cheap)
		# — there is no separate shaperProvider key. Any role without an explicit
		# tier resolves through the router's built-in defaults.
		cat > "$CONFIG_FILE" <<CFG
{
	"models": {
		${ANALYZE_TIERS_JSON}
		"local": {
			"host":           "http://localhost:11434",
			"embeddingModel": "nomic-ai/nomic-embed-text-v1.5",
			"embeddingDim":   768,
			"coreModel":      "${LOCAL_CORE_MODEL}",
			"charsPerToken":  3
		}
	}
}
CFG
		ok "wrote $CONFIG_FILE (ONNX embedder; $CLI_CHOICE tiers)"
	else
		if ! grep -q 'nomic-embed-text' "$CONFIG_FILE" 2>/dev/null; then
			warn "existing $CONFIG_FILE does not appear to reference the ONNX embedder"
			warn "  update embeddingModel to 'nomic-ai/nomic-embed-text-v1.5' and embeddingDim to 768"
			warn "  then: rm -rf ~/.insrc/lance && re-add repos"
		else
			log "existing $CONFIG_FILE already references ONNX embedder -- left in place"
		fi
	fi
elif [ "$RESOLVED_EMBEDDER" = "ollama" ]; then
	if [ ! -f "$CONFIG_FILE" ]; then
		mkdir -p "$HOME/.insrc"
		cat > "$CONFIG_FILE" <<CFG
{
	"models": {
		${ANALYZE_TIERS_JSON}
		"local": {
			"host":           "http://localhost:11434",
			"embeddingModel": "qwen3-embedding:0.6b",
			"embeddingDim":   1024,
			"coreModel":      "${LOCAL_CORE_MODEL}",
			"charsPerToken":  3
		}
	}
}
CFG
		ok "wrote $CONFIG_FILE (Ollama embedder; $CLI_CHOICE tiers)"
	elif grep -q 'nomic-embed-text' "$CONFIG_FILE" 2>/dev/null; then
		warn "existing $CONFIG_FILE references the ONNX embedder but you chose Ollama"
		warn "  update embeddingModel to 'qwen3-embedding:0.6b' and embeddingDim to 1024"
		warn "  then: rm -rf ~/.insrc/lance && re-add repos"
	fi
fi

# ---------------------------------------------------------------------------
# Step 5: start
# ---------------------------------------------------------------------------

CTL="$INSTALL_ROOT/scripts/daemon-ctl.sh"
if [ ! -x "$CTL" ] && [ -f "$CTL" ]; then chmod +x "$CTL" 2>/dev/null || true; fi

if [ "$FRESH_MAC_INSTALL" -eq 1 ]; then
	ACTIVATION_INTENT=idle
	if [ "$START_AFTER_INSTALL" -eq 1 ]; then ACTIVATION_INTENT=start; fi
	HELPER="$INSTALL_ROOT/out/bin/insrc-daemon-control.js"
	[ -f "$HELPER" ] || die "this daemon release does not include the macOS supervisor controller" 4
	if [ -n "$INSRC_RELEASE_BOOTSTRAP_B64" ]; then
		BRIDGE=$(mktemp -d "${TMPDIR:-/tmp}/insrc-verifier-XXXXXXXX")
		trap cleanup_install EXIT
		write_release_verifier "$BRIDGE/verifier.mjs"
		"$NODE_BIN" "$HELPER" activate-fresh "$INSTALL_ROOT" "$ACTIVATION_INTENT" "$BRIDGE/verifier.mjs"
	else
		"$NODE_BIN" "$HELPER" activate-fresh "$INSTALL_ROOT" "$ACTIVATION_INTENT"
	fi
	rm -f "$FRESH_MARKER"
elif [ "$START_AFTER_INSTALL" -eq 1 ] && [ -x "$CTL" ]; then
	log "starting daemon ..."
	INSRC_DAEMON_ROOT="$INSTALL_ROOT" "$CTL" start --skip-sync --skip-install --skip-build 2>&1 | tail -3 | while IFS= read -r line; do
		printf '   %s\n' "$line"
	done
	ok "daemon started"
else
	if [ "$START_AFTER_INSTALL" -eq 0 ]; then
		log "skipping daemon start (--no-start)"
	else
		warn "daemon-ctl.sh not found at $CTL -- skipping start step"
	fi
fi

# ---------------------------------------------------------------------------
# Step 6: next-step guidance
# ---------------------------------------------------------------------------

printf '\n%s%sinsrc daemon install complete.%s\n\n' "$C_BOLD" "$C_GREEN" "$C_RESET"

if [ "$RESOLVED_EMBEDDER" = "onnx" ]; then
	cat <<EOF
Embedder: in-process ONNX (nomic-embed-text-v1.5, 768-dim). The
model downloads to ~/.insrc/models/hf-cache on first embed call
(~140 MB, ~30 s cold).

Analyze shaper: routed to your CLI OAuth session (Claude Code
via the multi-turn insrc_analyze_step tool, or Codex CLI).
Ollama is NOT required for this mode.

To switch back to Ollama later:
- ollama pull qwen3-embedding:0.6b
- Update ~/.insrc/config.json embeddingModel to 'qwen3-embedding:0.6b' and embeddingDim to 1024.
- rm -rf ~/.insrc/lance && re-add repos.

Next steps:

EOF
else
	cat <<EOF
Embedder: Ollama (at $OLLAMA_HOST_URL).

If Ollama's embedding model isn't installed yet, pull it once:

ollama pull qwen3-embedding:0.6b     # ~700 MB
ollama pull qwen3-coder:latest       # ~10 GB (optional; used by the indexer's summariser)

To switch to embedded ONNX later (no Ollama needed):
- Update ~/.insrc/config.json embeddingModel to 'nomic-ai/nomic-embed-text-v1.5' and embeddingDim to 768.
- rm -rf ~/.insrc/lance && re-add repos.

Next steps:

EOF
fi

cat <<EOF
1. Register the MCP tool with your CLI clients — ONCE, at user / global
   scope. Repo resolution is session-aware (the server matches its working
   directory against your registered repos), so a single global registration
   serves every repo and every concurrent session — no INSRC_REPO pin, no
   per-repo config:

claude mcp add insrc --scope user -- /bin/bash "$INSTALL_ROOT/scripts/insrc-mcp"

codex mcp add insrc -- /bin/bash "$INSTALL_ROOT/scripts/insrc-mcp"

2. Add repos + manage the daemon in the interactive TUI:

$INSTALL_ROOT/scripts/insrc          # full-screen dashboard (needs a terminal / TTY)

   Optionally put it on PATH so you can just run 'insrc':
   ln -s $INSTALL_ROOT/scripts/insrc /usr/local/bin/insrc

   In the TUI: 1-4 / Tab switch panes, q quits, ':' opens a command bar.
   - Repos pane   : press 'a' to register a repo for indexing.
   - Daemon pane  : start / stop / restart / update / backup / compact.
   - Command bar  : type e.g. 'repo add <path>', 'daemon restart',
                    'config list', 'config set <key> <value>'.

   Headless equivalents (for scripts / CI):
   $CTL status         # health check over the socket
   $CTL restart        # graceful restart
   $CTL update         # sync origin, install unless already installed, build

3. Full usage doc:

$INSTALL_ROOT/docs/daemon.md

EOF

exit 0
