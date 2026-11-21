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
INSRC_NODE_BOOTSTRAP_SHA256='687c96a3d6f38d970eb39296f40ebbdf5858167673c671b67e09671d7745cb16'
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
