/**
 * Epic c2ba6fa6, Story s9, t6 -- the Rust reader. Over the registered reader
 * (the real tree-sitter-rust grammar behind the guarded load) and the real
 * per-file resolver, against a crate laid out on disk: a .rs fixture yields
 * its items and its mod/use, call and impl relationships; `mod util;`
 * resolves to util.rs over util/mod.rs when both exist, and `crate::`,
 * `super::` and declared-module `use` paths resolve to their module files;
 * external crates are module stubs under 'cargo'; a fixture with a syntax
 * error still yields the declarations outside the broken region.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/rust.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rustParser } from '../rust.js';
import { makeEntityId } from '../base.js';
import { getParser } from '../registry.js';
import { resolveRelations } from '../../resolver.js';
import { SHARED_MODULES_REPO_ID } from '../../../shared/repo-namespaces.js';

const dir  = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s9-rust-')));
const REPO = join(dir, 'repo');
const SRC  = join(REPO, 'src');
const at = (rel: string) => join(SRC, rel);
for (const d of ['util', 'net', 'only']) mkdirSync(at(d), { recursive: true });
writeFileSync(join(REPO, 'Cargo.toml'), '[package]\nname = "demo"\n');
for (const f of ['main.rs', 'util.rs', 'util/mod.rs', 'model.rs', 'net/mod.rs', 'net/http.rs', 'only/mod.rs']) writeFileSync(at(f), '');
// A crate with both a library and a binary root.
const BOTH = join(dir, 'both', 'src');
mkdirSync(BOTH, { recursive: true });
writeFileSync(join(dir, 'both', 'Cargo.toml'), '[package]\nname = "both"\n');
for (const f of ['main.rs', 'lib.rs', 'a.rs']) writeFileSync(join(BOTH, f), '');
test.after(() => { rmSync(dir, { recursive: true, force: true }); });
const MAIN = at('main.rs');

const SOURCE = `use crate::model::{Shape, Point as P};
use util::helper;
use std::collections::HashMap;
use serde::*;
extern crate log;

mod util;
mod only;
mod gone;
pub mod inner { pub fn deep() -> u8 { 1 } }

pub struct Circle { r: f64 }
enum Kind { A, B }
union Bits { i: u32, f: f32 }

pub trait Area {
	fn area(&self) -> f64;
	fn describe() -> String { String::new() }
}

impl Area for Circle {
	fn area(&self) -> f64 { helper(); util::go(); self.r.sqrt() }
}

impl Circle {
	pub fn new(r: f64) -> Self { Circle { r } }
	fn secret(&self) {}
}

pub(crate) fn main() { let c = Circle::new(1.0); run(); }
fn run() {}
`;

assert.ok(rustParser, 'the tree-sitter-rust grammar loaded');
const parse = (file: string, source: string) => rustParser!.parse(file, source, REPO, 1);
type R = ReturnType<typeof parse>;
const of = (r: R, kind: string) => r.entities.filter(e => e.kind === kind).map(e => e.name).sort();
const ent = (r: R, name: string) => r.entities.find(e => e.name === name)!;
const rels = (r: R, kind: string) => {
	const n = new Map(r.entities.map(e => [e.id, e.name]));
	return r.relations.filter(x => x.kind === kind).map(x => `${n.get(x.from) ?? x.from} -> ${n.get(x.to) ?? x.to}`).sort();
};
/** Where each IMPORTS of `file` landed after the per-file resolver: a repo-relative file, a stub, or pending. */
function importsOf(file: string, source: string): string[] {
	const r = parse(file, source);
	const stubs = new Map(r.entities.filter(e => e.kind === 'module').map(e => [e.id, `stub ${e.name}`]));
	return resolveRelations(r.relations, file, REPO, r.entities).filter(x => x.kind === 'IMPORTS').map(x =>
		stubs.get(x.to) ?? (x.resolved ? `${String(x.meta?.['targetFile']).slice(SRC.length + 1)} (${x.evidence})` : `pending ${x.to} ${x.meta?.['class']}`)).sort();
}

test('s9 t6: a .rs fixture yields its items and its mod/use, call and impl relationships', () => {
	assert.equal(getParser(MAIN), rustParser, '.rs files are read by the Rust reader');
	const r = parse(MAIN, SOURCE);

	assert.deepEqual(of(r, 'function'), ['inner::deep', 'main', 'run']);
	assert.deepEqual(of(r, 'method'), ['Area::area', 'Area::describe', 'Circle::area', 'Circle::new', 'Circle::secret']);
	assert.deepEqual(of(r, 'class'), ['Bits', 'Circle', 'Kind']);
	assert.deepEqual(of(r, 'interface'), ['Area']);
	assert.ok(r.entities.every(e => e.language === 'rust'));

	assert.equal(ent(r, 'Circle').isExported, true);
	assert.equal(ent(r, 'Kind').isExported, false);
	assert.equal(ent(r, 'main').isExported, true, 'pub(crate) is visible to the rest of the crate');
	assert.equal(ent(r, 'run').isExported, false);
	assert.equal(ent(r, 'Circle::new').isExported, true);
	assert.equal(ent(r, 'Circle::secret').isExported, false);
	assert.equal(ent(r, 'Circle::area').isExported, true, 'a trait impl member is exported with its trait');

	const defines = rels(r, 'DEFINES');
	for (const d of ['Circle -> Circle::area', 'Circle -> Circle::new', 'Circle -> Circle::secret', 'Area -> Area::area', 'Area -> Area::describe', `${MAIN} -> inner::deep`, `${MAIN} -> Circle`]) {
		assert.ok(defines.includes(d), d);
	}
	assert.deepEqual(rels(r, 'IMPLEMENTS'), ['Circle -> Area']);
	assert.deepEqual(rels(r, 'CALLS'), ['Area::describe -> String::new', 'Circle::area -> helper', 'Circle::area -> util::go', 'main -> Circle::new', 'main -> run']);

	const stub = r.entities.find(e => e.id === makeEntityId('cargo', '', 'module', 'serde'));
	assert.equal(stub?.repoId, SHARED_MODULES_REPO_ID.cargo);
	assert.deepEqual(of(r, 'module'), ['log', 'serde', 'std']);
});

test('s9 t6: mod util; resolves to util.rs over util/mod.rs when both exist; crate, declared-module and super paths resolve to their module files; a missing module stays pending', () => {
	assert.deepEqual(importsOf(MAIN, SOURCE), [
		'model.rs (extracted)',            // crate::model::Shape and crate::model::Point: one path each, the
		'model.rs (extracted)',            // same file (the store keys an edge by from/kind/to, so they are one edge)
		'only/mod.rs (extracted)',         // mod only; -- no only.rs
		'pending self::gone no-candidate', // mod gone; -- no file
		'stub log', 'stub serde', 'stub std',
		'util.rs (extracted)',             // mod util; and use util::helper -- util.rs over util/mod.rs
		'util.rs (extracted)',
	]);
	assert.deepEqual(importsOf(at('net/http.rs'), 'use super::Client;\nuse crate::Config;\nuse crate::net::http::Thing;\nuse self::deep::X;\n'), [
		'main.rs (extracted)',             // crate::Config -- an item of the crate root
		'net/mod.rs (extracted)',          // super::Client -- an item of the parent module
		'pending crate::net::http::Thing no-candidate', // the longest module file is the importing file itself
		'pending self::deep::X no-candidate',
	], 'a path to the importing file itself is not linked');

	// In a crate with lib.rs and main.rs, a root file's own items are not the other root's.
	const both = (rel: string, source: string) => {
		const file = join(BOTH, rel);
		const r = parse(file, source);
		return resolveRelations(r.relations, file, join(dir, 'both'), r.entities).filter(x => x.kind === 'IMPORTS')
			.map(x => x.resolved ? String(x.meta?.['targetFile']).slice(BOTH.length + 1) : `pending ${x.to}`).sort();
	};
	assert.deepEqual(both('main.rs', 'use crate::Config;\nuse self::Thing;\n'), ['pending crate::Config', 'pending self::Thing']);
	assert.deepEqual(both('a.rs', 'use crate::Config;\n'), ['lib.rs']);
});

test('s9 t6: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked', () => {
	const r = parse(MAIN, `pub struct Ok { a: u8 }
fn before() -> u8 { 1 }
fn broken() -> u8 { 1 + ; @@ }
fn after(x: u8) -> u8 { before() + x }
`);
	assert.equal(r.entities.find(e => e.kind === 'file')!.signature, 'parse-error');
	assert.deepEqual(of(r, 'function'), ['after', 'before', 'broken']);
	assert.deepEqual(of(r, 'class'), ['Ok']);
	assert.ok(rels(r, 'CALLS').includes('after -> before'), 'the call after the broken region is read');
});
