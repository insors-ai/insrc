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
INSRC_NODE_BOOTSTRAP_SHA256='0c7b71969a6a5c76cfdd185d750f92fd99ce46f63f0d4f2d691f9c4ac1cbef80'
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
