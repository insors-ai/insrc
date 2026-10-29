/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { artifactIdMarker, codeReviewArtifactId } from '../storage.js';
import type { CodeReviewArtifact, CodeReviewFallbackReason, DimensionResult } from './types.js';
import { reviewRecordGap } from './record-validation.js';
import type { ArtifactStore } from '../artifact-core/store.js';

/** Only the human-readable view is written; canonical JSON and lifecycle history stay untouched. */
export async function regenerateCodeReviewDocument(store:ArtifactStore,id:string,writeDocument:(markdown:string)=>Promise<void>):Promise<string>{
 const snapshot=await store.readHeadSnapshot(id);
 if(!snapshot)throw new Error(`No canonical review ${id}.`);
 const artifact=snapshot.head as unknown as CodeReviewArtifact;
 const gap=reviewRecordGap(artifact);
 if(gap)throw new Error(gap);
 if(id!==codeReviewArtifactId(artifact.meta.epicHash,artifact.meta.storyId))throw new Error('Canonical review identity does not match document.');
 const markdown=renderCodeReviewMd(artifact);await writeDocument(markdown);return markdown;
}
/** A minimal, deterministic markdown summary of the record — carries the
 *  `insrc:artifact` marker (so the slug-named `.md` resolves back to its
 *  hash-named `.json`), the verdict + counts, and each dimension's findings.
 *  The `.json` is load-bearing; this `.md` is for humans. */
/** One line saying why a review fell back to the diff. */
function describeFallback(r: CodeReviewFallbackReason): string {
	switch (r.kind) {
		case 'freshness-timeout':
			return `the wait for a fresh index timed out after ${Math.round(r.waitedMs / 1000)} s `
				+ `(code-index job in flight: ${r.inFlight ? 'yes' : 'no'}; queued: ${r.pendingCodeIndexJobs}; `
				+ `stale files: ${r.staleFiles.length === 0 ? 'none' : r.staleFiles.join(', ')})`;
		case 'declined':
			return 'the wait for a fresh index was declined';
		case 'hollow-grounding':
			return 'the index was fresh but held no symbols for the changed files';
	}
}

export function renderCodeReviewMd(a: CodeReviewArtifact): string {
	const gap=reviewRecordGap(a);
	if(gap)throw new Error(gap);
	const { body, meta } = a;
	const id   = codeReviewArtifactId(meta.epicHash, meta.storyId);
	const icon = body.verdict === 'block' ? '⛔' : body.verdict === 'warn' ? '⚠️' : '✅';
	const lines: string[] = [
		artifactIdMarker(id),
		'',
		`# Code review: ${meta.epicHash}:${meta.storyId}`,
		'',
		`${icon} **${body.verdict.toUpperCase()}** — HIGH ${body.counts.high} · MED ${body.counts.med} · LOW ${body.counts.low} · model \`${meta.model ?? 'unknown'}\``,
		'',
		`**Changed files:** ${body.subject.changedFiles.length}`,
		...(body.fallbackReason !== undefined ? ['', `**Reviewed on the diff:** ${describeFallback(body.fallbackReason)}`] : []),
		'',
	];
	if(body.investigation){
	 const i=body.investigation;
	 lines.push(`**Investigation:** ${i.sourceMode} (version ${i.version})`,
	  `**Operation:** \`${i.operationId}\``, `**Subject:** \`${i.subjectDigest}\``,
	  `**Checkpoint:** \`${i.checkpointDigest}\``, `**Coverage:** \`${i.coverageRef}\` (\`${i.coverageDigest}\`)`, '');
	}
	// ISSUE-11e4fa88 — findings dropped on scope are SHOWN, never counted. Every
	// line below is emitted only when something was dropped, so a record with no
	// drops renders byte-identically to before.
	const droppedTotal = body.dimensions.reduce((n, d) => n + (d.outOfScope?.length ?? 0), 0);
	if (droppedTotal > 0) {
		lines.push(
			`**Dropped as out of scope:** ${droppedTotal} finding(s) named a file outside the ${body.subject.changedFiles.length} changed file(s). ` +
			'They are listed under their dimension and are NOT counted in the verdict above.',
			'',
		);
	}
	const table = (findings: DimensionResult['findings']): void => {
		lines.push('| Severity | Location | Message |', '| --- | --- | --- |');
		for (const f of findings) {
			lines.push(`| ${f.severity} | ${escapeCell(f.location)} | ${escapeCell(f.message)} |`);
			if(f.findingId)lines.push(`| | | ${escapeCell(`Finding ${f.findingId}; confidence ${f.confidence??'unknown'}; expectations ${(f.expectationRefs??[]).join(', ')}; evidence ${(f.evidenceIds??[]).join(', ')}`)} |`);
		}
		lines.push('');
	};
	for (const dim of body.dimensions) {
		const dropped = dim.outOfScope ?? [];
		const suffix = dropped.length > 0 ? `, ${dropped.length} dropped as out of scope` : '';
		lines.push(`## ${dim.dimension} — ${dim.findings.length} finding(s)${suffix}`, '');
		if (dim.findings.length === 0) lines.push(dropped.length > 0 ? '_No findings in scope._' : '_No findings._', '');
		else table(dim.findings);
		if (dropped.length > 0) {
			lines.push('**Dropped as out of scope (not counted):**', '');
			table(dropped);
		}
	}
	return lines.join('\n') + '\n';
}

/** Escape a markdown table cell (pipes + newlines) so a finding message can't
 *  break the table layout. */
function escapeCell(s: string): string {
	return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
