/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The ids of the log entries the conversion records for an artifact. They are derived from the artifact id alone, so a
 * rerun finds an entry that is already there instead of adding a second one.
 */

/** The legacy facts a migrated entry can carry besides the revision-bearing one. */
export const MIGRATED_PARTS = ['approve', 'reject', 'review', 'mark-stale'] as const;
export type MigratedPart = (typeof MIGRATED_PARTS)[number];

/** `migrated-<artifact id>` (the revision-bearing entry), or `migrated-<artifact id>-<part>`. */
export function migratedEntryId(artifactId: string, part?: MigratedPart): string {
	return part === undefined ? `migrated-${artifactId}` : `migrated-${artifactId}-${part}`;
}
