import { shellHtml } from './shell.js';
import { escapeHtml } from './html.js';

/** Host-owned webview resource URIs, never values from note content/messages. */
export interface ScratchEditorAssets {
  readonly script: string;
  readonly style: string;
  readonly cspSource: string;
  readonly workerSource?: string | undefined;
}

export function scratchEditorHtml(assets: ScratchEditorAssets, nonce: string, paneSessionId?: string): string {
  if (paneSessionId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(paneSessionId)) throw new Error('Invalid scratchpad editor session');
  if (!/^[A-Za-z0-9_+\/-]+={0,2}$/.test(nonce) ||
      !/^(?:vscode-webview:\/\/[A-Za-z0-9-]+|(?:'self' )?https:\/\/\*\.vscode-cdn\.net)$/.test(assets.cspSource)) {
    throw new Error('Invalid scratchpad webview resource policy');
  }
  for (const uri of [assets.script, assets.style]) {
    const parsed = new URL(uri);
    const local = assets.cspSource.startsWith('vscode-webview:')
      ? parsed.protocol === 'vscode-webview:' && `vscode-webview://${parsed.host}` === assets.cspSource
      : parsed.protocol === 'https:' && parsed.hostname.endsWith('.vscode-cdn.net');
    if (!local || parsed.username || parsed.password) throw new Error('Scratchpad assets must be local webview resources');
  }
  const source = assets.cspSource;
  return shellHtml('Scratchpad', `<main id="scratch-editor"${paneSessionId === undefined ? '' : ` data-pane-session="${paneSessionId}"`}></main>`, nonce, undefined, {
    hideTitle: true,
    resourceSource: source,
    cspExtra: ` connect-src 'none'; worker-src blob:; img-src ${source} data:; font-src ${source} data:;`,
    headExtra: `<link rel="stylesheet" href="${escapeHtml(assets.style)}">${assets.workerSource === undefined ? '' : `<script type="application/json" id="scratch-validator-source" nonce="${nonce}">${JSON.stringify(assets.workerSource).replace(/</g, '\\u003c')}</script>`}<script defer nonce="${nonce}" src="${escapeHtml(assets.script)}"></script>`,
  });
}
