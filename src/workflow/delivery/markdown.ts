/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery read model's markdown port (E1 s5): where each record's rendered
 * .md lives under docs/, and whether it starts with that record's marker.
 *
 * Most BUILD and CR records stamp no epicSlug or epicCreatedAt, so the path is
 * found from the work-item graph rather than the record's own meta: the item
 * holding the record gives its epic segment (the canonical id before any ':')
 * and, for a story, its S<nnn> folder, and the docs/ work-item folder named
 * '<slug>-<epicSegment>' is the root. workflow.pending's own derivation from the
 * record's meta is the second candidate (a SPEC, say, lives in its own folder).
 * The first candidate that exists and passes workflow.artifactContent's docs/
 * containment rule is the record's markdown; only its first 512 bytes are read.
 * Never writes, never throws.
 */

import { closeSync, openSync, readSync } from 'node:fs';
import { basename, join } from 'node:path';

import { resolveDocsMarkdown } from '../artifact-content.js';
import { isStoryScopedKind, listWorkItems, type ArtifactKind } from '../path-scheme.js';
import { deriveMdPath } from '../pending.js';
import type { ArtifactRecord, DeliveryMarkdownPort, WorkItemGraph, WorkItemNode } from './types.js';

const MD_KINDS: ReadonlySet<string> = new Set<ArtifactKind>(['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'BUILD', 'CR', 'EXT', 'ISSUE']);
const HEAD_BYTES = 512;

/** '<slug>-E<yyyymmdd><hash8>' folder name -> its epic segment. */
const FOLDER_SEGMENT_RE = /-(E\d{8}[0-9a-f]{8})$/;
/** The story folder of a canonical story id, e.g. 'E20261007aaaaaaaa:S001' -> 'S001'. */
const STORY_SEGMENT_RE = /:(S\d{3,})$/;

/** The first line of the file, from at most its first HEAD_BYTES bytes; null on any read error. */
function firstLine(path: string): string | null {
	let fd: number | undefined;
	try {
		fd = openSync(path, 'r');
		const buf = Buffer.alloc(HEAD_BYTES);
		const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
		const head = buf.subarray(0, n).toString('utf8');
		const nl = head.indexOf('\n');
		return (nl < 0 ? head : head.slice(0, nl)).replace(/\r$/, '');
	} catch {
		return null;
	} finally {
		if (fd !== undefined) {
			try { closeSync(fd); } catch { /* already closed */ }
		}
	}
}

/** The port for one request: the docs/ folders are listed once, here. */
export function createMarkdownPort(repoPath: string, graph: WorkItemGraph): DeliveryMarkdownPort {
	const folders = new Map<string, string>();
	try {
		for (const location of listWorkItems(repoPath)) {
			const m = FOLDER_SEGMENT_RE.exec(basename(location.root));
			if (m?.[1] !== undefined && !folders.has(m[1])) folders.set(m[1], location.root);
		}
	} catch {
		// An unreadable docs/ tree leaves only the meta-derived candidate.
	}

	const holders = new Map<string, WorkItemNode[]>();
	for (const item of graph.items.values()) {
		for (const id of item.evidenceArtifactIds) {
			const list = holders.get(id);
			if (list === undefined) holders.set(id, [item]);
			else list.push(item);
		}
	}

	/** The path under the folder of the item that holds the record, or null. */
	const folderPath = (record: ArtifactRecord, kind: ArtifactKind): string | null => {
		const storyScoped = isStoryScopedKind(kind);
		const items = holders.get(record.artifactId) ?? [];
		const holder = items.find(n => (storyScoped ? n.kind === 'story' : n.kind === 'epic' || n.kind === 'issue'));
		if (holder === undefined) return null;
		const segment = holder.id.split(':')[0] ?? '';
		const root = folders.get(segment);
		if (root === undefined) return null;
		if (!storyScoped) return join(repoPath, root, `${kind}.md`);
		const story = STORY_SEGMENT_RE.exec(holder.id)?.[1];
		return story === undefined ? null : join(repoPath, root, story, `${kind}.md`);
	};

	return {
		markdownOf(record) {
			if (!MD_KINDS.has(record.kind)) return null;
			const kind = record.kind as ArtifactKind;
			let derived = '';
			try { derived = deriveMdPath(repoPath, kind, record.meta); } catch { derived = ''; }
			const candidates = [folderPath(record, kind), derived.length > 0 ? derived : null]
				.filter((p): p is string => p !== null);
			for (const mdPath of [...new Set(candidates)]) {
				const located = resolveDocsMarkdown(repoPath, mdPath);
				if ('reason' in located) continue;
				const line = firstLine(located.realPath);
				if (line === null) continue;
				return { mdPath, hasMarker: line.trim() === `<!-- insrc:artifact ${record.artifactId} -->` };
			}
			return null;
		},
	};
}
