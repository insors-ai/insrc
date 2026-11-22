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
EXISTING_MAC_MANAGED_SOURCE=0
SOURCE_REFERENCE_ROOT=''
# Filled by release packaging with the verifier and independently provisioned public key.
INSRC_RELEASE_BOOTSTRAP_B64=''
INSRC_NODE_BOOTSTRAP_B64='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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
INSRC_NODE_BOOTSTRAP_SHA256='9e09fca2593557143c5fbdb818406316da4d5dda7f1472353717b764f6786dfd'
PRINT_RUNTIME=0
PRINT_SOURCE_ROUTE=0
RUNTIME_ARCHIVE=''
MIGRATE_RUNTIME=0
PREDECESSOR_COMMIT=''
REBUILD_PREDECESSOR=0
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
		printf '%s' "$INSRC_RELEASE_BOOTSTRAP_B64" | "$NODE_BIN" --input-type=commonjs -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], Buffer.from(fs.readFileSync(0,"utf8"),"base64"), {flag:"wx",mode:0o600});' "$1"
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
		--print-source-route) PRINT_SOURCE_ROUTE=1 ;;
		--migrate-runtime) MIGRATE_RUNTIME=1 ;;
		--predecessor) shift; PREDECESSOR_COMMIT="${1:-}"; [ -n "$PREDECESSOR_COMMIT" ] || die '--predecessor requires the exact last-known-good commit' ;;
		--rebuild-predecessor) REBUILD_PREDECESSOR=1 ;;
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
[ "$PRINT_SOURCE_ROUTE" -eq 0 ] || RUNTIME_MODE=bootstrap
insrc_source_toolchain "$RUNTIME_TOOLS" "$HOME/.insrc" "$RUNTIME_ARCHIVE" "$RUNTIME_MODE" || die "verified local Node toolchain is unavailable" 2
if [ "$PRINT_RUNTIME" -eq 1 ]; then printf '%s\n' "$NODE_BIN"; exit 0; fi
if [ "$PRINT_SOURCE_ROUTE" -eq 1 ]; then
  . "$RUNTIME_TOOLS/source-selection-env.sh"
  insrc_print_source_route "$HOME/.insrc" "$INSTALL_ROOT"
  exit $?
fi

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
			if "$NODE_BIN" -e 'const fs=require("fs");process.exit(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).installedBundle===undefined?1:0)' "$HOME/.insrc/managed-lifecycle/journal.json"; then
			UPDATE_ARGS=(update)
			if [ "$EXPLICIT_REPO" -eq 1 ]; then UPDATE_ARGS+=(--repo-url "$REPO_URL"); fi
			if [ "$EXPLICIT_BRANCH" -eq 1 ]; then UPDATE_ARGS+=(--branch "$BRANCH"); fi
			cd /
			cleanup_install
			INSRC_DAEMON_UPDATE_WAIT=1 INSRC_DAEMON_ROOT="$INSTALL_ROOT" exec "$INSTALL_ROOT/scripts/daemon-ctl.sh" "${UPDATE_ARGS[@]}"
			fi
			EXISTING_MAC_MANAGED_SOURCE=1
			SOURCE_REFERENCE_ROOT=$("$NODE_BIN" -e 'const f=require("fs"),p=process.argv[1],s=f.lstatSync(p);if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o077)||s.size>65536)throw Error("unsafe managed descriptor");const v=JSON.parse(f.readFileSync(p));if(typeof v.releaseRoot!=="string"||f.realpathSync(v.releaseRoot)!==v.releaseRoot)throw Error("invalid managed source root");process.stdout.write(v.releaseRoot)' "$HOME/.insrc/managed-lifecycle/installation.json")
		fi
	fi
	if [ -z "$SOURCE_REFERENCE_ROOT" ]; then SOURCE_REFERENCE_ROOT="$INSTALL_ROOT"; fi
	[ -d "$SOURCE_REFERENCE_ROOT/.git" ] || die "existing target is neither a legacy checkout nor a managed source launcher" 3
	confirm "stage a verified macOS daemon upgrade" || die "user declined" 1
	if [ "$EXPLICIT_REPO" -eq 0 ]; then
		REPO_URL=$(git -C "$SOURCE_REFERENCE_ROOT" remote get-url origin)
		CONFIG_REPO=$("$NODE_BIN" -e 'try {const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(c.daemonUpdate?.repoUrl ?? "");}catch(e){if(e.code!=="ENOENT")throw e;}' "$HOME/.insrc/config.json")
		if [ -n "$CONFIG_REPO" ]; then REPO_URL="$CONFIG_REPO"; fi
	fi
	if [ "$EXPLICIT_BRANCH" -eq 0 ]; then
		BRANCH=$(git -C "$SOURCE_REFERENCE_ROOT" config --get insrc.releaseBranch || git -C "$SOURCE_REFERENCE_ROOT" symbolic-ref --short HEAD)
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
	if [ "$EXISTING_MAC_MANAGED_SOURCE" -eq 1 ]; then
		mkdir -m 700 "$BRIDGE/qualified"
		MAC_VERIFIER="$HOME/.insrc/managed-lifecycle/release-verifier.mjs"
		"$NODE_BIN" -e 'const f=require("fs"),s=f.lstatSync(process.argv[1]);if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o077)||s.size>1048576)throw Error("unsafe installed managed verifier")' "$MAC_VERIFIER" || die 'the existing macOS source issuer verifier is unavailable; retain the installation and obtain matching release material' 4
		"$NODE_BIN" "$MAC_VERIFIER" qualification "$BRIDGE/qualified" "$HOME/.insrc" "$REPO_URL" "$BRANCH" > "$BRIDGE/qualified.json" || die 'installed macOS source authority rejected this release' 4
		chmod 600 "$BRIDGE/qualified.json"
		MAC_PRIOR=$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).releaseId)' "$HOME/.insrc/managed-lifecycle/installation.json")
		"$NODE_BIN" "$BRIDGE/verifier.mjs" admit-macos-catalog "$BRIDGE/qualified.json" "$MAC_PRIOR" managed >/dev/null || die 'macOS source compatibility/profile was not qualified before candidate npm' 4
		"$NODE_BIN" "$MAC_VERIFIER" authorize "$BRIDGE" "$HOME/.insrc" "$REPO_URL" "$BRANCH" || die 'installed macOS source authority rejected the controller checkout' 4
		"$NODE_BIN" -e 'const f=require("fs"),u=require("util");if(!u.isDeepStrictEqual(JSON.parse(f.readFileSync(process.argv[1])).receipt,JSON.parse(f.readFileSync(process.argv[2]))))throw Error("source changed before controller build")' "$BRIDGE/qualified.json" "$BRIDGE/source-release.json" || die 'macOS source authorization changed before candidate npm' 4
	else
	(
		unset NODE_OPTIONS NODE_PATH
		"$NODE_BIN" "$BRIDGE/verifier.mjs" authorize "$BRIDGE" "$HOME/.insrc" "$REPO_URL" "$BRANCH"
	) || die "macOS upgrade bridge authorization failed" 4
	fi
	( cd "$BRIDGE/checkout" && CXXFLAGS="${CXXFLAGS:+$CXXFLAGS }-std=c++17" "$NODE_BIN" "$NPM_CLI" ci --no-fund --no-audit && "$NODE_BIN" "$NPM_CLI" run --silent build )
	[ -f "$BRIDGE/checkout/out/bin/insrc-daemon-control.js" ] || die "selected branch has no macOS upgrade bridge" 4
	INSTALL_ROOT=$(cd "$INSTALL_ROOT" && pwd -P)
	cd /
	if [ "$EXISTING_MAC_MANAGED_SOURCE" -eq 1 ]; then
		INSRC_DAEMON_UPDATE_REPO_URL="$REPO_URL" INSRC_DAEMON_UPDATE_BRANCH="$BRANCH" "$NODE_BIN" "$BRIDGE/checkout/out/bin/insrc-daemon-control.js" update-local || die 'current macOS controller could not commit the managed source update' 4
		ok 'managed macOS source update completed through its existing owner'
		exit 0
	fi
	# The controller owns bridge cleanup after exec; bootstrap assets are no longer needed.
	[ -z "$RUNTIME_ASSET_STAGE" ] || /bin/rm -rf "$RUNTIME_ASSET_STAGE"
	RUNTIME_ASSET_STAGE=''
	# No old checkout shell remains during the fence census.
	unset NODE_OPTIONS NODE_PATH
	exec "$NODE_BIN" "$BRIDGE/checkout/out/bin/insrc-daemon-control.js" prepare-legacy-upgrade "$INSTALL_ROOT" "$REPO_URL" "$BRANCH" "$BRIDGE"
fi

if [ "$(uname -s)" = Linux ] && [ -e "$INSTALL_ROOT" ]; then
 [ -d "$INSTALL_ROOT" ] && [ ! -L "$INSTALL_ROOT" ] || die 'existing source target must be a canonical directory' 3
 [ -n "$INSRC_RELEASE_BOOTSTRAP_B64" ] || die 'existing-target upgrades require the current authenticated release installer; the raw source template has no release signing authority' 4
 INSTALL_ROOT=$(cd "$INSTALL_ROOT" && pwd -P)
 BRIDGE=$(mktemp -d "${TMPDIR:-/tmp}/insrc-source-upgrade-XXXXXXXX"); chmod 700 "$BRIDGE"
 mkdir -m 700 "$BRIDGE/head-current" "$BRIDGE/authority"
 write_release_verifier "$BRIDGE/verifier.mjs"
 "$NODE_BIN" "$BRIDGE/verifier.mjs" installation "$HOME/.insrc" "$INSTALL_ROOT" > "$BRIDGE/installation.json" || die 'source installation identity is unavailable; retain the existing installation and repair its qualified records' 4
 if [ "$EXPLICIT_REPO" -eq 0 ]; then
  REPO_URL=$("$NODE_BIN" -e 'const fs=require("fs"),s=JSON.parse(fs.readFileSync(process.argv[1])).state;const r=s.active?.candidate??s.selected??s.outcome?.legacyRoute?.candidate;process.stdout.write(r?.source.channel.repoUrl??"")' "$BRIDGE/installation.json")
  if [ -z "$REPO_URL" ]; then REPO_URL=$(git -C "$INSTALL_ROOT" remote get-url origin); fi
 fi
 if [ "$EXPLICIT_BRANCH" -eq 0 ]; then
  BRANCH=$("$NODE_BIN" -e 'const fs=require("fs"),s=JSON.parse(fs.readFileSync(process.argv[1])).state;const r=s.active?.candidate??s.selected??s.outcome?.legacyRoute?.candidate;process.stdout.write(r?.source.channel.branch??"")' "$BRIDGE/installation.json")
  if [ -z "$BRANCH" ]; then BRANCH=$(git -C "$INSTALL_ROOT" symbolic-ref --short HEAD); fi
 fi
 if [ -z "$PREDECESSOR_COMMIT" ]; then
  PREDECESSOR_COMMIT=$("$NODE_BIN" -e 'const fs=require("fs"),s=JSON.parse(fs.readFileSync(process.argv[1])).state;process.stdout.write(s.active?.execution?.compatibility.prior.releaseId??s.selected?.pin.commit??s.outcome?.legacyRoute?.prior?.commit??"")' "$BRIDGE/installation.json")
 fi
 [ -n "$PREDECESSOR_COMMIT" ] || die 'historical build identity is unproven: inspect the last successful release, then rerun this authenticated installer with --migrate-runtime --predecessor FULL_COMMIT --rebuild-predecessor; source HEAD alone is not proof' 4
 PROFILE=$("$NODE_BIN" -e 'const fs=require("fs"),r=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write((r.state.active?.wasRunning??r.running)?"linux-source-running":"linux-source-stopped")' "$BRIDGE/installation.json")
 PRIOR_RUNTIME=$("$NODE_BIN" -e 'const fs=require("fs"),r=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write(r.state.selected?.pin.runtime??r.state.outcome?.legacyRoute?.prior?.runtime??"unknown")' "$BRIDGE/installation.json")
 if [ "$PRIOR_RUNTIME" = unknown ] && [ -f "$HOME/.insrc/daemon-node" ] && [ ! -L "$HOME/.insrc/daemon-node" ]; then
  PRIOR_RUNTIME=$("$NODE_BIN" -e 'const fs=require("fs"),p=process.argv[1],s=fs.lstatSync(p);if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||s.size>4096||(s.mode&0o022))throw Error("unsafe legacy runtime marker");const t=fs.readFileSync(p,"utf8").trim();try{process.stdout.write(fs.realpathSync(t))}catch{process.stdout.write("unknown")}' "$HOME/.insrc/daemon-node")
 fi
 # Existing issuer authority must independently agree before current candidate code/npm runs.
 # Keep its verifier unchanged; the delivered package supplies current staging implementation.
 RETAINED_VERIFIER="$HOME/.insrc/source-lifecycle/verifier.mjs"
 STAGE_TARGET="linux-$("$NODE_BIN" -p 'process.arch')"
 "$NODE_BIN" "$BRIDGE/verifier.mjs" head "$BRIDGE/head-current" "$HOME/.insrc" "$REPO_URL" "$BRANCH" "--target=$STAGE_TARGET" > "$BRIDGE/head-current.json" || die 'current source head could not be authenticated' 4
 if [ -e "$RETAINED_VERIFIER" ] || [ -L "$RETAINED_VERIFIER" ]; then
  mkdir -m 700 "$BRIDGE/head-retained" "$BRIDGE/qualified-retained" "$BRIDGE/qualified-current"
  "$NODE_BIN" --input-type=commonjs -e 'const fs=require("fs"),s=fs.lstatSync(process.argv[1]);if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o077)||s.size>1048576)throw Error("unsafe retained verifier")' "$RETAINED_VERIFIER"
  "$NODE_BIN" "$RETAINED_VERIFIER" head "$BRIDGE/head-retained" "$HOME/.insrc" "$REPO_URL" "$BRANCH" "--target=$STAGE_TARGET" > "$BRIDGE/head-retained.json" || die 'the installed issuer did not authorize this source head; retain its authority and obtain matching release material' 4
  "$NODE_BIN" --input-type=commonjs -e 'const fs=require("fs"),u=require("util"),a=JSON.parse(fs.readFileSync(process.argv[1])),b=JSON.parse(fs.readFileSync(process.argv[2]));if(!u.isDeepStrictEqual(a,b))throw Error("independent and installed source authorities disagree")' "$BRIDGE/head-current.json" "$BRIDGE/head-retained.json" || die 'source authority changed during head verification' 4
 fi
 ALREADY_CURRENT=$("$NODE_BIN" -e 'const fs=require("fs"),s=JSON.parse(fs.readFileSync(process.argv[1])).state,h=JSON.parse(fs.readFileSync(process.argv[2])).receipt,r=s.selected;process.stdout.write(!s.active&&r&&r.pin.commit===h.commit&&r.source.tree===h.tree&&require("util").isDeepStrictEqual(r.source.channel,h.channel)?"yes":"no")' "$BRIDGE/installation.json" "$BRIDGE/head-current.json")
 if [ "$ALREADY_CURRENT" = yes ]; then
  "$NODE_BIN" "$BRIDGE/verifier.mjs" resolve "$HOME/.insrc" "$INSTALL_ROOT" > "$BRIDGE/resolved.json" || die 'selected compiled source or owned runtime failed independent verification' 4
  CURRENT_ROOT=$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).manager.root)' "$BRIDGE/resolved.json")
  CURRENT_NODE=$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).manager.runtime)' "$BRIDGE/resolved.json")
  [ -f "$RETAINED_VERIFIER" ] || die 'selected source lacks its independent issuer verifier; recover with matching authenticated release material' 4
  PATH="$(dirname "$CURRENT_NODE"):$PATH" "$CURRENT_NODE" "$CURRENT_ROOT/out/bin/insrc-source-control.js" unchanged "$HOME/.insrc" "$INSTALL_ROOT" "$RETAINED_VERIFIER" || die 'current selected source could not be independently verified' 4
  if [ "$START_AFTER_INSTALL" -eq 1 ]; then
   PATH="$(dirname "$CURRENT_NODE"):$PATH" "$CURRENT_NODE" "$CURRENT_ROOT/out/bin/insrc-source-control.js" start "$HOME/.insrc" "$INSTALL_ROOT" || die 'selected source startup was withheld; inspect its durable outcome' 4
  fi
  ok 'authenticated source is already selected; startup policy applied'
  exit 0
 fi
 log 'staging authenticated source with the verified local Node/npm toolchain'
 if [ -f "$RETAINED_VERIFIER" ]; then
  "$NODE_BIN" "$RETAINED_VERIFIER" qualification "$BRIDGE/qualified-retained" "$HOME/.insrc" "$REPO_URL" "$BRANCH" "--target=$STAGE_TARGET" "--prior=$PREDECESSOR_COMMIT" "--profile=$PROFILE" > "$BRIDGE/qualified-retained.json" || die 'installed issuer rejected the predecessor/profile before candidate npm' 4
  "$NODE_BIN" "$BRIDGE/verifier.mjs" qualification "$BRIDGE/qualified-current" "$HOME/.insrc" "$REPO_URL" "$BRANCH" "--target=$STAGE_TARGET" "--prior=$PREDECESSOR_COMMIT" "--profile=$PROFILE" > "$BRIDGE/qualified-current.json" || die 'current delivered verifier rejected the predecessor/profile' 4
  "$NODE_BIN" --input-type=commonjs -e 'const fs=require("fs"),u=require("util");if(!u.isDeepStrictEqual(JSON.parse(fs.readFileSync(process.argv[1])),JSON.parse(fs.readFileSync(process.argv[2]))))throw Error("source qualification changed")' "$BRIDGE/qualified-current.json" "$BRIDGE/qualified-retained.json" || die 'source qualification changed before staging' 4
 fi
 "$NODE_BIN" "$BRIDGE/verifier.mjs" stage "$BRIDGE/authority" "$HOME/.insrc" "$REPO_URL" "$BRANCH" \
  "--target=$STAGE_TARGET" "--prior=$PREDECESSOR_COMMIT" "--profile=$PROFILE" > "$BRIDGE/staged.json" || die 'independent source staging failed; incumbent files and process were retained' 4
 chmod 600 "$BRIDGE/staged.json"
 STAGED_ROOT=$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).candidate.pin.root)' "$BRIDGE/staged.json")
 STAGED_NODE=$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).candidate.pin.runtime)' "$BRIDGE/staged.json")
 [ -f "$STAGED_ROOT/out/bin/insrc-source-control.js" ] || die 'authenticated source does not contain the Linux source controller' 4
 # The independently delivered verifier is retained outside candidate source for subsequent updates.
 "$NODE_BIN" --input-type=commonjs -e 'const fs=require("fs"),p=process.argv[1],source=fs.readFileSync(process.argv[2]);fs.mkdirSync(require("path").dirname(p),{recursive:true,mode:0o700});try{fs.writeFileSync(p,source,{flag:"wx",mode:0o600});const f=fs.openSync(p,"r");try{fs.fsyncSync(f)}finally{fs.closeSync(f)}const d=fs.openSync(require("path").dirname(p),"r");try{fs.fsyncSync(d)}finally{fs.closeSync(d)}}catch(e){if(e.code!=="EEXIST")throw e;const s=fs.lstatSync(p);if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o077))throw Error("unsafe retained verifier");}' "$RETAINED_VERIFIER" "$BRIDGE/verifier.mjs"
 UPGRADE_ARGS=(upgrade "$HOME/.insrc" "$INSTALL_ROOT" "$BRIDGE/staged.json" "$RETAINED_VERIFIER" "$PRIOR_RUNTIME")
 if [ "$REBUILD_PREDECESSOR" -eq 1 ]; then UPGRADE_ARGS+=(--rebuild-predecessor); fi
 PATH="$(dirname "$STAGED_NODE"):$PATH" "$STAGED_NODE" "$STAGED_ROOT/out/bin/insrc-source-control.js" "${UPGRADE_ARGS[@]}" || die 'source cutover was withheld or restored; retain the reported state. An unmanaged running predecessor must first be stopped through its existing owner before retrying this current installer' 4
 if [ "$START_AFTER_INSTALL" -eq 1 ]; then
  PATH="$(dirname "$STAGED_NODE"):$PATH" "$STAGED_NODE" "$STAGED_ROOT/out/bin/insrc-source-control.js" start "$HOME/.insrc" "$INSTALL_ROOT" || die 'source installation selected but start failed; inspect the durable source outcome' 4
 fi
 ok "qualified source selected at $STAGED_ROOT"
 exit 0
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
