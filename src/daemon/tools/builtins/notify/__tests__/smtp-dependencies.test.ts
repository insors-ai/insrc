import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSecureContext, TLSSocket } from 'node:tls';
import { promisify } from 'node:util';

test('SMTP tool delivers attachments over authenticated STARTTLS and reports SMTP refusals', { timeout: 20_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-smtp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', key, '-out', cert,
  ], { stdio: 'ignore' });
  const secureContext = createSecureContext({ key: readFileSync(key), cert: readFileSync(cert) });
  const sockets = new Set<Socket>();
  const messages: string[] = [];
  let allowTls = true;
  let allowAuth = true;
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 localhost fixture\r\n');

    function receive(stream: Socket, encrypted: boolean): void {
      let buffer = '';
      let body: string[] | undefined;
      let authenticated = false;
      const read = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let end: number;
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (body) {
            if (line === '.') {
              messages.push(body.join('\r\n'));
              body = undefined;
              stream.write('250 queued\r\n');
            } else {
              body.push(line);
            }
          } else if (/^EHLO /i.test(line)) {
            stream.write(encrypted ? '250-localhost\r\n250 AUTH PLAIN\r\n' : allowTls ? '250-localhost\r\n250 STARTTLS\r\n' : '250 localhost\r\n');
          } else if (line === 'STARTTLS') {
            if (!allowTls) {
              stream.write('454 TLS unavailable\r\n');
              continue;
            }
            stream.removeListener('data', read);
            stream.write('220 Ready for TLS\r\n');
            const tls = new TLSSocket(stream, { isServer: true, secureContext });
            tls.on('error', () => {});
            receive(tls, true);
            return;
          } else if (line.startsWith('AUTH PLAIN ')) {
            authenticated = encrypted && allowAuth && Buffer.from(line.slice(11), 'base64').toString() === '\0fixture-user\0fixture-password';
            stream.write(authenticated ? '235 Authenticated\r\n' : '535 Authentication failed\r\n');
          } else if (line.startsWith('MAIL FROM:')) {
            stream.write(authenticated ? '250 Sender accepted\r\n' : '530 Authentication required\r\n');
          } else if (line.startsWith('RCPT TO:')) {
            stream.write(line.includes('reject@example.test') ? '550 Recipient rejected\r\n' : '250 Recipient accepted\r\n');
          } else if (line === 'DATA') {
            body = [];
            stream.write('354 End with dot\r\n');
          } else if (line === 'QUIT') {
            stream.end('221 Goodbye\r\n');
          } else {
            stream.write('500 Unexpected command\r\n');
          }
        }
      };
      stream.on('data', read);
    }
    receive(socket, false);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const send = async (to: string[]) => {
    const input = {
      smtpHost: '127.0.0.1', smtpPort: address.port, smtpRequireTls: true,
      smtpUser: 'fixture-user', smtpPass: 'fixture-password', from: 'sender@example.test', to,
      subject: 'STARTTLS fixture', text: 'test body', attachments: [{ filename: 'note.txt', content: 'attachment content' }],
    };
    const script = [
      "import { notifyEmailTool } from './src/daemon/tools/builtins/notify/index.ts';",
      "const result = await notifyEmailTool.execute(JSON.parse(process.argv[1]), { sessionId: 'fixture', repoPath: process.cwd(), requestId: 1, send() {} });",
      'process.stdout.write(JSON.stringify(result));',
    ].join('\n');
    const { stdout } = await promisify(execFile)(process.execPath, [
      '--import', 'tsx', '--input-type=module', '-e', script, JSON.stringify(input),
    ], { env: { ...process.env, NODE_EXTRA_CA_CERTS: cert, INSRC_LOG_LEVEL: 'silent' }, timeout: 4_000 });
    return JSON.parse(stdout) as { success: boolean; error?: string; data?: { accepted: string[]; rejected: string[] } };
  };

  const accepted = await send(['receive@example.test']);
  assert.equal(accepted.success, true, accepted.error);
  assert.deepEqual(accepted.data?.accepted, ['receive@example.test']);
  assert.match(messages[0] ?? '', /filename=note\.txt/);
  assert.match(messages[0] ?? '', /YXR0YWNobWVudCBjb250ZW50/);

  const partial = await send(['receive@example.test', 'reject@example.test']);
  assert.equal(partial.success, false);
  assert.deepEqual(partial.data?.accepted, ['receive@example.test']);
  assert.deepEqual(partial.data?.rejected, ['reject@example.test']);
  assert.equal(messages.length, 2);

  allowAuth = false;
  assert.match((await send(['receive@example.test'])).error ?? '', /535/);
  allowTls = false;
  assert.match((await send(['receive@example.test'])).error ?? '', /454/);
  assert.equal(messages.length, 2);
});
