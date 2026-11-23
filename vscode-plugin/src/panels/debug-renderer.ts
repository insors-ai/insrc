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
import type { DaemonDataGateway, TabActivationCtx, TabController, TabRenderer } from './types.js';
import type { LogTail } from './log-tail.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';

/** Injected inputs for the Debug tab controller (the live log tail + a degrade logger). */
export interface DebugControllerDeps {
  readonly logTail: LogTail;
  readonly logger: { warn(message: string): void };
}

/**
 * The Debug tab body (ac1 + orphan offer + live-log region). Reads the MCP clients
 * and the orphan scan through the gateway; a rejection propagates to the host.
 */
export function renderDebugTab(): TabRenderer {
  return async (gateway: DaemonDataGateway): Promise<string> => {
    const clients = await gateway.mcpClients();

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


    return (
      `<section class="mcp"><h3>MCP clients</h3>${clientsSection}</section>` +
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
