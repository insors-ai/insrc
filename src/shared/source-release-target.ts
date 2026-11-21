/* Copyright (c) Procix Software India. Licensed under the MIT License. */

/** Source qualification targets; these do not enable managed Linux bundles. */
export type SourceReleaseTarget = 'darwin' | 'linux-arm64' | 'linux-x64';

export function readSourceReleaseTarget(value: unknown = 'darwin'): SourceReleaseTarget {
	if (value !== 'darwin' && value !== 'linux-arm64' && value !== 'linux-x64') {
		throw new Error('unsupported source release qualification target');
	}
	return value;
}

export function sourceReleaseCatalog(target: SourceReleaseTarget): string {
	return target === 'darwin' ? 'release/macos-compatibility.json' : `release/${target}-compatibility.json`;
}
