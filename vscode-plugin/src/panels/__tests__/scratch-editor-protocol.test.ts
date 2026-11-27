import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScratchEditorMessage, parseScratchHostMessage, scratchUtf8Bytes,
  SCRATCH_NOTE_BYTES, SCRATCH_MESSAGE_BYTES, SCRATCH_IMAGE_BYTES,
} from '../scratch-editor-protocol.js';

const session = { paneSessionId: 'pane_1' };
const state = { version: 1, digest: 'a'.repeat(64), markdown: '# Note\n' };
const draft = { ...session, type: 'draft', draftSeq: 1, editId: 'edit_1', baseVersion: 1, baseDigest: state.digest, markdown: state.markdown };

test('scratch editor protocol accepts every declared variant and rejects extra keys across channels', () => {
  const incoming = [
    { ...session, type: 'editor-ready' }, draft, { ...draft, parentEditId: 'edit_0' },
    { ...session, type: 'send-selection', draftSeq: 0, docVersion: 1, selectedText: 'one\n\ntwo' },
    { ...session, type: 'lock', locked: true },
    ...['undo', 'redo', 'save'].map(type => ({ ...session, type, draftSeq: 0, docVersion: 1 })),
    ...['pick-link', 'pick-image'].map(action => ({ ...session, type: 'asset-request', requestId: 'r1', action })),
    { ...session, type: 'asset-request', requestId: 'r1', action: 'upload-image', name: 'a.png', mediaType: 'image/png', dataBase64: 'eA==' },
  ];
  const outgoing = [
    { ...session, ...state, type: 'document-state', locked: true },
    { ...session, type: 'receipt', draftSeq: 1, editId: 'edit_1' },
    { ...session, ...state, type: 'apply-ack', draftSeq: 1, editId: 'edit_1' },
    { ...session, type: 'conflict', draftSeq: 1, message: 'Stale draft retained.' },
    { ...session, type: 'recovery', draftSeq: 1, markdown: 'recover me' },
    { ...session, type: 'asset-result', requestId: 'r1', href: 'assets/a.png', displayUrl: 'https://example.test/a.png' },
    { ...session, type: 'action-error', requestId: 'r1', message: 'Cancelled' },
  ];
  for (const msg of incoming) {
    assert.deepEqual(parseScratchEditorMessage(msg), msg);
    assert.equal(parseScratchEditorMessage({ ...msg, path: '/etc/passwd' }), undefined);
    assert.equal(parseScratchHostMessage(msg), undefined);
  }
  for (const msg of outgoing) {
    assert.deepEqual(parseScratchHostMessage(msg), msg);
    assert.equal(parseScratchHostMessage({ ...msg, command: 'execute' }), undefined);
    assert.equal(parseScratchEditorMessage(msg), undefined);
  }
});

test('scratch editor protocol rejects invalid sessions, ancestry, versions and malformed payloads', () => {
  for (const value of [null, [], 7, 'draft', {}, { ...draft, type: 'scratch-save' },
    { ...draft, paneSessionId: '../other' }, { ...draft, paneSessionId: '' },
    { ...draft, draftSeq: 0 }, { ...draft, draftSeq: NaN }, { ...draft, draftSeq: 1.5 },
    { ...draft, baseVersion: 0 }, { ...draft, baseVersion: Infinity },
    { ...draft, baseDigest: 'not-a-digest' }, { ...draft, editId: '' },
    { ...draft, parentEditId: 3 }, { ...draft, apply: 'yes' }, { ...draft, markdown: null }, { ...draft, markdown: '\ud800' },
    Object.assign(Object.create({ hidden: true }), draft),
    { ...session, type: 'send-selection', draftSeq: 0, docVersion: 1, selectedText: '' },
    { ...session, type: 'save', draftSeq: -1, docVersion: 1 },
  ]) assert.equal(parseScratchEditorMessage(value), undefined);
  assert.equal(parseScratchHostMessage({ ...session, ...state, type: 'document-state', locked: 'yes' }), undefined);
  assert.equal(parseScratchHostMessage({ ...session, type: 'conflict', draftSeq: 1, message: 'x'.repeat(4097) }), undefined);
});

test('scratch editor protocol enforces UTF-8 note and encoded message bounds without truncation', () => {
  const limit = 'x'.repeat(SCRATCH_NOTE_BYTES);
  assert.equal(parseScratchEditorMessage({ ...draft, markdown: limit })?.type, 'draft');
  assert.equal(parseScratchEditorMessage({ ...draft, markdown: limit + 'x' }), undefined);
  const unicode = '😀'.repeat(SCRATCH_NOTE_BYTES / 4);
  assert.equal(scratchUtf8Bytes(unicode), SCRATCH_NOTE_BYTES);
  assert.ok(parseScratchEditorMessage({ ...draft, markdown: unicode }));
  assert.equal(parseScratchEditorMessage({ ...draft, markdown: unicode + 'é' }), undefined);
  // Raw note fits but JSON control-character escapes exceed the ordinary wire cap.
  const escaped = { ...draft, markdown: '\u0000'.repeat(SCRATCH_NOTE_BYTES) };
  assert.ok(scratchUtf8Bytes(JSON.stringify(escaped)) > SCRATCH_MESSAGE_BYTES);
  assert.equal(parseScratchEditorMessage(escaped), undefined);
  assert.equal(parseScratchHostMessage({ ...session, ...state, type: 'document-state', locked: true, markdown: unicode + 'x' }), undefined);
});

test('scratch editor assets have a separate decoded image bound and reject malformed upload actions', () => {
  const upload = { ...session, type: 'asset-request', requestId: 'r1', action: 'upload-image', name: 'photo.png', mediaType: 'image/png', dataBase64: Buffer.alloc(SCRATCH_IMAGE_BYTES).toString('base64') };
  assert.ok(scratchUtf8Bytes(JSON.stringify(upload)) > SCRATCH_MESSAGE_BYTES);
  assert.ok(parseScratchEditorMessage(upload));
  assert.equal(parseScratchEditorMessage({ ...upload, dataBase64: Buffer.alloc(SCRATCH_IMAGE_BYTES + 1).toString('base64') }), undefined);
  for (const patch of [{ dataBase64: 'a===' }, { dataBase64: 'a' }, { dataBase64: 'abcd\n' }, { dataBase64: '' },
    { mediaType: 'image/svg+xml' }, { name: '../photo.png' }, { name: 'a\\b.png' }, { action: 'read-file' }, { path: '/tmp/a.png' }]) {
    assert.equal(parseScratchEditorMessage({ ...upload, ...patch }), undefined);
  }
});
