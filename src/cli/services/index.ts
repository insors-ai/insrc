/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Services facade — the single object the TUI talks to. `makeServices()`
 * wires the real implementations; tests inject a fake object of the same
 * shape through `ServicesContext`, so no component touches the socket or
 * the filesystem directly.
 */

import type { DaemonStatus, RegisteredRepo } from '../../shared/types.js';
import type { SystemInfo } from '../../shared/system-info.js';
import type { ModelRecommendation } from '../../shared/model-recommender.js';
import type { ChainReport } from '../../workflow/chain.js';
import type { ApprovalResult, RejectionResult } from '../../workflow/gates.js';
import type { AmendmentRecord } from '../../workflow/amendments/types.js';
import type { StaleLldEntry } from '../../workflow/amendments/staleness.js';

import * as daemon from './daemon.js';
import * as repo from './repo.js';
import * as workflow from './workflow.js';
import * as setup from './setup.js';
import * as config from './config.js';
import * as maintenance from './maintenance.js';
import { isRunning } from './lifecycle.js';
import type { EpicSummary, ApproveOutcome } from './workflow.js';
import type { PullTick, PullResult } from './setup.js';
import type { UpdateOptions, MaintenanceResult, LogFn } from './maintenance.js';

export interface Services {
	readonly daemon: {
		isRunning(): boolean;
		getStatus(): Promise<DaemonStatus>;
		startDaemon(): Promise<daemon.StartResult>;
		stopDaemon(): Promise<void>;
		restart(onLog: LogFn): Promise<MaintenanceResult>;
		update(opts: UpdateOptions, onLog: LogFn): Promise<MaintenanceResult>;
		backup(path: string): Promise<daemon.BackupResult>;
		compact(): Promise<daemon.CompactResult>;
	};
	readonly repo: {
		list(): Promise<RegisteredRepo[]>;
		add(path: string): Promise<string>;
		remove(path: string): Promise<string>;
		reindex(path: string): Promise<string>;
	};
	readonly workflow: {
		listEpics(repoPath: string): EpicSummary[];
		chain(repoPath: string, epicHash: string): ChainReport;
		chainText(repoPath: string, epicHash: string): string;
		approve(artifactPath: string, withTracker?: boolean): ApproveOutcome;
		reject(artifactPath: string, reason: string): RejectionResult;
		ackStale(artifactPath: string, reason: string): { readonly path: string; readonly ackedAt: string; readonly reason: string };
		amendments(repoPath: string, epicHash: string): readonly AmendmentRecord[];
		approveAmendment(repoPath: string, amendmentId: string, approvedBy: string): AmendmentRecord;
		rejectAmendment(repoPath: string, amendmentId: string, reason: string): AmendmentRecord;
		staleness(repoPath: string, epicHash: string): readonly StaleLldEntry[];
		sync(repoPath: string, epicHash: string): import('../../workflow/tracker/sync.js').SyncResult;
		deferredQuestions(repoPath: string, epicHash: string): readonly import('../../workflow/questions.js').DeferredQuestion[];
		resolveEpicHashArg(repoPath: string, hashOrSlug: string): string | undefined;
	};
	readonly setup: {
		detect(): SystemInfo;
		recommend(info: SystemInfo): ModelRecommendation;
		apply(rec: ModelRecommendation): string;
		modelsToPull(rec: ModelRecommendation): string[];
		pullModels(models: readonly string[], onProgress: (tick: PullTick) => void): Promise<PullResult[]>;
	};
	readonly config: {
		show(): Promise<Record<string, unknown>>;
		write(path: string, value: unknown): Promise<{ ok: boolean }>;
		reload(): Promise<{ ok: boolean; reloaded?: unknown }>;
	};
}

export function makeServices(): Services {
	return {
		daemon: {
			isRunning,
			getStatus:   daemon.getStatus,
			startDaemon: daemon.startDaemon,
			stopDaemon:  daemon.stopDaemon,
			restart:     maintenance.restart,
			update:      maintenance.update,
			backup:      daemon.backup,
			compact:     daemon.compact,
		},
		repo: {
			list:    repo.listRepos,
			add:     repo.addRepo,
			remove:  repo.removeRepo,
			reindex: repo.reindexRepo,
		},
		workflow: {
			listEpics:        workflow.listEpics,
			chain:            workflow.chain,
			chainText:        workflow.chainText,
			approve:          workflow.approve,
			reject:           workflow.reject,
			ackStale:         workflow.ackStale,
			amendments:       workflow.amendments,
			approveAmendment: workflow.approveAmendmentById,
			rejectAmendment:  workflow.rejectAmendmentById,
			staleness:        workflow.staleness,
			sync:             workflow.sync,
			deferredQuestions: workflow.deferredQuestions,
			resolveEpicHashArg: workflow.resolveEpicHashArg,
		},
		setup: {
			detect:       setup.detect,
			recommend:    setup.recommend,
			apply:        setup.apply,
			modelsToPull: setup.modelsToPull,
			pullModels:   setup.pullModels,
		},
		config: {
			show:   config.showConfig,
			write:  config.writeConfig,
			reload: config.reloadConfig,
		},
	};
}
