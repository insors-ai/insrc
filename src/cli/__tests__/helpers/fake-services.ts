/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared fakes for the TUI tests: a Services object with inert defaults that a
 * test overrides per case, and small status / repo builders. No daemon, no socket.
 */

import type { Services } from '../../services/index.js';
import type { DaemonStatus, RegisteredRepo } from '../../../shared/types.js';
import type { ChainReport } from '../../../workflow/chain.js';
import type { AmendmentRecord } from '../../../workflow/amendments/types.js';
import type { SystemInfo } from '../../../shared/system-info.js';
import type { ModelRecommendation } from '../../../shared/model-recommender.js';

export const settle = (): Promise<void> => new Promise(r => setTimeout(r, 25));

export function status(overrides: Partial<DaemonStatus> = {}): DaemonStatus {
	return { uptime: 3661, repos: [], queueDepth: 2, embeddingsPending: 0, installedCommit: '', ...overrides };
}

export function repo(path: string, s: RegisteredRepo['status'] = 'ready'): RegisteredRepo {
	return { path, name: path.split('/').pop() ?? path, addedAt: '', status: s };
}

export const CHAIN: ChainReport = {
	epicHash: 'a3f4b8c9d1e2f3a4',
	epicSlug: 'add-tag-filter',
	define: { exists: true, approved: true, rejected: false, path: '/r/docs/defines/DEF-add-tag-filter.md' },
	hld:    { exists: true, approved: false, rejected: false, path: '/r/docs/designs/HLD-add-tag-filter.md' },
	stories: [{ id: 's1', title: 'Story one', hasLld: false, approved: false, stale: false }],
	amendments: { pending: 0, approved: 0, rejected: 0 },
	tracker: { pushed: false },
	nextAction: { kind: 'approve-hld', command: 'insrc workflow approve …' },
};

const notFaked = (what: string) => (): never => { throw new Error(`${what} is not faked in this test`); };

export function fakeServices(): Services {
	return {
		daemon: {
			isRunning:   () => true,
			getStatus:   async () => status(),
			startDaemon: async () => ({ started: true, logPath: '/tmp/.insrc/daemon.log', alreadyRunning: false }),
			stopDaemon:  async () => ({ stopped: true as const, forced: false }),
			restart:     async () => ({ ok: true, steps: ['stop', 'start'] }),
			update:      async () => ({ ok: true, steps: ['sync', 'build'] }),
			backup:      async () => ({ targetDir: '/b', lmdbBytes: 0, lanceBytes: 0, elapsedMs: 0 }),
			compact:     async () => ({ beforeBytes: 0, afterBytes: 0, savedBytes: 0, elapsedMs: 0 }),
		},
		repo: {
			list:    async () => [],
			add:     async p => ({ path: p }),
			remove:  async p => p,
			reindex: async p => p,
		},
		workflow: {
			listEpics:        () => [],
			chain:            () => CHAIN,
			chainText:        () => '',
			approve:          () => ({ approval: { workflow: 'define', path: '', approvedAt: '' } }),
			reject:           () => ({ workflow: 'define', path: '', rejectedAt: '', rejectReason: '' }),
			ackStale:         () => ({ path: '', ackedAt: '', reason: '' }),
			amendments:       () => [],
			approveAmendment: () => ({} as AmendmentRecord),
			rejectAmendment:  () => ({} as AmendmentRecord),
			staleness:        () => [],
			trackerSetup:     () => ({ steps: [], manualRemaining: 0 }),
			reviewArtifact:       async () => notFaked('workflow.reviewArtifact')(),
			reviewFindings:       notFaked('workflow.reviewFindings'),
			resolveFinding:       notFaked('workflow.resolveFinding'),
			runWorkflowStreaming: async () => notFaked('workflow.runWorkflowStreaming')(),
			sync:                 notFaked('workflow.sync'),
			deferredQuestions:    () => [],
			resolveEpicHashArg:   () => undefined,
		},
		setup: {
			detect:       () => ({} as SystemInfo),
			recommend:    () => ({} as ModelRecommendation),
			apply:        () => '/cfg',
			modelsToPull: () => [],
			pullModels:   async () => [],
		},
		models: {
			definitions: async () => ({ version: 1, defaultFamily: 'cli-claude' as const, families: [{ id: 'ollama' as const, displayName: 'Local', toolLoopModel: 'fake-local:1', models: [{ id: 'fake-local:1', aliases: [], efforts: [], source: 'shipped' as const, installed: false, memoryMb: 9000 }] }] }),
			check:       async () => ({ error: 'invalid-params: fake', recoverable: false as const }),
			approve:     async () => ({ ok: false as const, reason: 'unknown-check' as const, detail: 'fake' }),
			reject:      async () => ({ ok: false as const, reason: 'unknown-check' as const, detail: 'fake' }),
			resolveRole: async () => ({ error: 'fake', recoverable: false as const }),
		},
		config: {
			show:   async () => ({}),
			write:  async () => ({ ok: true }),
			reload: async () => ({ ok: true }),
		},
		team: {
			teamInit:    async () => '',
			teamRefresh: async () => '',
		},
		debug: {
			sections: [
				{ id: 'daemon', title: 'Daemon' },
				{ id: 'mcp', title: 'MCP' },
				{ id: 'logs', title: 'Logs' },
			],
			daemonStatus: async () => ({ reachable: false }),
			scanOrphans: () => ({ supported: false }),
			killOrphans: async () => [],
			attachedClients: async () => ({ reachable: false }),
			mcpStatus: async () => [],
			logCategories: () => [{ id: 'daemon', title: 'Daemon', stem: 'daemon' }, { id: 'agent', title: 'Agent', stem: 'agent' }],
			tailLog: () => () => {},
		},
	};
}
