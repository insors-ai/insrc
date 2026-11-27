/** Private extension storage, separate from note files and s7 identity metadata.
 * Each window/pane keeps its latest pending record; independent origins never
 * overwrite one another. There is no automatic replay or age-based deletion. */
import { constants } from 'node:fs';
import { mkdir, lstat, open, readdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { errCode } from '../chat/async-util.js';
import { parseScratchEditorMessage, sameScratchDraft, SCRATCH_MESSAGE_BYTES, type ScratchDraftProposal } from './scratch-editor-protocol.js';

const nodeIO = { mkdir, lstat, open, readdir, rename, unlink };
export type ScratchRecoveryIO = typeof nodeIO;
export const SCRATCH_RECOVERY_BYTES = SCRATCH_MESSAGE_BYTES + 32_768;
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
// Instances in one extension host may discover/clear the same origin. Each
// real window generates a unique origin; revision files remain immutable even
// when another process explicitly discards an old recovery.
const recoveryQueues = new Map<string, Promise<unknown>>();
const validToken = (value: string): boolean => parseScratchEditorMessage({ type: 'editor-ready', paneSessionId: value }) !== undefined;
function canonicalUri(value: string): string {
  const uri = new URL(value);
  if (uri.protocol !== 'file:' || uri.search || uri.hash || uri.username || uri.password || value.length > 16_384) throw new Error('Invalid scratchpad recovery URI');
  return uri.href;
}
export interface ScratchRecoveryRecord {
  readonly schemaVersion: 1;
  readonly documentUri: string;
  readonly windowSessionId: string;
  readonly draft: ScratchDraftProposal;
}
function recordName(record: ScratchRecoveryRecord): string {
  return `${hash(record.documentUri)}-${hash(`${record.windowSessionId}\0${record.draft.paneSessionId}`)}-${hash(JSON.stringify({ type: 'draft', paneSessionId: record.draft.paneSessionId, draftSeq: record.draft.draftSeq, editId: record.draft.editId, baseVersion: record.draft.baseVersion, baseDigest: record.draft.baseDigest, parentEditId: record.draft.parentEditId, apply: record.draft.apply, markdown: record.draft.markdown }))}.json`;
}
function validRecord(value: unknown, documentUri: string): value is ScratchRecoveryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return Object.keys(r).length === 4 && r.schemaVersion === 1 && r.documentUri === documentUri &&
    typeof r.windowSessionId === 'string' && validToken(r.windowSessionId) && parseScratchEditorMessage(r.draft)?.type === 'draft';
}

export class ScratchRecoveryStore {
  private readonly root: string;
  private readonly io: ScratchRecoveryIO;
  readonly windowSessionId: string;

  constructor(root: string, options: { readonly windowSessionId?: string; readonly io?: Partial<ScratchRecoveryIO> } = {}) {
    if (!isAbsolute(root)) throw new Error('Recovery storage needs an absolute extension-owned directory');
    this.root = resolve(root); this.windowSessionId = options.windowSessionId ?? randomUUID();
    if (!validToken(this.windowSessionId)) throw new Error('Invalid recovery window session');
    this.io = { ...nodeIO, ...options.io };
  }
  private async directory(create: boolean): Promise<boolean> {
    if (create) await this.io.mkdir(this.root, { recursive: true, mode: 0o700 });
    let stat;
    try { stat = await this.io.lstat(this.root); } catch (error) { if (!create && errCode(error) === 'ENOENT') return false; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Recovery directory is not a plain directory');
    return true;
  }
  private async syncDirectory(): Promise<void> {
    // Directory fsync is supported on the qualified POSIX hosts. Windows has
    // no portable directory handle flush; file sync + atomic rename still run.
    if (process.platform === 'win32') return;
    const handle = await this.io.open(this.root, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  private async readRecord(name: string, uri: string): Promise<ScratchRecoveryRecord | undefined> {
    let handle;
    try { handle = await this.io.open(join(this.root, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) { if (errCode(error) === 'ENOENT') return undefined; throw error; }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > SCRATCH_RECOVERY_BYTES) throw new Error('Recovery record is not a bounded regular file');
      // Bound bytes independently of stat in case an external writer grows it.
      const bytes = Buffer.alloc(SCRATCH_RECOVERY_BYTES + 1);
      let size = 0;
      for (;;) {
        const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
        size += bytesRead;
        if (size > SCRATCH_RECOVERY_BYTES) throw new Error('Recovery record exceeds its byte limit');
        if (!bytesRead) break;
      }
      let record: unknown;
      try { record = JSON.parse(bytes.subarray(0, size).toString('utf8')); } catch { throw new Error('Recovery record is malformed; it was retained'); }
      if (!validRecord(record, uri) || recordName(record) !== name) throw new Error('Recovery record identity is invalid; it was retained');
      return record;
    } finally { await handle.close(); }
  }
  private serial<T>(name: string, action: () => Promise<T>): Promise<T> {
    const key = `${this.root}\0${name.slice(0, 129)}`; // document + origin, across all revisions
    const next = (recoveryQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
    recoveryQueues.set(key, next);
    void next.finally(() => { if (recoveryQueues.get(key) === next) recoveryQueues.delete(key); }).catch(() => {});
    return next;
  }
  async retain(documentUri: string, value: ScratchDraftProposal): Promise<void> {
    const uri = canonicalUri(documentUri), draft = parseScratchEditorMessage(value);
    if (draft?.type !== 'draft') throw new Error('Invalid recovery draft');
    const record: ScratchRecoveryRecord = { schemaVersion: 1, documentUri: uri, windowSessionId: this.windowSessionId, draft: { ...draft } };
    const name = recordName(record), data = Buffer.from(JSON.stringify(record), 'utf8');
    if (data.length > SCRATCH_RECOVERY_BYTES) throw new Error('Recovery record exceeds its byte limit');
    await this.serial(name, async () => {
      await this.directory(true);
      const existing = (await this.list(uri)).filter(r => r.windowSessionId === record.windowSessionId && r.draft.paneSessionId === draft.paneSessionId);
      const previous = existing[0];
      if (previous) {
        const old = previous.draft;
        const promotion = old.apply === false && draft.apply === true && old.markdown === draft.markdown && old.parentEditId !== undefined && old.parentEditId === draft.parentEditId;
        if (old.draftSeq > draft.draftSeq || old.draftSeq === draft.draftSeq && !sameScratchDraft(old, draft) && !promotion) throw new Error('Stale or conflicting recovery write');
      }
      const temporary = join(this.root, `.tmp-${randomUUID()}`);
      let published = false, created = false;
      try {
        const handle = await this.io.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
        try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
        await this.io.rename(temporary, join(this.root, name)); published = true;
        await this.syncDirectory(); // receipt cannot precede durable publication
        // Immutable revision names make stale discard/clear safe across windows.
        // Publish before pruning: a crash leaves extra recovery, never lost text.
        for (const old of existing) if (recordName(old) !== name) await this.io.unlink(join(this.root, recordName(old))).catch(error => { if (errCode(error) !== 'ENOENT') throw error; });
        await this.syncDirectory();
      } finally {
        if (created && !published) try { await this.io.unlink(temporary); } catch (error) { if (errCode(error) !== 'ENOENT') throw error; }
      }
    });
  }
  /** Read-only discovery, including records from a prior window/session. */
  async list(documentUri: string): Promise<ScratchRecoveryRecord[]> {
    const uri = canonicalUri(documentUri);
    if (!await this.directory(false)) return [];
    const prefix = `${hash(uri)}-`, records: ScratchRecoveryRecord[] = [];
    for (const name of await this.io.readdir(this.root)) {
      if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
      if (!/^[a-f0-9]{64}-[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(name)) throw new Error('Unrecognized recovery file; it was retained');
      const record = await this.readRecord(name, uri);
      if (record) records.push(record);
    }
    return records.sort((a, b) => b.draft.draftSeq - a.draft.draftSeq || Number(b.draft.apply === true) - Number(a.draft.apply === true));
  }
  async clearApplied(documentUri: string, draft: ScratchDraftProposal): Promise<boolean> {
    const record: ScratchRecoveryRecord = { schemaVersion: 1, documentUri: canonicalUri(documentUri), windowSessionId: this.windowSessionId, draft };
    return this.discard(record);
  }
  /** Caller must obtain an explicit user decision before discarding an unapplied
   * recovery. Exact comparison prevents a stale UI choice from deleting newer text. */
  async discard(expected: ScratchRecoveryRecord): Promise<boolean> {
    const uri = canonicalUri(expected.documentUri);
    if (!validRecord(expected, uri)) throw new Error('Invalid recovery discard');
    const name = recordName(expected);
    return this.serial(name, async () => {
      if (!await this.directory(false)) return false;
      const current = await this.readRecord(name, uri);
      if (!current || !sameScratchDraft(current.draft, expected.draft)) return false;
      await this.io.unlink(join(this.root, name)); await this.syncDirectory(); return true;
    });
  }
}
