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

import type { DaemonStatus, RegisteredRepo, SteeringSelection  } from '../../shared/types.js';
import type { DebugService } from './debug-types.js';
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
import * as team from './team.js';
import { registerParkOfferProvider } from '../../workflow/team/gate.js';
import { registerSignoffHook } from '../../workflow/team/signoff.js';
import { draftParkOffer } from '../../workflow/team/handoff.js';
import * as debug from './debug.js';
import { createApprovalWatcher, type ApprovalWatcher } from './approval.js';
import { createIpcClient } from '../../shared/ipc-client.js';
import { isRunning } from './lifecycle.js';
import type { EpicSummary, ApproveOutcome } from './workflow.js';
import type { PullTick, PullResult } from './setup.js';
import type { UpdateOptions, MaintenanceResult, LogFn } from './maintenance.js';

export interface Services {
	readonly daemon: {
		isRunning(): boolean;
		getStatus(): Promise<DaemonStatus>;
		startDaemon(): Promise<daemon.StartResult>;
		stopDaemon(): Promise<daemon.StopOutcome>;
		restart(onLog: LogFn): Promise<MaintenanceResult>;
		update(opts: UpdateOptions, onLog: LogFn): Promise<MaintenanceResult>;
		backup(path: string): Promise<daemon.BackupResult>;
		compact(): Promise<daemon.CompactResult>;
	};
	readonly repo: {
		list(): Promise<RegisteredRepo[]>;
		add(path: string, steering?: SteeringSelection): Promise<repo.AddRepoResult>;
		remove(path: string): Promise<string>;
		reindex(path: string): Promise<string>;
	};
	readonly workflow: {
		listEpics(repoPath: string): EpicSummary[];
		chain(repoPath: string, epicHash: string): ChainReport;
		chainText(repoPath: string, epicHash: string): string;
		approve(artifactPath: string, withTracker?: boolean, overrideReview?: string): Promise<ApproveOutcome>;
		reviewArtifact(repoPath: string, artifactPath: string): Promise<import('../../workflow/review/index.js').ReviewArtifactResult>;
		reviewFindings(artifactPath: string): import('./workflow.js').ReviewFindingsResult;
		resolveFinding(artifactPath: string, findingId: string, action: import('../../workflow/review/index.js').ReviewAction, note?: string): import('../../workflow/review/index.js').ResolveReviewResult;
		runWorkflowStreaming(repoPath: string, workflow: string, focus: string, params: Record<string, unknown>, onLine: (line: string) => void): Promise<import('./workflow.js').StreamRunResult>;
		reject(artifactPath: string, reason: string): Promise<RejectionResult>;
		ackStale(artifactPath: string, reason: string): Promise<{ readonly path: string; readonly ackedAt: string; readonly reason: string }>;
		amendments(repoPath: string, epicHash: string): readonly AmendmentRecord[];
		approveAmendment(repoPath: string, amendmentId: string, approvedBy: string): Promise<AmendmentRecord>;
		rejectAmendment(repoPath: string, amendmentId: string, reason: string): Promise<AmendmentRecord>;
		staleness(repoPath: string, epicHash: string): readonly StaleLldEntry[];
		sync(repoPath: string, epicHash: string): import('../../workflow/tracker/sync.js').SyncResult;
		deferredQuestions(repoPath: string, epicHash: string): readonly import('../../workflow/questions.js').DeferredQuestion[];
		resolveEpicHashArg(repoPath: string, hashOrSlug: string): string | undefined;
		trackerSetup(repoPath: string, opts?: import('../../workflow/tracker/setup.js').TrackerSetupOptions): Promise<import('../../workflow/tracker/setup.js').TrackerSetupReport>;
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
		write(path: string | string[], value: unknown): Promise<{ ok: boolean }>;
		reload(): Promise<{ ok: boolean; reloaded?: unknown }>;
		catalog(): Promise<import('../../config/settings-catalog.js').SettingsCatalogPayload>;
		repoSettings(repo: string): Promise<import('../../daemon/repo-settings.js').SettingsResult>;
		setRepoSetting(repo: string, key: string, value: string | boolean | null): Promise<import('../../daemon/repo-settings.js').SettingsResult>;
	};
	readonly team: {
		teamInit(repoPath: string): Promise<string>;
		teamRefresh(repoPath: string, branch?: string): Promise<string>;
		teamClaim(repoPath: string, unit: Omit<import('../../workflow/tracker/refs.js').UnitRef, 'repoPath'>): string;
		teamRelease(repoPath: string, unit: Omit<import('../../workflow/tracker/refs.js').UnitRef, 'repoPath'>): string;
		teamPark(repoPath: string, unit: Omit<import('../../workflow/tracker/refs.js').UnitRef, 'repoPath'>): Promise<string>;
		teamResume(repoPath: string, unit: Omit<import('../../workflow/tracker/refs.js').UnitRef, 'repoPath'>, workflow?: string): Promise<string>;
		teamSettle(repoPath: string, unit: Omit<import('../../workflow/tracker/refs.js').UnitRef, 'repoPath'>): Promise<string>;
	};
	readonly debug: DebugService;
	/** Approval requests waiting for this terminal's answer. Absent in a test double. */
	readonly approvals?: ApprovalWatcher;
}

export function makeServices(): Services {
	// The terminal runs the team gate in its own process, which has no run store: its refusals offer to park an uncommitted draft.
	registerParkOfferProvider((repo, unit) => draftParkOffer(repo, unit));
	// The same gate holds a stage that awaits signoff; the hook only reads the recorded state, so the terminal needs no tracker for it.
	registerSignoffHook();
	return {
		approvals: createApprovalWatcher({ client: createIpcClient() }),
		daemon: {
			isRunning,
			getStatus:   daemon.getStatus,
			startDaemon: daemon.startDaemon,
			stopDaemon:  () => daemon.stopDaemon(),
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
			reviewArtifact:   workflow.reviewArtifact,
			reviewFindings:   workflow.reviewFindings,
			resolveFinding:   workflow.resolveFinding,
			runWorkflowStreaming: workflow.runWorkflowStreaming,
			reject:           workflow.reject,
			ackStale:         workflow.ackStale,
			amendments:       workflow.amendments,
			approveAmendment: workflow.approveAmendmentById,
			rejectAmendment:  workflow.rejectAmendmentById,
			staleness:        workflow.staleness,
			sync:             workflow.sync,
			deferredQuestions: workflow.deferredQuestions,
			resolveEpicHashArg: workflow.resolveEpicHashArg,
			trackerSetup:      workflow.trackerSetup,
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
			catalog:        config.getCatalog,
			repoSettings:   config.getRepoSettings,
			setRepoSetting: config.setRepoSetting,
		},
		team: {
			teamInit:    team.teamInit,
			teamRefresh: team.teamRefresh,
			teamClaim:   team.teamClaim,
			teamRelease: team.teamRelease,
			teamPark:    (repoPath, unit) => team.teamPark(repoPath, unit),
			teamResume:  (repoPath, unit, workflow) => team.teamResume(repoPath, unit, workflow),
			teamSettle:  (repoPath, unit) => team.teamSettle(repoPath, unit),
		},
		debug: {
			sections:        debug.sections,
			daemonStatus:    debug.daemonStatus,
			scanOrphans:     debug.scanOrphans,
			killOrphans:     debug.killOrphans,
			attachedClients: debug.attachedClients,
			mcpStatus:       debug.mcpStatus,
			logCategories:   debug.logCategories,
			tailLog:         debug.tailLog,
		},
	};
}
