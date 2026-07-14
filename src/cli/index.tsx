#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * insrc — interactive terminal UI.
 *
 * A full-screen dashboard replaces the old commander subcommands: panes
 * for the daemon (start/stop/restart/update/backup/compact), repos, the
 * workflow chain (approve/reject/amend), and setup.
 *
 * IMPORTANT: the pino `cli` log mode pretty-prints to stdout from a
 * worker thread, which would corrupt the ink render (and ink's console
 * patching cannot intercept a transport-thread write). We force the
 * file-sink `daemon` mode via INSRC_MODE *before importing anything*
 * that constructs a logger, so no library log ever touches stdout.
 */

process.env['INSRC_MODE'] ??= 'daemon';

// ink needs a TTY: stdout for the render, stdin for raw-mode key input.
if (process.stdout.isTTY !== true || process.stdin.isTTY !== true) {
	process.stderr.write('insrc requires an interactive terminal (TTY).\n');
	process.exit(1);
}

const { render } = await import('ink');
const { createElement } = await import('react');
const { App } = await import('./app.js');
const { makeServices } = await import('./services/index.js');

const { waitUntilExit } = render(createElement(App, { services: makeServices() }));
await waitUntilExit();
