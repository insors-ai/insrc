/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Registers the delivery board (E2 s1): the insrc.delivery.openBoard command over
 * one board host, a delivery client scoped to the workspace folder, and the
 * webview panel adapted to the host's channel through the shared webviewChannel. vscode-free: extension.ts passes
 * the panel factory, the command registry and the logger, so the command's
 * behaviour is tested with fakes.
 */

import { randomBytes } from 'node:crypto';

import type { ChatPanelLogger } from '../chat/chat-panel.js';
import { webviewChannel, type WebviewPanelLike } from '../chat/webview-channel.js';
import type { CommandRegistry } from '../surfaces/command-registry.js';
import type { DisposableSink } from '../surfaces/types.js';
import { createDeliveryBoardHost, type DeliveryBoardHostDeps } from './board-host.js';
import { createDeliveryClient, type DeliveryClientDeps } from './delivery-client.js';

/** The slice of vscode.Uri the tab icon needs: a file on disk. */
export interface BoardIconUri {
  readonly fsPath: string;
}

/** The board's editor-tab icon: one image per theme kind (vscode.Uri.file in extension.ts). */
export interface BoardTabIcon {
  readonly light: BoardIconUri;
  readonly dark: BoardIconUri;
}

/** The slice of vscode.WebviewPanel the board uses. */
export type BoardWebviewPanel = WebviewPanelLike & { iconPath?: unknown };

export interface DeliveryBoardWiringDeps {
  readonly commands: CommandRegistry;
  readonly subscriptions: DisposableSink;
  /** vscode.window.createWebviewPanel in the active editor column, scripts enabled. */
  readonly createWebviewPanel: (viewType: string, title: string) => BoardWebviewPanel;
  /** The board panel's tab icon (media/insrc-delivery-icon*.svg); without it the tab keeps VS Code's default. */
  readonly tabIcon?: BoardTabIcon | undefined;
  readonly rpc: DeliveryClientDeps['rpc'];
  /** The first workspace folder's path at the time of the call, or null without one. */
  readonly repo: () => string | null;
  readonly logger: ChatPanelLogger;
  /** The review pane, when the chat setting created one (s4); without it the board reads records itself. */
  readonly reviewPane?: DeliveryBoardHostDeps['reviewPane'];
}

export const DELIVERY_DEADLINES_MS = { snapshot: 30_000, evidence: 15_000 } as const;

export function registerDeliveryBoard(deps: DeliveryBoardWiringDeps): void {
  const clientNow = () => createDeliveryClient({ rpc: deps.rpc, repo: deps.repo(), deadlinesMs: DELIVERY_DEADLINES_MS });
  const host = createDeliveryBoardHost({
    createPanel: ({ viewType, title }) => {
      const panel = deps.createWebviewPanel(viewType, title);
      if (deps.tabIcon !== undefined) panel.iconPath = deps.tabIcon;
      return webviewChannel(panel);
    },
    // A client per call, so each request reads the workspace folder as it is now.
    client: {
      snapshot: () => clientNow().snapshot(),
      evidence: (artifactId) => clientNow().evidence(artifactId),
    },
    logger: deps.logger,
    now: () => new Date().toISOString(),
    genNonce: () => randomBytes(16).toString('base64'),
    reviewPane: deps.reviewPane,
  });
  deps.subscriptions.push({ dispose: () => host.dispose() });
  deps.commands.register({ id: 'insrc.delivery.openBoard', title: 'insrc: Open delivery board' }, async () => {
    host.open();
  });
}
