/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one WebviewPanel -> ChatPanelChannel adapter the chat panel, the docs-review
 * pane and the delivery board share. vscode-free: it takes the slice of
 * vscode.WebviewPanel it uses, so a test passes a fake.
 */

import type { ChatPanelChannel } from './chat-panel.js';

/** The slice of vscode.WebviewPanel a channel uses. */
export interface WebviewPanelLike {
  readonly webview: {
    html: string;
    postMessage(message: unknown): PromiseLike<boolean>;
    onDidReceiveMessage(listener: (message: unknown) => void): unknown;
  };
  onDidDispose(listener: () => void): unknown;
  reveal(): void;
  dispose(): void;
}

export function webviewChannel(panel: WebviewPanelLike): ChatPanelChannel {
  return {
    setHtml: (html) => {
      panel.webview.html = html;
    },
    postMessage: (message) => {
      // Fire-and-forget: a post to a disposed/hidden panel must never reject inward.
      panel.webview.postMessage(message).then(undefined, () => {
        /* ignore */
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
