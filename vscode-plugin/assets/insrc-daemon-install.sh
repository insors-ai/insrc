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
INSRC_NODE_BOOTSTRAP_SHA256='62e9c2541de0413af60a5feb06bb5a1ac6f297460b0bdf44adad9d004cad76b8'
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
