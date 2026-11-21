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
INSRC_NODE_BOOTSTRAP_B64='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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
INSRC_NODE_BOOTSTRAP_SHA256='eb312cc53a1ba814890d5c131a6b89bb1eb00e525ffab81743e4ca4d2b840ed5'
PRINT_RUNTIME=0
RUNTIME_ARCHIVE=''
RUNTIME_ASSET_STAGE=''
BRIDGE=''
cleanup_install() {
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
insrc_source_toolchain "$RUNTIME_TOOLS" "$HOME/.insrc" "$RUNTIME_ARCHIVE" || die "verified local Node toolchain is unavailable" 2
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
	# The controller owns cleanup after exec, so no old checkout shell remains during the fence census.
	unset NODE_OPTIONS NODE_PATH
	exec "$NODE_BIN" "$BRIDGE/checkout/out/bin/insrc-daemon-control.js" prepare-legacy-upgrade "$INSTALL_ROOT" "$REPO_URL" "$BRANCH" "$BRIDGE"
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
