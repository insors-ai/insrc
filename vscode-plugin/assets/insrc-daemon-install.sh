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
INSRC_NODE_BOOTSTRAP_SHA256='d748c332a5804a194ce19ccef9375bc12d5213451aa20ccd5cb40f46f9b44760'
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

claude mcp add insrc --scope user -- "$NODE_BIN" "$INSTALL_ROOT/out/bin/insrc-mcp.js"

codex mcp add insrc -- "$NODE_BIN" "$INSTALL_ROOT/out/bin/insrc-mcp.js"

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
