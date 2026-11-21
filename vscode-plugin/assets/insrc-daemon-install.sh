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
INSRC_NODE_BOOTSTRAP_B64='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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
INSRC_NODE_BOOTSTRAP_SHA256='7953f4631f1808a662ab160e705084f1da453e5fde864cda48ca831cbef82a8c'
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
