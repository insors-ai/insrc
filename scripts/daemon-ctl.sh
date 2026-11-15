#!/usr/bin/env bash
#
# Control script for the insrc daemon installed at ~/.insrc/daemon.
#
# The daemon lives in a git checkout of insors-ai/insrc at ~/.insrc/daemon
# (repo root carries package.json + src/ + out/ directly). This script
# targets ~/.insrc/daemon regardless of where it is invoked from.
#
# Since the CLI became a full-screen interactive TUI (no `insrc daemon
# start/stop/status` subcommands), this script controls the daemon
# process through shared lifecycle helpers: it spawns the compiled entry,
# requests a graceful drain over IPC, and queries `daemon.status` over the Unix socket.
# The same operations are also available interactively in the TUI's
# Daemon pane (start / stop / restart / update).
#
# Usage:
#   scripts/daemon-ctl.sh start      # sync origin, install unless already installed, build, start
#   scripts/daemon-ctl.sh stop       # graceful stop (IPC + retained process wait); a daemon
#                                    # that outlives the wait is killed
#   scripts/daemon-ctl.sh restart    # stop then start
#   scripts/daemon-ctl.sh update     # sync + install + build (no start)
#   scripts/daemon-ctl.sh status     # daemon status over the socket
#   scripts/daemon-ctl.sh recover    # reconcile a verified stopped managed reservation
#   scripts/daemon-ctl.sh --help
#
# Flags:
#   --skip-sync       skip the git fetch / merge step
#   --skip-install    skip npm install even when one is due
#   --skip-build      skip the tsc build step
#   --branch <name>   sync against a branch other than the current one (switches to it)
#   --repo-url <url>  point origin at this git URL before the fetch (deploy a fork)
#
# Exit codes:
#   0 success
#   1 usage error
#   2 daemon dir missing / not a git checkout
#   3 git in an unclean state (uncommitted work / diverged)
#   4 install / build / start failed
#
# Log path: /tmp/insrc/daemon-ctl-YYYYMMDD-HHMMSS-<pid>.log
#
# Node resolution: GUI-launched callers (the VS Code extension host, JetBrains)
# run with a PATH that may not contain node, so the script never relies on a
# bare `node` lookup. INSRC_NODE_BIN wins; otherwise a node on PATH; otherwise
# the well-known install locations (overridable for tests via
# INSRC_NODE_LOCATIONS, a colon-separated list that replaces them); otherwise
# the runtime recorded at install time (~/.insrc/daemon-node). Failing all of
# those is a usage-class error.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DAEMON_ROOT="${INSRC_DAEMON_ROOT:-$HOME/.insrc/daemon}"
NODE_BIN_FILE="$HOME/.insrc/daemon-node"

# Absolutize with shell builtins only (the GUI PATH may lack coreutils):
# spawn_daemon cds to DAEMON_ROOT before executing, so a relative NODE_BIN
# would resolve against the wrong directory there.
abspath() {
	local p="$1"
	case "$p" in
		/*) printf '%s\n' "$p" ;;
		*)  printf '%s/%s\n' "$PWD" "$p" ;;
	esac
}

resolve_node() {
	if [ -n "${INSRC_NODE_BIN:-}" ]; then
		if [ -x "$INSRC_NODE_BIN" ]; then abspath "$INSRC_NODE_BIN"; return 0; fi
		return 1
	fi
	if [ -x "$DAEMON_ROOT/tools/node" ]; then abspath "$DAEMON_ROOT/tools/node"; return 0; fi
	if command -v node >/dev/null 2>&1; then abspath "$(command -v node)"; return 0; fi
	local dir
	if [ -n "${INSRC_NODE_LOCATIONS+x}" ]; then
		# Test seam: an explicit (possibly empty) colon-separated list REPLACES
		# the built-in well-known locations, so tests run hermetically.
		local IFS=:
		for dir in $INSRC_NODE_LOCATIONS; do
			[ -n "$dir" ] || continue
			if [ -x "$dir/node" ]; then abspath "$dir/node"; return 0; fi
		done
	else
		for dir in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin "$DAEMON_ROOT/node_modules/.bin"; do
			if [ -x "$dir/node" ]; then abspath "$dir/node"; return 0; fi
		done
	fi
	if [ -f "$NODE_BIN_FILE" ]; then
		# Trim leading/trailing whitespace only (shell builtins, no coreutils):
		# internal spaces are significant in paths like "/Applications/Node Tools/bin/node".
		local recorded line
		recorded=""
		while IFS= read -r line || [ -n "$line" ]; do
			recorded="$recorded$line"
		done < "$NODE_BIN_FILE"
		# trim leading whitespace
		while [ -n "$recorded" ]; do
			case "$recorded" in
				[[:space:]]*) recorded="${recorded#?}" ;;
				*) break ;;
			esac
		done
		# trim trailing whitespace
		while [ -n "$recorded" ]; do
			case "$recorded" in
				*[[:space:]]) recorded="${recorded%?}" ;;
				*) break ;;
			esac
		done
		if [ -n "$recorded" ] && [ -x "$recorded" ]; then abspath "$recorded"; return 0; fi
	fi
	return 1
}

NODE_BIN="$(resolve_node)" || { echo "node not found: set INSRC_NODE_BIN or install Node.js >= 20 (https://nodejs.org/)" >&2; exit 2; }
DAEMON_SRC="$DAEMON_ROOT"                         # npm install / build run at the repo root
DAEMON_ENTRY="$DAEMON_ROOT/out/daemon/index.js"   # compiled daemon entry
PID_FILE="$HOME/.insrc/daemon.pid"
SOCK_FILE="$HOME/.insrc/daemon.sock"
DAEMON_LOG_DIR="/tmp/.insrc"
DAEMON_LOG="$DAEMON_LOG_DIR/daemon.log"
LOG_DIR="${INSRC_CTL_LOG_DIR:-/tmp/insrc}"
mkdir -p "$LOG_DIR" "$DAEMON_LOG_DIR"
LOG_FILE="$LOG_DIR/daemon-ctl-$(date +%Y%m%d-%H%M%S)-$$.log"
# How long a stop waits for the daemon to drain before it is killed.
# The override exists for the tests; leave it alone otherwise.
STOP_WAIT_SECS="${INSRC_CTL_STOP_WAIT_SECS:-30}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit "${2:-1}"; }

require_daemon_dir() {
	[ -d "$DAEMON_ROOT/.git"         ] || die "not a git checkout: $DAEMON_ROOT" 2
	[ -f "$DAEMON_ROOT/package.json" ] || die "missing package.json at $DAEMON_ROOT" 2
	[ -d "$DAEMON_ROOT/src"          ] || die "missing src/ tree at $DAEMON_ROOT" 2
}

usage() {
	sed -n '3,35p' "$0" | sed 's/^# \{0,1\}//'
	exit 1
}

# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

sync_repo() {
	local branch="$1"
	local current_branch
	current_branch=$(git -C "$DAEMON_ROOT" rev-parse --abbrev-ref HEAD)

	# `npm install` rewrites package-lock.json; the install mirrors
	# origin exactly, so discard that churn before the cleanliness check
	# (otherwise every post-install update would refuse as "dirty").
	git -C "$DAEMON_ROOT" checkout -- package-lock.json 2>/dev/null || true

	# A dirty tree is refused BEFORE origin is touched.
	if ! git -C "$DAEMON_ROOT" diff --quiet || ! git -C "$DAEMON_ROOT" diff --cached --quiet; then
		die "$DAEMON_ROOT has uncommitted local changes; refusing to overwrite" 3
	fi

	local previous_origin
	previous_origin=$(git -C "$DAEMON_ROOT" remote get-url origin 2>/dev/null || true)
	if [ -n "$REPO_URL" ] && [ "$previous_origin" != "$REPO_URL" ]; then
		log "pointing origin at $REPO_URL"
		git -C "$DAEMON_ROOT" remote set-url origin "$REPO_URL"
	fi

	log "syncing $DAEMON_ROOT against origin/$branch"
	# An explicit refspec: the install is a single-branch clone, so a plain
	# `fetch origin <branch>` of any other branch would not create origin/<branch>.
	if ! git -C "$DAEMON_ROOT" fetch --quiet origin "+refs/heads/$branch:refs/remotes/origin/$branch"; then
		# a URL that cannot be fetched from must not stay as origin: an unset --repo-url keeps origin as it is
		if [ -n "$REPO_URL" ] && [ "$previous_origin" != "$REPO_URL" ] && [ -n "$previous_origin" ]; then
			if git -C "$DAEMON_ROOT" remote set-url origin "$previous_origin"; then
				log "fetch from $REPO_URL failed; origin restored to $previous_origin"
			else
				log "fetch from $REPO_URL failed; origin could NOT be restored to $previous_origin: run git remote set-url origin by hand"
			fi
		fi
		die "git fetch origin $branch failed" 4
	fi

	local current incoming
	current=$(git -C "$DAEMON_ROOT" rev-parse HEAD)
	incoming=$(git -C "$DAEMON_ROOT" rev-parse "origin/$branch")

	if [ "$branch" != "$current_branch" ]; then
		# Switching branch: never discard commits that exist only here.
		if [ -z "$(git -C "$DAEMON_ROOT" branch -r --contains HEAD 2>/dev/null)" ]; then
			die "$DAEMON_ROOT/HEAD has commits no remote branch has; refusing to switch to $branch" 3
		fi
		# ... nor commits that exist only on an existing local branch of that name (checkout -B resets it).
		if git -C "$DAEMON_ROOT" show-ref --verify --quiet "refs/heads/$branch" \
			&& ! git -C "$DAEMON_ROOT" merge-base --is-ancestor "refs/heads/$branch" "$incoming"; then
			die "local branch $branch has commits origin/$branch does not; refusing to reset it" 3
		fi
		log "switching branch: $current_branch -> $branch (${incoming:0:8})"
		git -C "$DAEMON_ROOT" checkout --quiet -B "$branch" "origin/$branch" >>"$LOG_FILE" 2>&1 || die "git checkout $branch failed (see $LOG_FILE)" 4
		return 0
	fi

	if [ "$current" = "$incoming" ]; then
		log "already at ${incoming:0:8} (no-op)"
		return 0
	fi
	if ! git -C "$DAEMON_ROOT" merge-base --is-ancestor "$current" "$incoming"; then
		die "$DAEMON_ROOT/HEAD has diverged from origin/$branch; resolve manually" 3
	fi
	log "fast-forward: ${current:0:8} -> ${incoming:0:8}"
	git -C "$DAEMON_ROOT" merge --ff-only "$incoming" >>"$LOG_FILE" 2>&1
}

# The install marker (ISSUE-ca9883ca): the git blob hash of the package-lock.json
# the last SUCCESSFUL npm install ran from. Removed before an install, written
# only after npm exits 0, so a failed or interrupted install is retried. Same
# file and content as INSTALL_MARKER in src/cli/services/maintenance.ts.
INSTALL_MARKER="$DAEMON_SRC/node_modules/.insrc-install-ok"
# The C++ standard every daemon npm install asks for (NATIVE_CXX_STD in
# maintenance.ts): fs-ext sets none and does not build on the Node 22.22.1 headers.
NATIVE_CXX_STD="-std=c++17"

npm_install_if_needed() {
	local lock_hash marker=""
	# Empty when there is no lockfile: never matches, and writes no marker.
	lock_hash=$(git -C "$DAEMON_ROOT" hash-object package-lock.json 2>/dev/null || echo "")
	[ -f "$INSTALL_MARKER" ] && marker=$(tr -d '[:space:]' < "$INSTALL_MARKER")
	if [ -n "$lock_hash" ] && [ "$marker" = "$lock_hash" ]; then
		log "npm install: the install marker matches package-lock.json; skipping"
		return 0
	fi
	log "npm install ($DAEMON_SRC)"
	rm -f "$INSTALL_MARKER"
	( cd "$DAEMON_SRC" && CXXFLAGS="${CXXFLAGS:+$CXXFLAGS }$NATIVE_CXX_STD" npm install ) >>"$LOG_FILE" 2>&1 || die "npm install failed (see $LOG_FILE)" 4
	if [ -n "$lock_hash" ]; then
		{ mkdir -p "$(dirname "$INSTALL_MARKER")" && printf '%s\n' "$lock_hash" > "$INSTALL_MARKER"; } 2>>"$LOG_FILE" \
			|| die "npm install succeeded but the install marker could not be written: $INSTALL_MARKER" 4
	fi
}

npm_build() {
	log "npm run build ($DAEMON_SRC)"
	( cd "$DAEMON_SRC" && npm run build ) >>"$LOG_FILE" 2>&1 || die "npm run build failed (see $LOG_FILE)" 4
}

# Spawn the compiled daemon detached, the same way the TUI's start
# action does: `node --import tsx/esm out/daemon/index.js`. The daemon
# writes its own pid file + socket and sets its own (file) log mode.
#
# Detachment is deliberate + complete: stdin from /dev/null, stdout +
# stderr to the log, and `disown` so this shell keeps NO file descriptor
# to the daemon and exits cleanly even when its own stdout is a pipe
# (e.g. the installer runs `daemon-ctl.sh start | tail`). Without the
# full detach the shell lingers holding the pipe, and the caller's
# reader never sees EOF -- the daemon comes up but the installer hangs.
# `cd`+`exec` keeps cwd = repo root so `--import tsx/esm` resolves tsx.
spawn_daemon() {
	[ -f "$DAEMON_ENTRY" ] || die "built daemon not found at $DAEMON_ENTRY -- run '$0 update' first" 4
	log "spawning daemon ($DAEMON_ENTRY)"
	( cd "$DAEMON_ROOT" && exec env INSRC_MODE=daemon "$NODE_BIN" --import tsx/esm "$DAEMON_ENTRY" >>"$DAEMON_LOG" 2>&1 </dev/null ) &
	disown 2>/dev/null || true
}

# One Node invocation captures the kernel process capability before the RPC and
# retains it through waiting, forced termination and ownership-guarded cleanup.
# Missing packaging and every lifecycle error fail closed, including callers in
# shell conditional contexts where errexit is disabled.
stop_managed_daemon() {
 local helper="$DAEMON_ROOT/out/bin/insrc-daemon-control.js"
 if [ ! -f "$helper" ]; then
  log "ERROR: lifecycle helper missing at $helper; rebuild before stop/restart"
  return 4
 fi
 local result
 if result=$("$NODE_BIN" "$helper" "$STOP_WAIT_SECS" 2>&1); then
  log "$result"
 else
  log "ERROR: $result"
  return 4
 fi
}

# Poll for the pid file + socket to appear AND the pid to be alive.
# 60 s window covers ONNX cold-boot. Prints the pid on success.
wait_for_daemon_ready() {
	local deadline=$(( $(date +%s) + 60 ))
	while [ "$(date +%s)" -lt "$deadline" ]; do
		if [ -f "$PID_FILE" ] && [ -S "$SOCK_FILE" ]; then
			local pid; pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
			if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then echo "$pid"; return 0; fi
		fi
		sleep 0.5
	done
	return 1
}

# Query daemon.status over the Unix socket via a small node client
# (the resolved $NODE_BIN, never a bare PATH lookup). Prints the JSON result or exits non-zero.
socket_status() {
	"$NODE_BIN" -e '
		const net = require("node:net");
		const sock = process.env.HOME + "/.insrc/daemon.sock";
		const s = net.createConnection(sock);
		let buf = "";
		s.on("connect", () => s.write(JSON.stringify({ id: 1, method: "daemon.status", params: {} }) + "\n"));
		s.on("data", d => {
			buf += d.toString();
			const nl = buf.indexOf("\n");
			if (nl < 0) return;
			try { const r = JSON.parse(buf.slice(0, nl)); console.log(JSON.stringify(r.result ?? { error: r.error }, null, 2)); } catch (e) { console.error(String(e)); process.exit(1); }
			s.end();
		});
		s.on("error", e => { console.error("daemon not reachable:", e.code || e.message); process.exit(1); });
	'
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

# Exit 10 is the bridge's explicit "unmanaged" result. Any other error is
# terminal so a stale managed installation can never fall back to spawning.
supervised_lifecycle() {
	[ "$(uname -s)" = "Darwin" ] || return 10
	local manifest="$HOME/.insrc/managed-lifecycle/installation.json"
	local journal="$HOME/.insrc/managed-lifecycle/journal.json"
	[ -e "$manifest" ] || [ -L "$manifest" ] || [ -e "$journal" ] || [ -L "$journal" ] || return 10
	local helper="$DAEMON_ROOT/out/bin/insrc-daemon-control.js" result rc
	[ -f "$helper" ] || { log "ERROR: managed lifecycle helper missing at $helper"; return 4; }
	if result=$("$NODE_BIN" "$helper" "$1" "$STOP_WAIT_SECS" 2>&1); then
		log "$result"
		return 0
	else
		rc=$?
		[ "$rc" -eq 10 ] && return 10
		log "ERROR: $result"
		return 4
	fi
}

prepare_daemon() {
	require_daemon_dir
	local branch="${BRANCH:-$(git -C "$DAEMON_ROOT" rev-parse --abbrev-ref HEAD)}"

	[ "$SKIP_SYNC"    -eq 1 ] || sync_repo "$branch"
	[ "$SKIP_INSTALL" -eq 1 ] || npm_install_if_needed
	[ "$SKIP_BUILD"   -eq 1 ] || npm_build
}

start_prepared_daemon() {
	spawn_daemon || return $?

	local pid
	if ! pid=$(wait_for_daemon_ready); then
		die "daemon did not become ready within 60 s (see $DAEMON_LOG)" 4
	fi
	log "daemon running (pid $pid, log $DAEMON_LOG)"
	log "ctl-log: $LOG_FILE"
}

cmd_start() {
	local rc
	if supervised_lifecycle start; then return 0; else rc=$?; fi
	[ "$rc" -eq 10 ] || return "$rc"
	prepare_daemon || return $?
	# Stop/clean through the retained-target contract even when paths look stale.
	stop_managed_daemon || return $?
	start_prepared_daemon
}

cmd_stop() {
	local rc
	if supervised_lifecycle stop; then return 0; else rc=$?; fi
	[ "$rc" -eq 10 ] || return "$rc"
	log "stopping daemon"
	stop_managed_daemon || return $?
}

cmd_restart() {
	local rc
	if supervised_lifecycle restart; then return 0; else rc=$?; fi
	[ "$rc" -eq 10 ] || return "$rc"
	log "stopping daemon"
	stop_managed_daemon || return $?
	prepare_daemon || return $?
	start_prepared_daemon
}

cmd_update() {
	local rc
	local operation=update
	if [ "${INSRC_DAEMON_UPDATE_WAIT:-0}" -eq 1 ] || [ -n "$BRANCH" ] || [ -n "$REPO_URL" ]; then operation=update-local; fi
	if INSRC_DAEMON_UPDATE_REPO_URL="$REPO_URL" INSRC_DAEMON_UPDATE_BRANCH="$BRANCH" supervised_lifecycle "$operation"; then return 0; else rc=$?; fi
	[ "$rc" -eq 10 ] || return "$rc"
	if [ "$(uname -s)" = Darwin ]; then
		local args=(--target "$DAEMON_ROOT" -y)
		if [ -n "$BRANCH" ]; then args+=(--branch "$BRANCH"); fi
		if [ -n "$REPO_URL" ]; then args+=(--repo "$REPO_URL"); fi
		cd /
		exec /bin/bash "$DAEMON_ROOT/scripts/insrc-daemon-install.sh" "${args[@]}"
	fi
	require_daemon_dir
	local branch="${BRANCH:-$(git -C "$DAEMON_ROOT" rev-parse --abbrev-ref HEAD)}"

	[ "$SKIP_SYNC"    -eq 1 ] || sync_repo "$branch"
	[ "$SKIP_INSTALL" -eq 1 ] || npm_install_if_needed
	[ "$SKIP_BUILD"   -eq 1 ] || npm_build
	log "update complete (daemon NOT restarted)"
}

cmd_status() {
	local rc
	if supervised_lifecycle status; then return 0; else rc=$?; fi
	[ "$rc" -eq 10 ] || return "$rc"
	require_daemon_dir
	log "daemon dir: $DAEMON_ROOT"
	log "branch:     $(git -C "$DAEMON_ROOT" rev-parse --abbrev-ref HEAD)"
	log "HEAD:       $(git -C "$DAEMON_ROOT" log --oneline -1)"
	socket_status 2>&1 | tee -a "$LOG_FILE"
}

cmd_recover() {
	local rc
	if supervised_lifecycle recover; then return 0; else rc=$?; fi
	[ "$rc" -ne 10 ] || die "no enabled managed installation"
	return "$rc"
}

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------

SKIP_SYNC=0
SKIP_INSTALL=0
SKIP_BUILD=0
BRANCH=""
REPO_URL=""
CMD=""

while [ $# -gt 0 ]; do
	case "$1" in
		start|stop|restart|update|status|recover) CMD="$1" ;;
		--skip-sync)    SKIP_SYNC=1 ;;
		--skip-install) SKIP_INSTALL=1 ;;
		--skip-build)   SKIP_BUILD=1 ;;
		--branch)       shift; BRANCH="${1:-}"; [ -n "$BRANCH" ] || die "--branch requires a value" ;;
		--repo-url)     shift; REPO_URL="${1:-}"; [ -n "$REPO_URL" ] || die "--repo-url requires a value"
		                case "$REPO_URL" in -*) die "--repo-url must not start with '-'" ;; esac ;;
		-h|--help)      usage ;;
		*)              die "unknown arg: $1 (see --help)" ;;
	esac
	shift
done

[ -n "$CMD" ] || usage

case "$CMD" in
	start)   cmd_start ;;
	stop)    cmd_stop ;;
	restart) cmd_restart ;;
	update)  cmd_update ;;
	status)  cmd_status ;;
	recover) cmd_recover ;;
esac
