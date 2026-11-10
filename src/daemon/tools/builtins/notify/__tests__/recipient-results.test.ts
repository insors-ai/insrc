import assert from 'node:assert/strict';
import test from 'node:test';
import nodemailer from 'nodemailer';
import { notifyEmailTool } from '../index.js';

test('email recipient results preserve mailbox strings for mixed address objects and empty results', async t => {
 const input = { smtpHost: 'fixture.invalid', smtpPort: 2525, smtpUser: 'fixture', smtpPass: 'fixture',
  from: 'sender@example.test', to: ['recipient@example.test'], subject: 'Fixture', text: 'Fixture body' };
 for (const recipients of [
  { accepted: ['one@example.test', { name: 'Two', address: 'two@example.test' }], rejected: ['three@example.test', { address: 'four@example.test' }], expectedAccepted: ['one@example.test', 'two@example.test'], expectedRejected: ['three@example.test', 'four@example.test'] },
  { accepted: [], rejected: [], expectedAccepted: [], expectedRejected: [] },
  { accepted: undefined, rejected: undefined, expectedAccepted: [], expectedRejected: [] },
 ]) {
  let closed = false;
  const mock = t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => ({ ...recipients, messageId: 'fixture-id', response: 'fixture-response' }), close: () => { closed = true; } }));
  const result = await notifyEmailTool.execute(input, { sessionId: 'fixture', repoPath: process.cwd(), requestId: 1, send() {} });
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(result.success, recipients.expectedRejected.length === 0);
  assert.deepEqual(result.data?.['accepted'], recipients.expectedAccepted);
  assert.deepEqual(result.data?.['rejected'], recipients.expectedRejected);
  assert.equal(result.output.includes('[object Object]'), false);
  assert.equal(closed, true);
  mock.mock.restore();
 }
});
