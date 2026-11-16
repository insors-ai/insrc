/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { SelectedChangeLocator, SelectedChangeLocatorSet, SourceLightBinding } from '../../shared/review-source-light.js';
import { decodeSelectedChangeLocatorSet, sourceLightDigest } from '../../shared/review-source-light.js';
import { originalChange } from '../code-review/task-review/packet.js';
import type { PreparedReviewPacket, ReviewChange } from '../code-review/task-review/packet.js';
import type { ReviewSources } from '../code-review/task-review/sources.js';
import type { StagedPacketBlob } from './staged-packet-sources.js';

function submittedOperation(change: ReviewChange<StagedPacketBlob>): SelectedChangeLocator['operation'] {
	const origin = originalChange(change);
	if (!origin.before) return 'add';
	if (!change.after) return 'delete';
	if (origin.previousPath !== change.path) return 'rename';
	return 'modify';
}

/** Convert the validated packet to the sole durable code-source descriptor.
 * No blob body or document text is copied into this record. */
export async function selectedChangeLocators(prepared: PreparedReviewPacket<StagedPacketBlob>, binding: SourceLightBinding,
	sources: ReviewSources, maxRecordBytes: number): Promise<SelectedChangeLocatorSet> {
	const parentSets = new Map<string, readonly string[]>();
	const locators: SelectedChangeLocator[] = [];
	for (const [order, change] of prepared.changes.entries()) {
		const origin = originalChange(change);
		let parents = parentSets.get(change.commit);
		if (!parents) { parents = await sources.commit(change.commit); parentSets.set(change.commit, parents); }
		// Final-scope replacements are reviewed at the pinned final revision. Its
		// actual parent is the baseline for that final object; the original
		// submitted commit remains explicit replacement provenance.
		const projected = change.commit !== origin.commit || change.path !== origin.path || change.after?.oid !== origin.after?.oid;
		const applicableParent = projected ? parents[0] ?? null : origin.parent;
		let before = origin.before ? { path: origin.previousPath, oid: origin.before.oid } : null;
		let kind = submittedOperation(change);
		if (projected) {
			before = null;
			if (applicableParent) for (const path of [...new Set([change.path, origin.previousPath])]) {
				const baseline = await sources.file(applicableParent, path);
				if (baseline) { before = { path, oid: baseline.oid }; break; }
			}
			kind = !change.after ? 'delete' : !before ? 'add' : 'replacement';
		}
		const blocks = change.segments.map(segment => 'after' in segment && segment.after
			? { kind: 'after-range' as const, startLine: segment.after[0], endLine: segment.after[1] }
			: { kind: 'deletion' as const, atLine: 'deletionAt' in segment ? segment.deletionAt ?? 0 : 0 });
		const binary = blocks.length === 0;
		locators.push({ schemaVersion: 1, order, commit: change.commit, commitParents: [...parents], applicableParent,
			operation: kind,
			before,
			after: change.after ? { path: change.path, oid: change.after.oid } : null,
			blocks: binary ? [] : blocks, binary,
			...(kind === 'replacement' ? { replacementOf: { commit: origin.commit, path: origin.path, oid: origin.after?.oid ?? null } } : {}) });
	}
	const value: SelectedChangeLocatorSet = { schemaVersion: 1, encoding: 'source-light-locators-v1', ...binding, locators, locatorsDigest: '' };
	value.locatorsDigest = sourceLightDigest({ ...value, locatorsDigest: '' });
	return decodeSelectedChangeLocatorSet(value, binding, maxRecordBytes);
}
