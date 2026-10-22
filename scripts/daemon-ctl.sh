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
# process DIRECTLY: it spawns the compiled entry, SIGTERM's the pid for
# a graceful drain, and queries `daemon.status` over the Unix socket.
# The same operations are also available interactively in the TUI's
# Daemon pane (start / stop / restart / update).
#
# Usage:
#   scripts/daemon-ctl.sh start      # sync origin, install if lock changed, build, start
#   scripts/daemon-ctl.sh stop       # graceful stop (SIGTERM + drain wait); a daemon
#                                    # that outlives the wait is killed
#   scripts/daemon-ctl.sh restart    # stop then start
#   scripts/daemon-ctl.sh update     # sync + install + build (no start)
#   scripts/daemon-ctl.sh status     # daemon status over the socket
#   scripts/daemon-ctl.sh --help
#
# Flags:
#   --skip-sync       skip the git fetch / merge step
#   --skip-install    skip npm install even if the lock changed
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

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DAEMON_ROOT="${INSRC_DAEMON_ROOT:-$HOME/.insrc/daemon}"
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
			git -C "$DAEMON_ROOT" remote set-url origin "$previous_origin"
			log "fetch from $REPO_URL failed; origin restored to $previous_origin"
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
		log "switching branch: $current_branch -> $branch (${incoming:0:8})"
		git -C "$DAEMON_ROOT" checkout --quiet -B "$branch" "origin/$branch" >>"$LOG_FILE" 2>&1
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

npm_install_if_needed() {
	local lock_before="${SYNC_LOCK_HASH_BEFORE:-}"
	local lock_after
	lock_after=$(git -C "$DAEMON_ROOT" hash-object package-lock.json 2>/dev/null || echo "")
	if [ -z "$lock_before" ] || [ "$lock_before" != "$lock_after" ] || [ ! -d "$DAEMON_SRC/node_modules" ]; then
		log "npm install ($DAEMON_SRC)"
		( cd "$DAEMON_SRC" && npm install ) >>"$LOG_FILE" 2>&1 || die "npm install failed (see $LOG_FILE)" 4
	else
		log "npm install: package-lock.json unchanged; skipping"
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
	( cd "$DAEMON_ROOT" && exec env INSRC_MODE=daemon node --import tsx/esm "$DAEMON_ENTRY" >>"$DAEMON_LOG" 2>&1 </dev/null ) &
	disown 2>/dev/null || true
}

# SIGTERM the running daemon (graceful drain; the daemon handles the
# signal and has its own hard-exit backstop).
signal_stop() {
	if [ -f "$PID_FILE" ]; then
		local pid; pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
		if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then
			log "SIGTERM daemon (pid $pid)"
			kill "$pid" 2>/dev/null || true
		fi
	fi
}

# Poll for full drain: both pid file AND socket gone. Clears a stale
# pid file so a subsequent start doesn't refuse. 0 = stopped, 1 = timeout.
wait_for_daemon_stop() {
	local deadline=$(( $(date +%s) + STOP_WAIT_SECS ))
	while [ "$(date +%s)" -lt "$deadline" ]; do
		if [ -f "$PID_FILE" ]; then
			local pid; pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
			if [ -n "$pid" ] && ! ps -p "$pid" >/dev/null 2>&1; then rm -f "$PID_FILE"; fi
		fi
		if [ ! -f "$PID_FILE" ] && [ ! -S "$SOCK_FILE" ]; then return 0; fi
		sleep 0.5
	done
	return 1
}

# True while the pid is a running process. A killed process whose parent has
# not yet collected it (state Z) still answers `ps -p`, but it is gone.
pid_running() {
	local state; state=$(ps -o stat= -p "$1" 2>/dev/null || echo "")
	[ -n "$state" ] && [ "${state#Z}" = "$state" ]
}

# End a daemon that outlived wait_for_daemon_stop. The ONE forced stop of
# this script, used by cmd_stop and by the stale-daemon branch of cmd_start,
# so neither leaves a daemon half down.
#
# The pid is killed only when its command line ends in daemon/index.js (the
# same rule as the CLI's stop). A live pid that does not match is left alone
# and its pid file is kept: removing the pid file and socket of a live daemon
# would let a second one start on the same store.
force_stop_daemon() {
	local pid=""
	if [ -f "$PID_FILE" ]; then pid=$(cat "$PID_FILE" 2>/dev/null || echo ""); fi
	if [ -z "$pid" ] || ! ps -p "$pid" >/dev/null 2>&1; then
		die "daemon did not stop within $STOP_WAIT_SECS s: its socket is still present and the pid file names no live process (see $DAEMON_LOG)" 4
	fi

	local cmd; cmd=$(ps -o command= -p "$pid" 2>/dev/null || echo "")
	cmd="${cmd%"${cmd##*[![:space:]]}"}"   # trim trailing blanks
	case "$cmd" in
		*daemon/index.js) ;;
		*) die "daemon did not stop within $STOP_WAIT_SECS s, and pid $pid from the pid file is not a daemon process (command line: ${cmd:-unreadable}); it was not killed and its pid file was left in place" 4 ;;
	esac

	kill -KILL "$pid" 2>/dev/null || true
	local deadline=$(( $(date +%s) + 5 ))
	while pid_running "$pid" && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.1; done
	if pid_running "$pid"; then
		die "daemon (pid $pid) did not stop within $STOP_WAIT_SECS s and is still alive after SIGKILL; its pid file was left in place" 4
	fi
	rm -f "$PID_FILE" "$SOCK_FILE"
	log "daemon did not stop within $STOP_WAIT_SECS s; killed (pid $pid)"
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
# (node is guaranteed present). Prints the JSON result or exits non-zero.
socket_status() {
	node -e '
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

cmd_start() {
	require_daemon_dir
	local branch="${BRANCH:-$(git -C "$DAEMON_ROOT" rev-parse --abbrev-ref HEAD)}"
	SYNC_LOCK_HASH_BEFORE=$(git -C "$DAEMON_ROOT" hash-object package-lock.json 2>/dev/null || echo "")

	[ "$SKIP_SYNC"    -eq 1 ] || sync_repo "$branch"
	[ "$SKIP_INSTALL" -eq 1 ] || npm_install_if_needed
	[ "$SKIP_BUILD"   -eq 1 ] || npm_build

	# Stop a stale daemon first + wait for full drain.
	if [ -f "$PID_FILE" ] && ps -p "$(cat "$PID_FILE" 2>/dev/null || echo 0)" >/dev/null 2>&1; then
		log "stopping stale daemon (pid $(cat "$PID_FILE"))"
		signal_stop
		wait_for_daemon_stop || force_stop_daemon
	fi

	spawn_daemon
	local pid
	if ! pid=$(wait_for_daemon_ready); then
		die "daemon did not become ready within 60 s (see $DAEMON_LOG)" 4
	fi
	log "daemon running (pid $pid, log $DAEMON_LOG)"
	log "ctl-log: $LOG_FILE"
}

cmd_stop() {
	log "stopping daemon"
	signal_stop
	if wait_for_daemon_stop; then log "daemon shut down"; else force_stop_daemon; fi
}

cmd_restart() {
	cmd_stop || true
	cmd_start
}

cmd_update() {
	require_daemon_dir
	local branch="${BRANCH:-$(git -C "$DAEMON_ROOT" rev-parse --abbrev-ref HEAD)}"
	SYNC_LOCK_HASH_BEFORE=$(git -C "$DAEMON_ROOT" hash-object package-lock.json 2>/dev/null || echo "")

	[ "$SKIP_SYNC"    -eq 1 ] || sync_repo "$branch"
	[ "$SKIP_INSTALL" -eq 1 ] || npm_install_if_needed
	[ "$SKIP_BUILD"   -eq 1 ] || npm_build
	log "update complete (daemon NOT restarted)"
}

cmd_status() {
	require_daemon_dir
	log "daemon dir: $DAEMON_ROOT"
	log "branch:     $(git -C "$DAEMON_ROOT" rev-parse --abbrev-ref HEAD)"
	log "HEAD:       $(git -C "$DAEMON_ROOT" log --oneline -1)"
	socket_status 2>&1 | tee -a "$LOG_FILE"
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
		start|stop|restart|update|status) CMD="$1" ;;
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
esac
