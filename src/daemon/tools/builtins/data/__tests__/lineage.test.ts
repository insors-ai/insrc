/**
 * Unit tests for the lineage tool's pure helpers (Phase 3.4).
 *
 * Covers:
 *   - nameVariants: target -> ORM-friendly name forms
 *   - findFirstVariantMatch: word-boundary anchored search
 *   - classifyWindow: ORM-typed call shapes vs SQL keyword fallback
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	_nameVariantsForTest as nameVariants,
	_findFirstVariantMatchForTest as findFirstVariantMatch,
	_classifyWindowForTest as classifyWindow,
} from '../lineage.js';

describe('nameVariants', () => {
	it('lowercase + uppercase variants', () => {
		const v = new Set(nameVariants('users'));
		assert.ok(v.has('users'));
		assert.ok(v.has('USERS'));
	});

	it('singularises Rails-style plural', () => {
		const v = new Set(nameVariants('users'));
		assert.ok(v.has('user'));
	});

	it('snake_case -> PascalCase + camelCase', () => {
		const v = new Set(nameVariants('user_profile'));
		assert.ok(v.has('UserProfile'));
		assert.ok(v.has('userProfile'));
	});

	it('PascalCase -> snake_case', () => {
		const v = new Set(nameVariants('UserProfile'));
		assert.ok(v.has('user_profile'));
	});

	it('does not over-singularise short names', () => {
		const v = new Set(nameVariants('s'));
		assert.ok(!v.has(''));
	});
});

describe('findFirstVariantMatch', () => {
	it('matches the literal target with word boundaries', () => {
		const m = findFirstVariantMatch('SELECT * FROM users WHERE id = 1', ['users']);
		assert.ok(m !== null);
		assert.equal(m!.matchLen, 5);
		assert.equal(m!.idx, 14);
	});

	it('does not match within larger identifiers', () => {
		const m = findFirstVariantMatch('userspace = 1', ['users']);
		assert.equal(m, null);
	});

	it('matches PascalCase variant', () => {
		const m = findFirstVariantMatch('User.create({})', ['users', 'User']);
		assert.ok(m !== null);
		assert.equal(m!.matchLen, 4);
	});

	it('returns the earliest match', () => {
		const m = findFirstVariantMatch('User foo, then Users bar', ['Users', 'User']);
		assert.ok(m !== null);
		// The 'User' variant matches first at index 0.
		assert.equal(m!.idx, 0);
	});
});

describe('classifyWindow', () => {
	it('Prisma write: prisma.user.create()', () => {
		assert.equal(classifyWindow('await prisma.user.create({ data: { ... } })'), 'writer');
	});

	it('Prisma read: prisma.user.findUnique()', () => {
		assert.equal(classifyWindow('const u = await prisma.user.findUnique({ where: { id } })'), 'reader');
	});

	it('TypeORM write: userRepository.save()', () => {
		assert.equal(classifyWindow('await userRepository.save(user)'), 'writer');
	});

	it('TypeORM read: userRepository.findOne()', () => {
		assert.equal(classifyWindow('const u = await userRepository.findOne({ where: { id } })'), 'reader');
	});

	it('Sequelize write: User.destroy()', () => {
		assert.equal(classifyWindow('await User.destroy({ where: { id } })'), 'writer');
	});

	it('SQLAlchemy read: session.query(User)', () => {
		assert.equal(classifyWindow('users = session.query(User).filter(User.active == True).all()'), 'reader');
	});

	it('Hibernate write: session.persist(user)', () => {
		assert.equal(classifyWindow('session.persist(user)'), 'writer');
	});

	it('ActiveRecord write: User.update_all', () => {
		assert.equal(classifyWindow('User.where(active: true).update_all(plan: "pro")'), 'writer');
	});

	it('Raw SQL write: INSERT INTO users', () => {
		assert.equal(classifyWindow('db.exec("INSERT INTO users (name) VALUES (?)", [name])'), 'writer');
	});

	it('Raw SQL read: SELECT * FROM users', () => {
		assert.equal(classifyWindow('SELECT * FROM users WHERE id = ?'), 'reader');
	});

	it('does not mis-trigger on identifier substring (write)', () => {
		// `update_count` is a variable, not `.update(`
		assert.equal(classifyWindow('const update_count = 0; logger.log(update_count)'), 'ambiguous');
	});

	it('mixed write+read -> ambiguous', () => {
		assert.equal(classifyWindow('UPDATE users SET name = (SELECT name FROM ...)'), 'ambiguous');
	});

	it('no signal -> ambiguous', () => {
		assert.equal(classifyWindow('const u = users; if (u) { ... }'), 'ambiguous');
	});
});
