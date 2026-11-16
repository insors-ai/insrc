/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import type { OriginDisposition, ReviewedSegment } from "./final-scope-contracts.js";
/** Hash excludes blob bodies and redundant identity; shared by offline readers. */
export function projectionIdentity(revision: string, reviewSet: unknown, entries: readonly {
    originChangeIndex: number;
    path: string;
    blobOid: string | null;
    findingScope: 'selected' | 'none';
    segments: readonly ReviewedSegment[];
}[], dispositions: readonly OriginDisposition[]): string {
    return createHash('sha256').update(JSON.stringify({ revision, reviewSet, entries, dispositions })).digest('hex');
}
