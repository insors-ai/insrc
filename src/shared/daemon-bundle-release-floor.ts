/* Copyright (c) Procix Software India. Licensed under the MIT License. */

export interface DaemonBundleReleaseFloor {
	readonly domain: 'production' | 'qualification';
	readonly channel: 'macos-arm64-pilot';
	readonly sequence: number;
	readonly manifestSha256: string;
	readonly archiveSha256: string;
}

export function readDaemonBundleReleaseFloor(value: unknown): DaemonBundleReleaseFloor {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid daemon bundle release floor');
	const row = value as Record<string, unknown>;
	const { domain, channel, sequence, manifestSha256, archiveSha256 } = row;
	if (Object.keys(row).length !== 5 || (domain !== 'production' && domain !== 'qualification')
		|| channel !== 'macos-arm64-pilot' || typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1
		|| typeof manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifestSha256)
		|| typeof archiveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(archiveSha256)) {
		throw new Error('invalid daemon bundle release floor');
	}
	return { domain, channel, sequence, manifestSha256, archiveSha256 };
}

/** New admissions never roll back this floor; restoration uses its transaction pin instead. */
export function advanceDaemonBundleReleaseFloor(
	previous: readonly DaemonBundleReleaseFloor[], proposed: DaemonBundleReleaseFloor,
): readonly DaemonBundleReleaseFloor[] {
	const next = readDaemonBundleReleaseFloor(proposed);
	const matches = (item: DaemonBundleReleaseFloor) => item.domain === next.domain && item.channel === next.channel;
	const current = previous.find(matches);
	if (current !== undefined && next.sequence <= current.sequence) {
		if (next.sequence === current.sequence && next.manifestSha256 === current.manifestSha256 &&
			next.archiveSha256 === current.archiveSha256) return previous;
		throw new Error('daemon bundle release would replay or replace an admitted sequence');
	}
	return [...previous.filter(item => !matches(item)), next];
}
