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
INSRC_NODE_BOOTSTRAP_SHA256='c34f140268b19f6dd23bd32c5d9d6b59baec5330b94856770e5368ac8db0b688'
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
