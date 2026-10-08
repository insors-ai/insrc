/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery read model's two daemon handlers (E1 s5, sc7).
 *
 * workflow.delivery reads the artifact store once, runs the graph, stage, gate
 * and currency passes over that one record set and returns the assembled
 * snapshot. workflow.deliveryEvidence returns one record's meta, body and
 * rendered markdown, including records the review view cannot open. Both
 * follow handleWorkflowPending: the repo comes from the request, else
 * INSRC_REPO, and every failure is a structured { error }. Neither throws,
 * neither writes.
 */

import { readFileSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { ARTIFACTS_DIR } from '../storage.js';
import { deriveCurrency } from './currency.js';
import { deriveGates } from './gate.js';
import { buildWorkItemGraph } from './graph.js';
import { DELIVERY_ARTIFACT_KINDS, liftStoreFile, loadArtifactRecordSet, nodeStoreFs } from './load.js';
import { createMarkdownPort } from './markdown.js';
import { errorText } from './read.js';
import { assembleSnapshot } from './snapshot.js';
import { deriveStages } from './stage.js';
import type {
	ArtifactRecord,
	DeliveryDeps,
	DeliveryEvidenceRequest,
	DeliveryEvidenceResponse,
	DeliverySnapshotRequest,
	DeliverySnapshotResponse,
} from './types.js';

const log = getLogger('delivery');

const ARTIFACT_ID_RE = new RegExp(`^(${DELIVERY_ARTIFACT_KINDS.join('|')})-[0-9a-f]{16}(-[A-Za-z0-9]+)?$`);

/** The request's repo when a non-empty string, else the daemon's INSRC_REPO, else null. */
function repoOf(params: { readonly repo?: string | undefined } | undefined, repoEnv: string | undefined): string | null {
	const fromParams = params?.repo;
	const repo = typeof fromParams === 'string' && fromParams.length > 0 ? fromParams : repoEnv;
	return repo !== undefined && repo.length > 0 ? repo : null;
}

/** workflow.delivery: one timestamped snapshot of every work item in the repo's artifact store. */
export function handleDelivery(
	params: DeliverySnapshotRequest | undefined,
	repoEnv: string | undefined,
	deps: DeliveryDeps = {},
): DeliverySnapshotResponse {
	const repo = repoOf(params, repoEnv);
	if (repo === null) return { error: 'workflow.delivery: `repo` is required' };
	const started = performance.now();
	try {
		const recordSet = loadArtifactRecordSet(repo, deps.fs ?? nodeStoreFs, deps.now);
		const graph = buildWorkItemGraph(recordSet);
		const snapshot = assembleSnapshot(
			recordSet, graph,
			deriveStages(graph, recordSet), deriveGates(graph, recordSet), deriveCurrency(graph, recordSet),
			deps.markdown ?? createMarkdownPort(repo, graph),
		);
		// An item-level notice is one object shared by every item it names, so a Set counts it once.
		const noticesByCode: Record<string, number> = {};
		for (const n of new Set([...snapshot.notices, ...snapshot.items.flatMap(i => i.notices)])) {
			noticesByCode[n.code] = (noticesByCode[n.code] ?? 0) + 1;
		}
		log.info({
			repo,
			records:    snapshot.recordCount,
			unreadable: snapshot.unreadableCount,
			items:      snapshot.items.length,
			notices:    noticesByCode,
			elapsedMs:  Math.round(performance.now() - started),
		}, 'workflow.delivery');
		return snapshot;
	} catch (err) {
		return { error: `workflow.delivery: ${errorText(err)}` };
	}
}

/** The record's rendered markdown under docs/, or null when there is none or the store cannot be read. */
function renderedMarkdownOf(repo: string, record: ArtifactRecord, deps: DeliveryDeps): string | null {
	try {
		const port = deps.markdown ?? createMarkdownPort(repo, buildWorkItemGraph(loadArtifactRecordSet(repo, deps.fs ?? nodeStoreFs, deps.now)));
		const md = port.markdownOf(record);
		// The port already ran the docs/ containment check; read the file it resolved.
		return md === null ? null : readFileSync(md.realPath, 'utf8');
	} catch (err) {
		log.warn({ repo, artifactId: record.artifactId, err: errorText(err) }, 'workflow.deliveryEvidence: rendered markdown could not be read');
		return null;
	}
}

/** workflow.deliveryEvidence: one record's meta, body and rendered markdown, read through the daemon. */
export function handleDeliveryEvidence(
	params: DeliveryEvidenceRequest | undefined,
	repoEnv: string | undefined,
	deps: DeliveryDeps = {},
): DeliveryEvidenceResponse {
	const repo = repoOf(params, repoEnv);
	if (repo === null) return { error: 'workflow.deliveryEvidence: `repo` is required' };
	const artifactId: unknown = params?.artifactId;
	if (typeof artifactId !== 'string' || !ARTIFACT_ID_RE.test(artifactId)) return { error: 'invalid artifact id' };

	// The store record's existence, containment and read all go through the store fs seam;
	// its rendered markdown under docs/ is the markdown port's job (deps.markdown).
	const fs = deps.fs ?? nodeStoreFs;
	const storeDir = join(repo, ARTIFACTS_DIR);
	const fileName = `${artifactId}.json`;
	const filePath = join(storeDir, fileName);
	if (!fs.exists(filePath)) return { error: 'not found' };
	let realFile: string;
	let realStore: string;
	try {
		realFile = fs.realpath(filePath);
		realStore = fs.realpath(storeDir);
	} catch (err) {
		return { error: `workflow.deliveryEvidence: ${artifactId} cannot be read: ${errorText(err)}` };
	}
	const rel = relative(realStore, realFile);
	if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) return { error: 'invalid artifact id' };

	let record: ArtifactRecord;
	try {
		const lifted = liftStoreFile(fileName, JSON.parse(fs.readFile(realFile)));
		if ('reason' in lifted) return { error: `workflow.deliveryEvidence: ${artifactId} cannot be read: ${lifted.detail}` };
		record = lifted;
	} catch (err) {
		return { error: `workflow.deliveryEvidence: ${artifactId} cannot be read: ${errorText(err)}` };
	}

	return {
		artifactId,
		kind:             record.kind,
		meta:             record.meta,
		body:             record.body,
		renderedMarkdown: renderedMarkdownOf(repo, record, deps),
	};
}
