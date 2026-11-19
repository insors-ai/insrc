import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import type { Pointer, Scope } from '../types.js';
import { validateCodeScope, validateDesignScope } from '../scope-checks.js';

const pointer = (path: string): Pointer => ({ path });

describe('validateDesignScope and validateCodeScope', () => {
	it('are exported with their documented signatures and enforce the field-presence table and sc6 path validation, with no file I/O', (t) => {
		const fsSpies = (['readFileSync', 'statSync', 'lstatSync', 'existsSync', 'accessSync', 'readdirSync'] as const)
			.map((name) => t.mock.method(fs, name, () => { throw new Error(`${name} must not be called -- these functions do no I/O`); }));

		const minimalDesign: Scope = { scopeType: 'design', scopeLevel: 'def', def: pointer('DEF.md') };
		assert.equal(validateDesignScope(minimalDesign).ok, true);

		// scopeLevel is one unified chain (def < hld < lld < plan < task): a code review at
		// 'plan' self-inclusively covers every design ancestor too, not just plan itself.
		const minimalCode: Scope = {
			scopeType: 'code', scopeLevel: 'plan',
			def: pointer('DEF.md'), hld: pointer('HLD.md'), lld: pointer('LLD.md'), plan: pointer('PLAN.md'),
		};
		assert.equal(validateCodeScope(minimalCode).ok, true);

		for (const spy of fsSpies) assert.equal(spy.mock.calls.length, 0);
	});

	it("validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType", () => {
		const codeScope: Scope = { scopeType: 'code', scopeLevel: 'plan', plan: pointer('PLAN.md') };
		const designResult = validateDesignScope(codeScope);
		assert.equal(designResult.ok, false);
		assert.match(designResult.violations.join(' '), /scopeType/);

		const designScope: Scope = { scopeType: 'design', scopeLevel: 'def', def: pointer('DEF.md') };
		const codeResult = validateCodeScope(designScope);
		assert.equal(codeResult.ok, false);
		assert.match(codeResult.violations.join(' '), /scopeType/);
	});

	it("validateDesignScope returns ok:false when scopeLevel='hld' but hld is absent while def is populated", () => {
		const scope: Scope = { scopeType: 'design', scopeLevel: 'hld', def: pointer('DEF.md') };
		const result = validateDesignScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /'hld' is required/);
	});

	it("validateDesignScope returns ok:true when scopeLevel='hld' and both def and hld are populated", () => {
		const scope: Scope = { scopeType: 'design', scopeLevel: 'hld', def: pointer('DEF.md'), hld: pointer('HLD.md') };
		assert.equal(validateDesignScope(scope).ok, true);
	});

	it('validateCodeScope returns ok:false when a field deeper than scopeLevel is populated', () => {
		const scope: Scope = {
			scopeType: 'code', scopeLevel: 'plan',
			def: pointer('DEF.md'), hld: pointer('HLD.md'), lld: pointer('LLD.md'), plan: pointer('PLAN.md'),
			tasks: [pointer('TASK.md')],
		};
		const result = validateCodeScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /'tasks' must be absent/);
	});

	it('validateCodeScope returns ok:false when scope.tasks is an empty array at a scopeLevel requiring tasks', () => {
		const scope: Scope = {
			scopeType: 'code', scopeLevel: 'task',
			def: pointer('DEF.md'), hld: pointer('HLD.md'), lld: pointer('LLD.md'), plan: pointer('PLAN.md'),
			tasks: [],
		};
		const result = validateCodeScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /'tasks' is required/);
	});

	it('a validator returns ok:false naming the (scopeType, scopeLevel) combination itself as invalid when no requirement-table entry exists for it', () => {
		const scope: Scope = { scopeType: 'design', scopeLevel: 'task' };
		const result = validateDesignScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /not a valid combination/);
	});

	it('extension and amendment populated or absent independent of scopeLevel do not affect ok/violations', () => {
		const withExtras: Scope = { scopeType: 'design', scopeLevel: 'def', def: pointer('DEF.md'), extension: pointer('EXT.md'), amendment: pointer('AMD.md') };
		assert.equal(validateDesignScope(withExtras).ok, true);
	});

	it('validateDesignScope returns ok:false with a named violation when a populated Pointer-typed field\'s path escapes registeredRepoRoot', () => {
		const scope: Scope = { scopeType: 'design', scopeLevel: 'def', def: pointer('../../etc/passwd') };
		const result = validateDesignScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /etc\/passwd/);
	});

	it('validateCodeScope returns ok:false with a named violation when a populated Pointer-typed field\'s path escapes registeredRepoRoot', () => {
		const scope: Scope = {
			scopeType: 'code', scopeLevel: 'plan',
			def: pointer('DEF.md'), hld: pointer('HLD.md'), lld: pointer('LLD.md'), plan: pointer('../../etc/passwd'),
		};
		const result = validateCodeScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /etc\/passwd/);
	});

	it('validateDesignScope returns ok:false when scope.plan or scope.tasks is populated, even at scopeLevel=\'def\'', () => {
		const scope: Scope = { scopeType: 'design', scopeLevel: 'def', def: pointer('DEF.md'), plan: pointer('PLAN.md'), tasks: [pointer('TASK.md')] };
		const result = validateDesignScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /'plan' must be absent/);
		assert.match(result.violations.join(' '), /'tasks' must be absent/);
	});

	it('an escaping path that reuses a path segment name does not slip through', () => {
		// Regression: an earlier implementation checked escapes against a fixed synthetic anchor,
		// which a path crafted to reuse the anchor's own segment name could bypass.
		const scope: Scope = { scopeType: 'design', scopeLevel: 'def', def: pointer('../scope-validator-anchor/file') };
		const result = validateDesignScope(scope);
		assert.equal(result.ok, false);
		assert.match(result.violations.join(' '), /scope-validator-anchor\/file/);
	});
});
