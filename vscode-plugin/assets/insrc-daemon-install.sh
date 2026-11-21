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
INSRC_NODE_BOOTSTRAP_SHA256='f4e0b56efce94a8773a370dd42e0caa11dc3b783bfc329893d1f70285c056ac8'
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
