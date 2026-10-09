/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Registers the delivery board (E2 s1): the insrc.delivery.openBoard command over
 * one board host, a delivery client scoped to the workspace folder, and the
 * webview panel adapted to the host's channel. vscode-free: extension.ts passes
 * the panel factory, the command registry and the logger, so the command's
 * behaviour is tested with fakes.
 */

import { randomBytes } from 'node:crypto';

import type { ChatPanelChannel, ChatPanelLogger } from '../chat/chat-panel.js';
import type { CommandRegistry } from '../surfaces/command-registry.js';
import type { DisposableSink } from '../surfaces/types.js';
import { createDeliveryBoardHost } from './board-host.js';
import { createDeliveryClient, type DeliveryClientDeps } from './delivery-client.js';

/** The slice of vscode.WebviewPanel the board uses. */
export interface BoardWebviewPanel {
  readonly webview: {
    html: string;
    postMessage(message: unknown): PromiseLike<boolean>;
    onDidReceiveMessage(listener: (message: unknown) => void): unknown;
  };
  onDidDispose(listener: () => void): unknown;
  reveal(): void;
  dispose(): void;
}

export interface DeliveryBoardWiringDeps {
  readonly commands: CommandRegistry;
  readonly subscriptions: DisposableSink;
  /** vscode.window.createWebviewPanel in the active editor column, scripts enabled. */
  readonly createWebviewPanel: (viewType: string, title: string) => BoardWebviewPanel;
  readonly rpc: DeliveryClientDeps['rpc'];
  /** The first workspace folder's path at the time of the call, or null without one. */
  readonly repo: () => string | null;
  readonly logger: ChatPanelLogger;
}

export const DELIVERY_DEADLINES_MS = { snapshot: 30_000, evidence: 15_000 } as const;

function panelChannel(panel: BoardWebviewPanel): ChatPanelChannel {
  return {
    setHtml: (html) => {
      panel.webview.html = html;
    },
    postMessage: (message) => {
      panel.webview.postMessage(message).then(undefined, () => {
        /* ignore posts to a disposed/hidden panel */
      });
    },
    onMessage: (listener) => {
      panel.webview.onDidReceiveMessage((m) => listener(m));
    },
    onDidDispose: (listener) => {
      panel.onDidDispose(listener);
    },
    reveal: () => panel.reveal(),
    dispose: () => panel.dispose(),
  };
}

export function registerDeliveryBoard(deps: DeliveryBoardWiringDeps): void {
  const clientNow = () => createDeliveryClient({ rpc: deps.rpc, repo: deps.repo(), deadlinesMs: DELIVERY_DEADLINES_MS });
  const host = createDeliveryBoardHost({
    createPanel: ({ viewType, title }) => panelChannel(deps.createWebviewPanel(viewType, title)),
    // A client per call, so each request reads the workspace folder as it is now.
    client: {
      snapshot: () => clientNow().snapshot(),
      evidence: (artifactId) => clientNow().evidence(artifactId),
    },
    logger: deps.logger,
    now: () => new Date().toISOString(),
    genNonce: () => randomBytes(16).toString('base64'),
  });
  deps.subscriptions.push({ dispose: () => host.dispose() });
  deps.commands.register({ id: 'insrc.delivery.openBoard', title: 'insrc: Open delivery board' }, async () => {
    host.open();
  });
}
