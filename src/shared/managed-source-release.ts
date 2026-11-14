/* Copyright (c) Procix Software India. Licensed under the MIT License. */

export interface VerifiedSourceRelease {
	readonly channel: { readonly repoUrl: string; readonly branch: string };
	readonly sequence: number;
	readonly tagObject: string;
	readonly commit: string;
	readonly tree: string;
}

const GIT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export function readVerifiedSourceRelease(value: unknown): VerifiedSourceRelease {
	const receipt = value as Partial<VerifiedSourceRelease> | null;
	if (receipt === null || typeof receipt !== 'object' || typeof receipt.sequence !== 'number' || !Number.isSafeInteger(receipt.sequence)
		|| receipt.sequence < 1 || typeof receipt.channel?.repoUrl !== 'string'
		|| typeof receipt.channel.branch !== 'string' || !receipt.channel.repoUrl || !receipt.channel.branch
		|| ![receipt.tagObject, receipt.commit, receipt.tree].every(id => typeof id === 'string' && GIT_ID.test(id))) {
		throw new Error('invalid verified source release receipt');
	}
	return receipt as VerifiedSourceRelease;
}

export function assertSourceReleaseFloor(release: VerifiedSourceRelease, floors: readonly VerifiedSourceRelease[]): void {
	const previous = floors.find(item => item.channel.repoUrl === release.channel.repoUrl && item.channel.branch === release.channel.branch);
	if (previous !== undefined && (previous.sequence > release.sequence
		|| (previous.sequence === release.sequence && (previous.tagObject !== release.tagObject
			|| previous.commit !== release.commit || previous.tree !== release.tree)))) {
		throw new Error('signed source release is stale or replaces an existing sequence');
	}
}
