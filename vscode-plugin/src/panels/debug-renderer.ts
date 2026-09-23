/**
 * Story E20260923401ae5fb:S006 / t4 — the Debug tab renderer + controller (sc9).
 *
 * The S006-owned Debug tab, plugged into the sc9 host via the detailRenderers map
 * (the body) + the tabControllers map (the live log ticker). Both are VS-Code-free.
 *
 * `renderDebugTab` is a pure fn over the read-only DaemonDataGateway + a managedPid
 * resolver: it awaits gateway.mcpClients() (the attached MCP/socket clients, ac1)
 * and gateway.scanOrphans() (EXCLUDING the managed daemon), renders the escaped
 * lists + the empty live-log region, and shows a 'Clean up orphaned processes'
 * button ONLY when >=1 non-managed orphan exists. The button posts a
 * {type:'action',action:'cleanupOrphans'} message (the host forwards it to
 * onDetailAction, which owns the consent-gated kill). A gateway rejection
 * PROPAGATES (the host's never-throw wrapper degrades the tab).
 *
 * `createDebugTabController` is the tabControllers.debug entry: onActivate arms the
 * injected LogTail's follow, pushing each batch of appended lines to the webview as
 * a {type:'appendLog',lines} frame; the returned dispose stops the tail (idempotent
 * via the tail). The webview appends the lines via textContent (XSS-safe), so the
 * renderer does not escape them here. No vscode, no cloud (k2/k3).
 */

import { escapeHtml } from './html.js';
import type { DaemonDataGateway, OrphanProcess, TabActivationCtx, TabController, TabRenderer } from './types.js';
import type { LogTail } from './log-tail.js';
import type { KillOutcome } from './orphan-kill.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';

/** Injected inputs for the Debug renderer (the shared managed-pid resolver). */
export interface DebugRendererDeps {
  /** The managed daemon's pid (or undefined) — used to exclude it from the orphan offer. */
  readonly managedPid: () => number | undefined;
}

/** Injected inputs for the Debug tab controller (the live log tail + a degrade logger). */
export interface DebugControllerDeps {
  readonly logTail: LogTail;
  readonly logger: { warn(message: string): void };
}

/**
 * Injected inputs for the Debug tab's action handler (the consent-gated orphan
 * cleanup, k4). All VS-Code-free surfaces: the read-only orphan scan + the managed
 * pid to exclude, the sc4 ConsentGate, the pure kill seam, the sc2 StatusSurface,
 * and a degrade logger. extension.ts binds the real objects.
 */
export interface DebugActionDeps {
  readonly scanOrphans: () => Promise<readonly OrphanProcess[]>;
  readonly managedPid: () => number | undefined;
  readonly consent: ConsentGate;
  readonly kill: (pids: readonly number[]) => Promise<KillOutcome[]>;
  readonly status: StatusSurface;
  readonly logger: { warn(message: string): void };
}

/**
 * The Debug tab body (ac1 + orphan offer + live-log region). Reads the MCP clients
 * and the orphan scan through the gateway; a rejection propagates to the host.
 */
export function renderDebugTab(deps: DebugRendererDeps): TabRenderer {
  return async (gateway: DaemonDataGateway): Promise<string> => {
    const clients = await gateway.mcpClients();
    const managed = deps.managedPid();
    const orphans = (await gateway.scanOrphans()).filter((o) => o.pid !== managed);

    const clientsSection =
      clients.length === 0
        ? `<p class="placeholder">No MCP clients attached.</p>`
        : `<ul class="clients">${clients
            .map(
              (c) =>
                `<li><span class="host">${escapeHtml(c.host)}</span> — <span class="status">${
                  c.wired ? 'wired' : 'not wired'
                }</span></li>`,
            )
            .join('')}</ul>`;

    const orphansSection =
      orphans.length === 0
        ? `<p class="placeholder">No orphaned processes.</p>`
        : `<ul class="orphans">${orphans
            .map((o) => `<li><span class="pid">${o.pid}</span> — <span class="cmd">${escapeHtml(o.command)}</span></li>`)
            .join('')}` +
          `</ul><button type="button" id="insrc-cleanup" class="action" data-action="cleanupOrphans">Clean up orphaned processes</button>`;

    return (
      `<section class="mcp"><h3>MCP clients</h3>${clientsSection}</section>` +
      `<section class="orphans"><h3>Orphaned processes</h3>${orphansSection}</section>` +
      `<section class="logs"><h3>Daemon log</h3><pre id="insrc-log" class="log"></pre></section>`
    );
  };
}

/**
 * The Debug tab controller (tabControllers.debug): the epic's only continuous
 * ticker. onActivate arms exactly ONE logTail.follow and forwards each appended
 * batch to the webview; the returned dispose stops the tail. A follow-arm failure
 * is caught (the host stays never-throw) and degrades to no ticker.
 */
export function createDebugTabController(deps: DebugControllerDeps): TabController {
  return {
    onActivate(ctx: TabActivationCtx): () => void {
      try {
        return deps.logTail.follow((lines) => {
          if (lines.length === 0) return; // an empty (loaded) tail carries nothing to append.
          ctx.postMessage({ type: 'appendLog', lines });
        });
      } catch (err) {
        deps.logger.warn(`insrc: could not start the daemon log tail — ${err instanceof Error ? err.message : String(err)}`);
        return () => {};
      }
    },
  };
}

/**
 * The Debug tab's webview-action handler (the host's onDetailAction sink). The ONLY
 * action is 'cleanupOrphans': re-scan, DROP the managed daemon, and — ONLY when at
 * least one non-managed orphan remains AND the developer accepts the sc4 consent
 * prompt (k4) — kill exactly those pids, surfacing the outcome via sc2. An unknown
 * action, a zero-orphan scan (no empty modal), or a non-accepted consent kills
 * NOTHING. Fire-and-forget + never-throw (a failure degrades to a logged warn), so
 * the sync host sink stays safe. VS-Code-free.
 */
export function createDebugActionHandler(deps: DebugActionDeps): (action: string) => void {
  return (action: string): void => {
    if (action !== 'cleanupOrphans') return; // unknown action — no-op.
    void (async () => {
      try {
        const managed = deps.managedPid();
        const orphans = (await deps.scanOrphans()).filter((o) => o.pid !== managed);
        if (orphans.length === 0) return; // nothing to clean — no prompt (no empty modal).
        const outcome = await deps.consent.ask({
          title: 'Clean up orphaned insrc processes?',
          detail: `Terminate ${orphans.length} stray insrc process(es)? The managed daemon is never touched.`,
          acceptLabel: 'Terminate',
          items: orphans.map((o) => `pid ${o.pid} — ${o.command}`),
        });
        if (outcome !== 'accepted') return; // declined / dismissed — kill NOTHING (k4).
        const results = await deps.kill(orphans.map((o) => o.pid));
        const killed = results.filter((r) => r.result === 'terminated' || r.result === 'forced').length;
        deps.status.set({
          state: deps.status.current().state,
          detail: `cleaned up ${killed}/${orphans.length} orphaned process(es)`,
        });
      } catch (err) {
        deps.logger.warn(`insrc: the orphan cleanup failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  };
}
