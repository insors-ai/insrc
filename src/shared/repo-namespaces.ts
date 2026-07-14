/**
 * Phase 5.x strict-contract: namespace-keyed reserved Repo registry
 * rows for shared external modules. See
 * `plans/repo-registry-strict-contract.md`.
 *
 * Each `SharedModulesNamespace` maps to a single reserved registry
 * row at a stable u32 ID at the top of the address space. Module
 * entities (`kind: 'module'`) emitted by parsers carry the matching
 * reserved repoId so they're segregated by ecosystem (JVM modules
 * don't collide with Python modules of the same name) and
 * downstream queries can filter by namespace cheaply.
 *
 * Reserved IDs are allocated from the top of u32 space; workspace
 * IDs are allocated monotonically from the bottom (counter starts
 * at 1). The two ranges meet in the middle if we ever exceed 4B
 * repos -- which is structurally impossible. The
 * `WORKSPACE_REPO_ID_MAX` constant caps the workspace allocator
 * with a 16-row safety margin so a runtime allocation can never
 * collide with a reserved namespace ID.
 */

import type { Language } from './types.js';

/**
 * Initial namespaces. Adding a new ecosystem requires:
 *   1. Append to this union.
 *   2. Append to `SHARED_MODULES_REPO_ID` with the next-lower
 *      reserved ID.
 *   3. Append per-language entries to `SHARED_MODULES_NAMESPACE_BY_LANG`.
 *
 * The migration that provisions the reserved rows runs forward-only,
 * so on next daemon boot after deploy the new namespace's row gets
 * created automatically (gated by `meta.schema_version`).
 */
export type SharedModulesNamespace = 'jvm' | 'npm' | 'python' | 'go';

/**
 * Reserved u32 repoIds for the shared-modules registry rows. Top
 * of the address space; never recycled. Adding a new namespace
 * appends with the next-lower reserved ID (keep the gap downward
 * so insertion order matches the ID order). The workspace
 * allocator caps at `WORKSPACE_REPO_ID_MAX` below the lowest
 * reserved ID so collision is structurally impossible.
 */
export const SHARED_MODULES_REPO_ID: Readonly<Record<SharedModulesNamespace, number>> = {
	jvm:    0xFFFFFFFE,
	npm:    0xFFFFFFFD,
	python: 0xFFFFFFFC,
	go:     0xFFFFFFFB,
} as const;

/**
 * Upper bound for the workspace repoId allocator. 16-row safety
 * margin below the lowest reserved namespace ID. New namespaces
 * append below `0xFFFFFFFB` and this cap should track them, but
 * the safety margin makes that a soft requirement.
 */
export const WORKSPACE_REPO_ID_MAX = 0xFFFFFFF0;

/**
 * Map source-code language to its module namespace. JVM languages
 * share class-paths; npm packages share npm; Python and Go each
 * have their own resolver semantics. Languages without a module
 * concept (markdown / html / css / yaml / json / etc.) are not
 * present here -- their parsers don't emit `kind: 'module'`
 * entities.
 */
export const SHARED_MODULES_NAMESPACE_BY_LANG: Readonly<Partial<Record<Language, SharedModulesNamespace>>> = {
	java:       'jvm',
	scala:      'jvm',
	typescript: 'npm',
	javascript: 'npm',
	python:     'python',
	go:         'go',
};

/**
 * Look up the reserved repoId for a language's module namespace.
 * Returns `undefined` for languages without a module concept; the
 * caller is responsible for falling back (in practice, all parsers
 * that emit `kind: 'module'` entities are for languages that DO
 * have a namespace).
 */
export function sharedModulesRepoIdFor(language: Language): number | undefined {
	const ns = SHARED_MODULES_NAMESPACE_BY_LANG[language];
	return ns !== undefined ? SHARED_MODULES_REPO_ID[ns] : undefined;
}

/**
 * Per-namespace human-readable display name for the synthetic
 * registry rows. Used as the row's `name` field at provisioning
 * time. The IDE filters these rows from "Registered Repos" UI by
 * `kind === 'shared-modules'` -- the name only surfaces in
 * diagnostic output.
 */
export const SHARED_MODULES_NAME: Readonly<Record<SharedModulesNamespace, string>> = {
	jvm:    'shared-modules:jvm',
	npm:    'shared-modules:npm',
	python: 'shared-modules:python',
	go:     'shared-modules:go',
} as const;
