/**
 * Ambient module declaration for minimatch 3.1.x, which ships no bundled
 * types and is consumed via the CommonJS default-export (`import minimatch
 * from 'minimatch'`).
 *
 * We model only the slice the meta-task fetcher uses (the callable `match`
 * function with an `options` bag). Other entry points (`Minimatch` class,
 * brace expansion, regex helpers) aren't part of our surface and are
 * deliberately omitted -- adding them later is additive.
 *
 * The dev workspace (`/Users/.../insrc-ide/node_modules/...`) hoists a
 * newer minimatch with bundled types so its tsc happens to resolve, but
 * the daemon's slim `src/insrc/node_modules` install has only minimatch
 * 3.1.5 without types. This shim makes both builds work without forcing
 * a dependency bump.
 */

declare module 'minimatch' {
	export interface MinimatchOptions {
		readonly debug?:        boolean;
		readonly nobrace?:      boolean;
		readonly noglobstar?:   boolean;
		readonly dot?:          boolean;
		readonly noext?:        boolean;
		readonly nocase?:       boolean;
		readonly nonull?:       boolean;
		readonly matchBase?:    boolean;
		readonly nocomment?:    boolean;
		readonly nonegate?:     boolean;
		readonly flipNegate?:   boolean;
		readonly partial?:      boolean;
		readonly allowWindowsEscape?: boolean;
		readonly windowsPathsNoEscape?: boolean;
	}

	function minimatch(target: string, pattern: string, options?: MinimatchOptions): boolean;
	export default minimatch;
}
