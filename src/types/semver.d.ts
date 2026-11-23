/**
 * Ambient module declaration for semver 7.x, which ships no bundled types.
 * Models only the slice collect-dependency-advisories.ts uses -- validating
 * and testing a version against a range -- not the package's full API
 * (comparators, Range/SemVer classes, sorting, coercion, ...).
 */

declare module 'semver' {
	export function valid(version: string): string | null;
	export function validRange(range: string): string | null;
	export function satisfies(version: string, range: string, optionsOrLoose?: boolean | { includePrerelease?: boolean; loose?: boolean }): boolean;
}
