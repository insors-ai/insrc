/**
 * Story E20260922401ae5fb:S004 / t6 — the default ProcessScan bound in extension.ts.
 *
 * A thin, READ-ONLY POSIX `ps` scan for stray insrc daemon/mcp processes (mirrors
 * the JetBrains OrphanProcessSeam). It lives inside the plugin (node child_process
 * only — no daemon internals) so the extension bundle stays thin (k5). It NEVER
 * kills — the consent-gated cleanup is s6 (k4); this only enumerates candidates
 * the gateway's scanOrphans() exposes. On a non-POSIX platform or a `ps` failure
 * it returns an empty list (the gateway treats a thrown scan as GatewayReadError).
 */

import { execFile } from 'node:child_process';

import type { OrphanProcess, ProcessScan } from './types.js';

/** Substrings that mark an insrc daemon/mcp process in a `ps` command line. */
const INSRC_MARKERS = ['insrc/daemon', 'insrc-mcp', '.insrc/daemon', 'out/daemon/index.js', 'out/bin/insrc-mcp.js'];

/** Run `ps` and return raw stdout; rejects on a non-zero exit / spawn error. */
function runPs(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/**
 * Parse `ps` output into the insrc daemon/mcp candidates. Each line is
 * `<pid> <command…>`; a line is a candidate when its command mentions an insrc
 * entrypoint marker AND is not this process (the extension host) itself.
 */
export function parseOrphans(psOutput: string, selfPid: number): OrphanProcess[] {
  const out: OrphanProcess[] = [];
  for (const line of psOutput.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const match = /^(\d+)\s+(.*)$/.exec(trimmed);
    if (match === null) continue;
    const pid = Number(match[1]);
    const command = match[2] ?? '';
    if (pid === selfPid) continue;
    if (!INSRC_MARKERS.some((m) => command.includes(m))) continue;
    out.push({ pid, command });
  }
  return out;
}

/** The default ProcessScan: a POSIX `ps` scan, empty on non-POSIX. Read-only. */
export const defaultProcessScan: ProcessScan = async () => {
  if (process.platform === 'win32') return []; // no `ps` — degrade to empty (not an error).
  const output = await runPs();
  return parseOrphans(output, process.pid);
};
