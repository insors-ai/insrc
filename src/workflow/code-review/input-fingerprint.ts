/**
 * Review input canonicalization v1.
 * Object keys sort recursively; array order and every TESTS timestamp are retained.
 * BUILD excludes exactly meta.approvedAt, rejectedAt, rejectReason and reviewOverride.
 * No body, author, rangeBase, task, revision or general timestamp is excluded.
 * No fingerprint-derived approval audit fields exist in v1's BUILD writer.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { ReviewBlockedError, ArtifactMissingError, ArtifactNotApprovedError, requireApprovedLld, requireApprovedPlan } from '../gates.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, testsArtifactId } from '../storage.js';
import { LEDGER_EXCLUDE_GLOBS } from '../runners/build/changed-files.js';
import { resolveStoryRangeBase } from '../runners/build/range-base.js';
import { storyChangeSet } from '../runners/build/story-commits.js';
import { testRecordState } from '../runners/build/test-record.js';
import type { BuildRecord } from '../runners/build/standalone-record.js';
import { authorPartyOf } from '../review/party.js';
import { testRecordView } from './dimensions/test-record-view.js';
import type { CodeReviewSubject, ReviewInputFingerprint } from './types.js';

export const REVIEW_INPUT_SCHEMA_VERSION = 1;
export const BUILD_APPROVAL_IDENTITY_EXCLUSIONS = Object.freeze(['approvedAt', 'rejectedAt', 'rejectReason', 'reviewOverride'] as const);
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function canonicalReviewJson(value: unknown): string {
 const encoded = JSON.stringify(value, (_key, v: unknown) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
 if (encoded === undefined) throw new ReviewInputUnavailableError('Input has no canonical JSON representation');
 return encoded;
}
export function canonicalReviewBuild(value: unknown): unknown {
 if (!object(value) || !object(value['meta'])) return value;
 const meta = { ...value['meta'] };
 for (const key of BUILD_APPROVAL_IDENTITY_EXCLUSIONS) delete meta[key];
 return { ...value, meta };
}
export class ReviewInputUnavailableError extends Error {
 readonly code = 'review-input-unavailable';
 constructor(message: string) { super(message); this.name = 'ReviewInputUnavailableError'; }
}
export class ReviewInputChangedError extends Error {
 readonly code = 'review-input-changed';
 constructor() { super('Review inputs changed during capture; restart the independent review'); this.name = 'ReviewInputChangedError'; }
}

/** Bounded capture refuses output overflow; it never hashes a truncated subprocess result. */
function git(repo: string, args: readonly string[]): Buffer {
 try { return execFileSync('git', [...args], { cwd: repo, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); }
 catch { throw new ReviewInputUnavailableError(`Cannot read complete git identity (${args[0] ?? 'git'})`); }
}
const paths = (buffer: Buffer): string[] => buffer.toString('utf8').split('\0').filter(Boolean);
const exclusions = LEDGER_EXCLUDE_GLOBS.map(g => `:(exclude,glob)${g}`);
function optionalContract<T>(read: () => T): T | null {
 try { return read(); } catch (err) { if (err instanceof ArtifactMissingError || err instanceof ArtifactNotApprovedError) return null; throw err; }
}
function rawFile(path: string): Buffer | null {
 try { return readFileSync(path); }
 catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new ReviewInputUnavailableError(`Cannot read review input ${path}`); }
}
function testsInput(repo: string, epic: string, story: string): { identity: unknown; record: CodeReviewSubject['testRecord'] } {
 const path = artifactJsonPath(repo, testsArtifactId(epic, story)), before = rawFile(path);
 const state = testRecordState(repo, epic, story), after = rawFile(path);
 if ((before === null) !== (after === null) || (before !== null && after !== null && !before.equals(after))) throw new ReviewInputChangedError();
 if (state.kind === 'absent') { if (before !== null) throw new ReviewInputChangedError(); return { identity: { kind: 'absent' }, record: null }; }
 if (before === null) throw new ReviewInputChangedError();
 let parsed: unknown;
 try { parsed = JSON.parse(before.toString('utf8')); }
 catch { if (state.kind === 'record') throw new ReviewInputChangedError(); return { identity: { kind: 'unreadable', reason: 'invalid-json', rawDigest: hash(before) }, record: null }; }
 if (state.kind === 'record') {
  if (canonicalReviewJson(parsed) !== canonicalReviewJson(state.record)) throw new ReviewInputChangedError();
  if (state.record.meta.epicHash !== epic || state.record.meta.storyId !== story) throw new ReviewInputUnavailableError('TESTS target identity conflicts with its canonical path');
  return { identity: { kind: 'record', record: parsed }, record: state.record };
 }
 if (state.reason !== "it does not have the record's shape") throw new ReviewInputUnavailableError('TESTS could not be read consistently');
 return { identity: { kind: 'unreadable', reason: 'invalid-shape', rawDigest: hash(before) }, record: null };
}
function sourceFile(repo: string, path: string): unknown {
 const absolute = resolve(repo, path), rel = relative(repo, absolute);
 if (isAbsolute(path) || rel === '..' || rel.startsWith('../')) throw new ReviewInputUnavailableError('Reviewed path escapes the repository');
 try {
  const stat = lstatSync(absolute);
  const parent = relative(repo, realpathSync(dirname(absolute)));
  if (parent === '..' || parent.startsWith('../') || isAbsolute(parent)) throw new ReviewInputUnavailableError('Reviewed path traverses an external directory');
  if (stat.isSymbolicLink()) return { path, kind: 'symlink', mode: stat.mode & 0o777, target: readlinkSync(absolute) };
  if (!stat.isFile()) throw new ReviewInputUnavailableError(`Reviewed path is not a regular file: ${path}`);
  return { path, kind: 'file', mode: stat.mode & 0o777, contentDigest: hash(readFileSync(absolute)) };
 } catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { path, kind: 'absent' }; throw err; }
}
interface Capture { readonly fingerprint: ReviewInputFingerprint; readonly subject: CodeReviewSubject }
function readOnce(repoPath: string, epicHash: string, storyId: string): Capture {
 const repo = realpathSync(repoPath);
 if (realpathSync(git(repo, ['rev-parse', '--show-toplevel']).toString('utf8').trim()) !== repo) throw new ReviewInputUnavailableError('Review repository must be its git root');
 const head = git(repo, ['rev-parse', '--verify', 'HEAD']).toString('utf8').trim();
 const base = resolveStoryRangeBase(repo, epicHash, storyId);
 if (base === undefined) throw new ReviewInputUnavailableError('Review has no anchored Story range');
 const changes = storyChangeSet(repo, base, { storyKey: `${epicHash}/${storyId}`, strict: true });
 const ranged = new Set<string>();
 if (changes.perUnit) for (const unit of changes.units) for (const p of paths(git(repo, ['diff', '--name-only', '-z', '--find-renames', unit.from, unit.to, '--', ...exclusions]))) ranged.add(p);
 else {
  const own = new Set(changes.paths);
  for (const p of paths(git(repo, ['diff', '--name-only', '-z', '--find-renames', base, 'HEAD', '--', ...exclusions]))) if (own.has(p)) ranged.add(p);
 }
 const working = new Set<string>();
 for (const staged of [false, true]) for (const p of paths(git(repo, ['diff', ...(staged ? ['--cached'] : []), '--name-only', '-z', '--find-renames', '--', ...exclusions]))) working.add(p);
 const own = new Set(changes.paths);
 for (const p of working) if (own.has(p)) ranged.add(p);
 const changedFiles = [...ranged];
 if (changedFiles.length === 0) throw new ReviewInputUnavailableError('No attributable source to fingerprint');
 const buildBytes = rawFile(artifactJsonPath(repo, buildArtifactId(epicHash, storyId)));
 if (buildBytes === null) throw new ReviewInputUnavailableError('No BUILD identity to fingerprint');
 const build = JSON.parse(buildBytes.toString('utf8')) as BuildRecord;
 if (!object(build) || !object(build.meta) || build.meta.workflow !== 'build' || build.meta.epicHash !== epicHash || build.meta.storyId !== storyId || !object(build.body)) throw new ReviewInputUnavailableError('Invalid BUILD target identity');
 const approvedLld = optionalContract(() => requireApprovedLld(repo, epicHash, storyId));
 const approvedPlan = optionalContract(() => requireApprovedPlan(repo, epicHash, storyId));
 const tests = testsInput(repo, epicHash, storyId);
 const subject: CodeReviewSubject = { repoPath: repo, epicHash, storyId, changedFiles, approvedLld, approvedPlan, buildRecord: build, testRecord: tests.record, changeSetAttribution: changes.attribution, sharedWithExcluded: changes.sharedWithExcluded.filter(p => ranged.has(p)), excludedFromScope: [...working].filter(p => !own.has(p)).sort() };
 const literals = changedFiles.map(p => `:(literal)${p}`);
 const diffArgs = ['--raw', '--patch', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames'];
 const diffs = changes.perUnit ? changes.units.map(unit => ({ kind: unit.kind, from: unit.from, to: unit.to, digest: hash(git(repo, ['diff', ...diffArgs, unit.from, unit.to, '--', ...literals])) })) : [{ kind: 'range', from: base, to: head, digest: hash(git(repo, ['diff', ...diffArgs, base, 'HEAD', '--', ...literals])) }];
 const workingDiffs = [false, true].map(staged => hash(git(repo, ['diff', ...diffArgs, ...(staged ? ['--cached'] : []), '--', ...literals])));
 const payload = { schemaVersion: REVIEW_INPUT_SCHEMA_VERSION, repoPath: repo, epicHash, storyId, author: authorPartyOf(build.meta),
  sourceDigest: hash(canonicalReviewJson({ base, head, attribution: changes.attribution, units: changes.units.map(u => ({ kind: u.kind, from: u.from, to: u.to })), changedFiles, diffs, workingDiffs, files: changedFiles.map(p => sourceFile(repo, p)) })),
  contractDigest: hash(canonicalReviewJson({ approvedLld, approvedPlan })), buildDigest: hash(canonicalReviewJson(canonicalReviewBuild(build))),
  testsDigest: hash(canonicalReviewJson({ state: tests.identity, view: testRecordView(subject) })),
 } as const;
 return { subject, fingerprint: Object.freeze({ ...payload, digest: hash(canonicalReviewJson(payload)) }) };
}

/** Two complete reads prevent admitting a mixture of different source/record versions. */
export function readReviewInputSnapshot(repo: string, epic: string, story: string, afterFirstRead?: () => void): Capture {
 try {
  if (!/^[a-f0-9]{16}$/.test(epic) || !/^s[0-9]+$/i.test(story) || Number(story.slice(1)) <= 0) throw new ReviewInputUnavailableError('Invalid review target identity');
  const first = readOnce(repo, epic, story); afterFirstRead?.();
  const second = readOnce(repo, epic, story);
  if (first.fingerprint.digest !== second.fingerprint.digest) throw new ReviewInputChangedError();
  return second;
 } catch (err) {
  if (err instanceof ReviewInputChangedError || err instanceof ReviewInputUnavailableError) throw err;
  throw new ReviewInputUnavailableError(err instanceof Error ? err.message : String(err));
 }
}
function subjectEvidence(subject: CodeReviewSubject): unknown {
 return { changedFiles: subject.changedFiles, approvedLld: subject.approvedLld, approvedPlan: subject.approvedPlan, build: canonicalReviewBuild(subject.buildRecord), tests: subject.testRecord ?? null };
}
/** Admission also binds persisted record/contract evidence to the already resolved subject. */
export function captureReviewInputFingerprint(subject: CodeReviewSubject): ReviewInputFingerprint {
 const captured = readReviewInputSnapshot(subject.repoPath, subject.epicHash, subject.storyId);
 if (canonicalReviewJson(subjectEvidence(subject)) !== canonicalReviewJson(subjectEvidence(captured.subject))) throw new ReviewInputChangedError();
 return captured.fingerprint;
}
export function isReviewInputFingerprint(value: unknown): value is ReviewInputFingerprint {
 if (!object(value) || value['schemaVersion'] !== REVIEW_INPUT_SCHEMA_VERSION || typeof value['repoPath'] !== 'string' || !isAbsolute(value['repoPath']) || typeof value['epicHash'] !== 'string' || !/^[a-f0-9]{16}$/.test(value['epicHash']) || typeof value['storyId'] !== 'string' || !/^s[0-9]+$/i.test(value['storyId']) || typeof value['author'] !== 'string' || !['controller', 'daemon', 'unknown'].includes(value['author'])) return false;
 for (const key of ['digest', 'sourceDigest', 'contractDigest', 'buildDigest', 'testsDigest']) if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key])) return false;
 const { digest, ...payload } = value;
 return digest === hash(canonicalReviewJson(payload));
}
export type ReviewInputComparison = { readonly status: 'fresh' } | { readonly status: 'stale-review'; readonly reason: 'invalid' | 'unavailable' | 'mismatch'; readonly message: string };
export function compareReviewInputFingerprint(recorded: unknown, repo: string, epic: string, story: string): ReviewInputComparison {
 if (!isReviewInputFingerprint(recorded)) return { status: 'stale-review', reason: 'invalid', message: 'Invalid or unsupported review input fingerprint; run a new independent review' };
 try {
  const current = readReviewInputSnapshot(repo, epic, story).fingerprint;
  return current.digest === recorded.digest ? { status: 'fresh' } : { status: 'stale-review', reason: 'mismatch', message: 'Review inputs changed; run a new independent review' };
 } catch { return { status: 'stale-review', reason: 'unavailable', message: 'Current review input identity is unavailable; run a new independent review' }; }
}

/** Early publication-safety guard; task20 supplies the full approval outcome/race contract. */
export function assertStoredReviewInputCurrent(repo: string, epic: string, story: string): void {
 const path = artifactJsonPath(repo, codeReviewArtifactId(epic, story));
 if (!existsSync(path)) return;
 let record: unknown;
 try { record = JSON.parse(readFileSync(path, 'utf8')); } catch { return; } // genuine legacy malformed-record policy
 const meta = object(record) && object(record['meta']) ? record['meta'] : undefined;
 if (meta === undefined) return;
 const hasFingerprint = Object.hasOwn(meta, 'reviewInputFingerprint'), hasVersion = Object.hasOwn(meta, 'reviewInputSchemaVersion');
 if (!hasFingerprint && !hasVersion) return;
 const checked = !hasFingerprint || !hasVersion || meta['reviewInputSchemaVersion'] !== REVIEW_INPUT_SCHEMA_VERSION
  ? { status: 'stale-review' as const, message: 'Invalid or partial review identity; run a new independent review' }
  : compareReviewInputFingerprint(meta['reviewInputFingerprint'], repo, epic, story);
 if (checked.status !== 'fresh') throw new ReviewBlockedError(`stale-review: ${checked.message}`, 'stale-review');
}
