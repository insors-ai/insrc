/**
 * The measurement of the mid-tier model's proposals against a repository's
 * hand-checked set (Epic c2ba6fa6 s10). Implemented by s10/t8.
 */

export interface DocRelationsMeasureDeps {
	readonly repoPath:    string;
	readonly setHash:     string;
	readonly shouldStop?: (() => boolean) | undefined;
}

export async function runDocRelationsMeasurement(deps: DocRelationsMeasureDeps): Promise<undefined> {
	void deps;
	return undefined;
}
