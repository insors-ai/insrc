/* Copyright (c) Procix Software India. Licensed under the MIT License. */

interface BundleReleaseIdentity {
	readonly sequence: number;
	readonly manifestSha256: string;
	readonly archiveSha256: string;
}

export type DaemonBundleReleaseFloor = BundleReleaseIdentity & (
	| { readonly domain: 'production' | 'qualification'; readonly channel: 'macos-arm64-pilot' }
	| { readonly domain: 'development'; readonly channel: 'development'; readonly repository: string }
);

export function readDaemonBundleReleaseFloor(value: unknown): DaemonBundleReleaseFloor {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid daemon bundle release floor');
	const row = value as Record<string, unknown>;
	const { domain, channel, repository, sequence, manifestSha256, archiveSha256 } = row;
	if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1
		|| typeof manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifestSha256)
		|| typeof archiveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(archiveSha256)) {
		throw new Error('invalid daemon bundle release floor');
	}
	const identity = { sequence, manifestSha256, archiveSha256 };
	if (domain === 'development' && channel === 'development' && Object.keys(row).length === 6 &&
		typeof repository === 'string' && repository.length <= 2048) {
		const url = URL.parse(repository);
		if (url?.protocol === 'https:' && url.href === repository && !url.username && !url.password &&
			!url.search && !url.hash && url.pathname.length > 1) return { domain, channel, repository, ...identity };
	}
	if ((domain === 'production' || domain === 'qualification') && channel === 'macos-arm64-pilot' &&
		Object.keys(row).length === 5) return { domain, channel, ...identity };
	throw new Error('invalid daemon bundle release floor');
}

export function bundleReleaseFloorKey(floor: DaemonBundleReleaseFloor): string {
	return floor.domain === 'development' ? `development:${floor.repository}` : floor.domain;
}

/** New admissions never roll back this floor; restoration uses its transaction pin instead. */
export function advanceDaemonBundleReleaseFloor(
	previous: readonly DaemonBundleReleaseFloor[], proposed: DaemonBundleReleaseFloor,
): readonly DaemonBundleReleaseFloor[] {
	const next = readDaemonBundleReleaseFloor(proposed);
	const matches = (item: DaemonBundleReleaseFloor) => bundleReleaseFloorKey(item) === bundleReleaseFloorKey(next);
	const current = previous.find(matches);
	if (current !== undefined && next.sequence <= current.sequence) {
		if (next.sequence === current.sequence && next.manifestSha256 === current.manifestSha256 &&
			next.archiveSha256 === current.archiveSha256) return previous;
		throw new Error('daemon bundle release would replay or replace an admitted sequence');
	}
	return [...previous.filter(item => !matches(item)), next];
}
