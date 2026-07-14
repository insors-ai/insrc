/**
 * HTTP tools -- request / download / upload / websocket.
 *
 * Everything goes through undici (the repo-level HTTP client). Callers
 * can attach a bearer token or basic-auth pair; the tools attach them
 * as standard Authorization headers. Bodies stream where useful so a
 * large download / upload does not pin everything in memory.
 */

import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import { basename, dirname, resolve as pathResolve } from 'node:path';
import { File as NodeFile } from 'node:buffer';
import { fetch as undiciFetch, FormData, WebSocket } from 'undici';
import { registerTool } from '../../registry.js';
import type {
  Tool, ToolApprovalGate, ToolDeps, ToolInput, ToolResult,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(input: ToolInput, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === 'boolean' ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

/** Normalize header bag from input into a plain `Record<string,string>`. */
function collectHeaders(input: ToolInput): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = input['headers'];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string') { out[k] = v; }
      else if (typeof v === 'number' || typeof v === 'boolean') { out[k] = String(v); }
    }
  }
  const bearer = str(input, 'bearerToken');
  if (bearer && !('Authorization' in out) && !('authorization' in out)) {
    out['Authorization'] = `Bearer ${bearer}`;
  }
  const basic = input['basicAuth'];
  if (!('Authorization' in out) && !('authorization' in out) && basic && typeof basic === 'object') {
    const b = basic as { user?: unknown; pass?: unknown };
    if (typeof b.user === 'string' && typeof b.pass === 'string') {
      const tok = Buffer.from(`${b.user}:${b.pass}`).toString('base64');
      out['Authorization'] = `Basic ${tok}`;
    }
  }
  return out;
}

/** Redact auth headers before rendering a gate / result. */
function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = /^authorization$/i.test(k) ? '<redacted>' : v;
  }
  return out;
}

/** Methods the executor gates by default (non-idempotent). */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function formatBytes(n: number): string {
  if (n < 1024) { return `${n} B`; }
  if (n < 1024 * 1024) { return `${(n / 1024).toFixed(1)} KB`; }
  if (n < 1024 * 1024 * 1024) { return `${(n / 1024 / 1024).toFixed(1)} MB`; }
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// http:request
// ---------------------------------------------------------------------------

interface HttpRequestData {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string | undefined;
  contentLength: number | undefined;
  body: string;
  bodyTruncated: boolean;
  durationMs: number;
}

const DEFAULT_REQUEST_TIMEOUT = 30_000;
const MAX_REQUEST_TIMEOUT = 600_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

export const httpRequestTool: Tool = {
  id: 'http_request',
  description: 'Make an HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS). Write methods gate for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL including scheme.' },
      method: { type: 'string', description: 'HTTP verb. Defaults to GET.' },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      body: { description: 'String body, or any JSON-serializable value.' },
      jsonBody: { description: 'Shorthand: sets Content-Type: application/json and stringifies.' },
      bearerToken: { type: 'string' },
      basicAuth: {
        type: 'object',
        properties: { user: { type: 'string' }, pass: { type: 'string' } },
      },
      timeoutMs: { type: 'number', minimum: 1000, maximum: MAX_REQUEST_TIMEOUT },
      followRedirects: { type: 'boolean', description: 'Defaults to true.' },
      maxResponseBytes: { type: 'number', description: `Truncate body above N bytes. Default ${DEFAULT_MAX_RESPONSE_BYTES}.` },
      forceApproval: { type: 'boolean', description: 'Gate even for read-only methods.' },
    },
    required: ['url'],
    additionalProperties: false,
  },

  requiresApproval(input: ToolInput): boolean {
    if (bool(input, 'forceApproval') === true) { return true; }
    const method = (str(input, 'method') ?? 'GET').toUpperCase();
    return WRITE_METHODS.has(method);
  },

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const method = (str(input, 'method') ?? 'GET').toUpperCase();
    const url = str(input, 'url') ?? '';
    const headers = redactHeaders(collectHeaders(input));
    const bodyPreview = input['jsonBody'] !== undefined
      ? '```json\n' + JSON.stringify(input['jsonBody'], null, 2).slice(0, 1000) + '\n```'
      : typeof input['body'] === 'string'
        ? '```\n' + (input['body'] as string).slice(0, 1000) + '\n```'
        : input['body'] !== undefined
          ? '```json\n' + JSON.stringify(input['body'], null, 2).slice(0, 1000) + '\n```'
          : '_no body_';
    return {
      title: 'http_request',
      content: [
        `**${method}** \`${url}\``,
        '',
        '**Headers**',
        '```json',
        JSON.stringify(headers, null, 2),
        '```',
        '',
        '**Body**',
        bodyPreview,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit URL', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, url: feedback };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const url = str(input, 'url');
    if (!url) { return fail('http_request', 'url required'); }
    const method = (str(input, 'method') ?? 'GET').toUpperCase();
    const timeoutMs = Math.min(num(input, 'timeoutMs') ?? DEFAULT_REQUEST_TIMEOUT, MAX_REQUEST_TIMEOUT);
    const maxResponseBytes = num(input, 'maxResponseBytes') ?? DEFAULT_MAX_RESPONSE_BYTES;
    const followRedirects = bool(input, 'followRedirects') ?? true;

    const headers = collectHeaders(input);
    let body: string | undefined;
    if (input['jsonBody'] !== undefined) {
      body = JSON.stringify(input['jsonBody']);
      if (!('Content-Type' in headers) && !('content-type' in headers)) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (typeof input['body'] === 'string') {
      body = input['body'];
    } else if (input['body'] !== undefined) {
      body = JSON.stringify(input['body']);
      if (!('Content-Type' in headers) && !('content-type' in headers)) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onUpstreamAbort = () => ac.abort();
    deps.signal?.addEventListener('abort', onUpstreamAbort, { once: true });

    const started = Date.now();
    try {
      const resp = await undiciFetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        redirect: followRedirects ? 'follow' : 'manual',
        signal: ac.signal,
      });

      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => { respHeaders[k] = v; });
      const contentType = respHeaders['content-type'];
      const contentLengthRaw = respHeaders['content-length'];
      const contentLength = contentLengthRaw ? Number(contentLengthRaw) : undefined;

      // Stream body into a bounded buffer.
      let received = 0;
      let truncated = false;
      const chunks: Buffer[] = [];
      const reader = resp.body?.getReader();
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { break; }
          const buf = Buffer.from(value);
          if (received + buf.length > maxResponseBytes) {
            chunks.push(buf.subarray(0, maxResponseBytes - received));
            received = maxResponseBytes;
            truncated = true;
            await reader.cancel();
            break;
          }
          chunks.push(buf);
          received += buf.length;
        }
      }
      const bodyStr = Buffer.concat(chunks).toString('utf8');
      const durationMs = Date.now() - started;

      const ok = resp.status >= 200 && resp.status < 400;
      const data: HttpRequestData = {
        url, method,
        status: resp.status,
        statusText: resp.statusText,
        headers: respHeaders,
        contentType,
        contentLength,
        body: bodyStr,
        bodyTruncated: truncated,
        durationMs,
      };
      const renderedBody = bodyStr
        ? '```\n' + (bodyStr.length > 4000 ? bodyStr.slice(0, 4000) + '\n... (truncated in render)' : bodyStr) + '\n```'
        : '_empty body_';
      const output = [
        `**${method}** \`${url}\` -> **${resp.status} ${resp.statusText}** in ${durationMs} ms`,
        `Size: ${formatBytes(received)}${truncated ? ' (body cap hit)' : ''}`,
        contentType ? `Content-Type: \`${contentType}\`` : '',
        '',
        '**Body**',
        renderedBody,
      ].filter(Boolean).join('\n');
      return {
        output,
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `HTTP ${resp.status} ${resp.statusText}` }),
        data,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail('http_request', `request failed: ${msg}`);
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener('abort', onUpstreamAbort);
    }
  },
};

// ---------------------------------------------------------------------------
// http:download
// ---------------------------------------------------------------------------

interface HttpDownloadData {
  url: string;
  destPath: string;
  status: number;
  contentType: string | undefined;
  bytesWritten: number;
  durationMs: number;
  overflow: boolean;
}

const DEFAULT_DOWNLOAD_MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const DEFAULT_DOWNLOAD_TIMEOUT = 120_000;
const MAX_DOWNLOAD_TIMEOUT = 3_600_000;

export const httpDownloadTool: Tool = {
  id: 'http_download',
  description: 'Download a URL to a local file. Streams; size cap enforced.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      destPath: { type: 'string', description: 'Local destination path.' },
      overwrite: { type: 'boolean', description: 'Default false; refuses to overwrite otherwise.' },
      maxBytes: { type: 'number', description: `Abort above N bytes. Default ${DEFAULT_DOWNLOAD_MAX_BYTES}.` },
      timeoutMs: { type: 'number', minimum: 1000, maximum: MAX_DOWNLOAD_TIMEOUT },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      bearerToken: { type: 'string' },
      basicAuth: {
        type: 'object',
        properties: { user: { type: 'string' }, pass: { type: 'string' } },
      },
    },
    required: ['url', 'destPath'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const maxBytes = num(input, 'maxBytes') ?? DEFAULT_DOWNLOAD_MAX_BYTES;
    return {
      title: 'http_download',
      content: [
        `**URL**: \`${str(input, 'url')}\``,
        `**Dest**: \`${str(input, 'destPath')}\``,
        `Overwrite: ${bool(input, 'overwrite') === true ? 'yes' : 'no'}. Cap: ${formatBytes(maxBytes)}.`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const url = str(input, 'url');
    const destPath = str(input, 'destPath');
    if (!url || !destPath) { return fail('http_download', 'url and destPath required'); }

    const overwrite = bool(input, 'overwrite') ?? false;
    const maxBytes = num(input, 'maxBytes') ?? DEFAULT_DOWNLOAD_MAX_BYTES;
    const timeoutMs = Math.min(num(input, 'timeoutMs') ?? DEFAULT_DOWNLOAD_TIMEOUT, MAX_DOWNLOAD_TIMEOUT);
    const absDest = pathResolve(destPath);

    if (!overwrite) {
      try {
        await fs.access(absDest);
        return fail('http_download', `dest already exists (set overwrite:true): ${absDest}`);
      } catch { /* ok: doesn't exist */ }
    }
    try { await fs.mkdir(dirname(absDest), { recursive: true }); } catch { /* ignore */ }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onUpstreamAbort = () => ac.abort();
    deps.signal?.addEventListener('abort', onUpstreamAbort, { once: true });

    const started = Date.now();
    let bytesWritten = 0;
    let overflow = false;

    try {
      const resp = await undiciFetch(url, {
        method: 'GET',
        headers: collectHeaders(input),
        signal: ac.signal,
      });
      if (!resp.ok) {
        return fail('http_download', `HTTP ${resp.status} ${resp.statusText}`);
      }
      const contentType = resp.headers.get('content-type') ?? undefined;
      const reader = resp.body?.getReader();
      if (!reader) { return fail('http_download', 'empty response body'); }

      const file = createWriteStream(absDest);
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { break; }
          const buf = Buffer.from(value);
          if (bytesWritten + buf.length > maxBytes) {
            overflow = true;
            await reader.cancel();
            break;
          }
          await new Promise<void>((res, rej) => {
            file.write(buf, err => err ? rej(err) : res());
          });
          bytesWritten += buf.length;
          if (bytesWritten % (512 * 1024) < buf.length) {
            deps.send({ id: deps.requestId, stream: 'progress', data: { message: `downloaded ${formatBytes(bytesWritten)}` } });
          }
        }
      } finally {
        await new Promise<void>(res => file.end(res));
      }

      if (overflow) {
        try { await fs.unlink(absDest); } catch { /* ignore */ }
        return fail('http_download', `size cap exceeded (>${formatBytes(maxBytes)}); partial file removed`);
      }

      const durationMs = Date.now() - started;
      const data: HttpDownloadData = {
        url, destPath: absDest, status: resp.status,
        contentType, bytesWritten, durationMs, overflow,
      };
      return {
        output: [
          `Downloaded **${formatBytes(bytesWritten)}** to \`${absDest}\` in ${durationMs} ms.`,
          contentType ? `Content-Type: \`${contentType}\`` : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: true,
        data,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      try { if (bytesWritten > 0) { await fs.unlink(absDest); } } catch { /* ignore */ }
      return fail('http_download', `download failed: ${msg}`);
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener('abort', onUpstreamAbort);
    }
  },
};

// ---------------------------------------------------------------------------
// http:upload
// ---------------------------------------------------------------------------

interface HttpUploadData {
  url: string;
  method: string;
  status: number;
  statusText: string;
  bytesUploaded: number;
  contentType: string | undefined;
  durationMs: number;
  responseBody: string;
  responseTruncated: boolean;
}

const DEFAULT_UPLOAD_TIMEOUT = 300_000;
const MAX_UPLOAD_TIMEOUT = 3_600_000;
const UPLOAD_RESPONSE_CAP = 256 * 1024;

export const httpUploadTool: Tool = {
  id: 'http_upload',
  description: 'Upload a file (multipart or raw PUT/POST) to a URL.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      filePath: { type: 'string', description: 'Local file to upload.' },
      method: { type: 'string', description: 'POST (default) or PUT.' },
      mode: { type: 'string', enum: ['multipart', 'raw'], description: 'Default multipart.' },
      fieldName: { type: 'string', description: 'Multipart field name. Default "file".' },
      fileName: { type: 'string', description: 'Multipart filename. Defaults to basename(filePath).' },
      formFields: { type: 'object', additionalProperties: { type: 'string' }, description: 'Additional multipart fields.' },
      contentType: { type: 'string', description: 'Content-Type for raw uploads or the file part.' },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      bearerToken: { type: 'string' },
      basicAuth: {
        type: 'object',
        properties: { user: { type: 'string' }, pass: { type: 'string' } },
      },
      timeoutMs: { type: 'number', minimum: 1000, maximum: MAX_UPLOAD_TIMEOUT },
    },
    required: ['url', 'filePath'],
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const filePath = str(input, 'filePath') ?? '';
    let size = 0;
    try {
      const st = await fs.stat(filePath);
      size = st.size;
    } catch { /* file might not exist yet -- execute() will report */ }
    const method = (str(input, 'method') ?? 'POST').toUpperCase();
    const mode = str(input, 'mode') ?? 'multipart';
    return {
      title: 'http_upload',
      content: [
        `**${method}** (${mode}) \`${str(input, 'url')}\``,
        `File: \`${filePath}\` (${formatBytes(size)})`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const url = str(input, 'url');
    const filePath = str(input, 'filePath');
    if (!url || !filePath) { return fail('http_upload', 'url and filePath required'); }

    const method = (str(input, 'method') ?? 'POST').toUpperCase();
    const mode = (str(input, 'mode') ?? 'multipart') as 'multipart' | 'raw';
    const timeoutMs = Math.min(num(input, 'timeoutMs') ?? DEFAULT_UPLOAD_TIMEOUT, MAX_UPLOAD_TIMEOUT);
    const abs = pathResolve(filePath);

    let stat;
    try { stat = await fs.stat(abs); }
    catch { return fail('http_upload', `file not found: ${abs}`); }
    if (!stat.isFile()) { return fail('http_upload', `not a regular file: ${abs}`); }

    const headers = collectHeaders(input);
    const explicitContentType = str(input, 'contentType');

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onUpstreamAbort = () => ac.abort();
    deps.signal?.addEventListener('abort', onUpstreamAbort, { once: true });

    const started = Date.now();
    try {
      let body: unknown;
      if (mode === 'multipart') {
        const buf = await fs.readFile(abs);
        const fileName = str(input, 'fileName') ?? basename(abs);
        const fieldName = str(input, 'fieldName') ?? 'file';
        const form = new FormData();
        form.set(fieldName, new NodeFile([buf], fileName, explicitContentType ? { type: explicitContentType } : {}));
        const extra = input['formFields'];
        if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
          for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
            if (typeof v === 'string') { form.set(k, v); }
          }
        }
        body = form;
        // Let fetch pick its own multipart boundary; clear any conflicting header.
        delete headers['Content-Type'];
        delete headers['content-type'];
      } else {
        body = createReadStream(abs);
        if (explicitContentType && !('Content-Type' in headers) && !('content-type' in headers)) {
          headers['Content-Type'] = explicitContentType;
        }
        if (!('Content-Length' in headers) && !('content-length' in headers)) {
          headers['Content-Length'] = String(stat.size);
        }
      }

      const init = {
        method,
        headers,
        body,
        signal: ac.signal,
        ...(mode === 'raw' ? { duplex: 'half' as const } : {}),
      };
      const resp = await undiciFetch(url, init as Parameters<typeof undiciFetch>[1]);

      // Read response (bounded).
      const chunks: Buffer[] = [];
      let received = 0;
      let truncated = false;
      const reader = resp.body?.getReader();
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { break; }
          const buf = Buffer.from(value);
          if (received + buf.length > UPLOAD_RESPONSE_CAP) {
            chunks.push(buf.subarray(0, UPLOAD_RESPONSE_CAP - received));
            received = UPLOAD_RESPONSE_CAP;
            truncated = true;
            await reader.cancel();
            break;
          }
          chunks.push(buf);
          received += buf.length;
        }
      }
      const responseBody = Buffer.concat(chunks).toString('utf8');
      const contentType = resp.headers.get('content-type') ?? undefined;
      const durationMs = Date.now() - started;

      const ok = resp.status >= 200 && resp.status < 400;
      const data: HttpUploadData = {
        url, method,
        status: resp.status,
        statusText: resp.statusText,
        bytesUploaded: stat.size,
        contentType,
        durationMs,
        responseBody,
        responseTruncated: truncated,
      };
      const output = [
        `**${method}** \`${url}\` <- \`${abs}\` (${formatBytes(stat.size)}) -> **${resp.status} ${resp.statusText}** in ${durationMs} ms`,
        responseBody ? '\n**Response**\n```\n' + responseBody.slice(0, 2000) + (responseBody.length > 2000 ? '\n... (truncated)' : '') + '\n```' : '',
      ].filter(Boolean).join('\n');
      return {
        output,
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `HTTP ${resp.status} ${resp.statusText}` }),
        data,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail('http_upload', `upload failed: ${msg}`);
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener('abort', onUpstreamAbort);
    }
  },
};

// ---------------------------------------------------------------------------
// http:websocket -- short-lived connection that streams frames back
// ---------------------------------------------------------------------------

interface HttpWebSocketFrame {
  direction: 'send' | 'recv';
  at: number;
  bytes: number;
  text?: string;
  isBinary?: boolean;
}

interface HttpWebSocketData {
  url: string;
  closeCode: number | null;
  closeReason: string;
  framesSent: number;
  framesReceived: number;
  timedOut: boolean;
  durationMs: number;
  frames: HttpWebSocketFrame[];
}

const DEFAULT_WS_RUNTIME = 60_000;
const MAX_WS_RUNTIME = 30 * 60_000;
const DEFAULT_WS_MAX_FRAMES = 100;

export const httpWebSocketTool: Tool = {
  id: 'http_websocket',
  description: 'Open a WebSocket, send initial frames, stream received frames. Bounded runtime.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'ws:// or wss:// URL.' },
      initialFrames: { type: 'array', items: { type: 'string' }, description: 'Text frames sent after open.' },
      protocols: { type: 'array', items: { type: 'string' } },
      bearerToken: { type: 'string', description: 'Attached as Authorization header during handshake.' },
      maxRuntimeMs: { type: 'number', minimum: 1000, maximum: MAX_WS_RUNTIME },
      maxFrames: { type: 'number', description: `Close after N received frames. Default ${DEFAULT_WS_MAX_FRAMES}.` },
      closeOnFirstReply: { type: 'boolean', description: 'Close after the first received frame.' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const maxRuntime = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_WS_RUNTIME, MAX_WS_RUNTIME);
    const initial = Array.isArray(input['initialFrames']) ? (input['initialFrames'] as unknown[]) : [];
    return {
      title: 'http_websocket',
      content: [
        `URL: \`${str(input, 'url')}\``,
        `Max runtime: ${Math.round(maxRuntime / 1000)}s. Initial frames: ${initial.length}.`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const url = str(input, 'url');
    if (!url) { return fail('http_websocket', 'url required'); }
    const maxRuntimeMs = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_WS_RUNTIME, MAX_WS_RUNTIME);
    const maxFrames = num(input, 'maxFrames') ?? DEFAULT_WS_MAX_FRAMES;
    const closeOnFirstReply = bool(input, 'closeOnFirstReply') ?? false;
    const initialFrames = Array.isArray(input['initialFrames'])
      ? (input['initialFrames'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const protocols = Array.isArray(input['protocols'])
      ? (input['protocols'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : undefined;

    const headers = collectHeaders(input);

    return new Promise<ToolResult>(resolve => {
      const frames: HttpWebSocketFrame[] = [];
      let framesSent = 0;
      let framesReceived = 0;
      let timedOut = false;
      const started = Date.now();

      const wsInit: { protocols?: string | string[]; headers?: Record<string, string> } = {};
      if (protocols && protocols.length > 0) { wsInit.protocols = protocols; }
      if (Object.keys(headers).length > 0) { wsInit.headers = headers; }
      const ws = Object.keys(wsInit).length > 0
        ? new WebSocket(url, wsInit)
        : new WebSocket(url);

      const runtimeTimer = setTimeout(() => {
        timedOut = true;
        try { ws.close(1000, 'runtime cap'); } catch { /* ignore */ }
      }, maxRuntimeMs);
      const onUpstreamAbort = () => { try { ws.close(1000, 'aborted'); } catch { /* ignore */ } };
      deps.signal?.addEventListener('abort', onUpstreamAbort, { once: true });

      const finish = (closeCode: number | null, closeReason: string): void => {
        clearTimeout(runtimeTimer);
        deps.signal?.removeEventListener('abort', onUpstreamAbort);
        const durationMs = Date.now() - started;
        const data: HttpWebSocketData = {
          url, closeCode, closeReason,
          framesSent, framesReceived, timedOut, durationMs, frames,
        };
        const ok = closeCode === null || closeCode === 1000 || closeCode === 1005;
        const framePreview = frames.slice(0, 8).map((f, i) => {
          const body = f.text ? (f.text.length > 200 ? f.text.slice(0, 200) + '...' : f.text) : `<${f.bytes} B binary>`;
          return `${i + 1}. ${f.direction}  ${body}`;
        }).join('\n');
        resolve({
          output: [
            `WebSocket \`${url}\` -> closed with ${closeCode ?? 'n/a'}${closeReason ? ` "${closeReason}"` : ''} after ${durationMs} ms.`,
            `Frames: sent ${framesSent}, received ${framesReceived}${timedOut ? ', runtime cap hit' : ''}.`,
            framePreview ? '\n**Frame trace (first 8)**\n```\n' + framePreview + '\n```' : '',
          ].filter(Boolean).join('\n'),
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: `close ${closeCode}` }),
          data,
        });
      };

      ws.addEventListener('open', () => {
        for (const frame of initialFrames) {
          try {
            ws.send(frame);
            framesSent += 1;
            frames.push({ direction: 'send', at: Date.now(), bytes: Buffer.byteLength(frame), text: frame });
          } catch { /* connection may have dropped */ }
        }
      });

      ws.addEventListener('message', evt => {
        const raw = evt.data;
        let text: string | undefined;
        let bytes = 0;
        let isBinary = false;
        if (typeof raw === 'string') {
          text = raw;
          bytes = Buffer.byteLength(raw);
        } else if (raw instanceof ArrayBuffer) {
          bytes = raw.byteLength;
          isBinary = true;
        } else if (raw instanceof Blob) {
          bytes = raw.size;
          isBinary = true;
        } else {
          bytes = Buffer.byteLength(String(raw));
          text = String(raw);
        }
        framesReceived += 1;
        frames.push({ direction: 'recv', at: Date.now(), bytes, ...(text !== undefined ? { text } : {}), isBinary });
        deps.send({
          id: deps.requestId,
          stream: 'progress',
          data: { message: `ws recv ${bytes} B${text ? ': ' + text.slice(0, 160) : ''}` },
        });
        if (closeOnFirstReply || framesReceived >= maxFrames) {
          try { ws.close(1000, 'frame cap'); } catch { /* ignore */ }
        }
      });

      ws.addEventListener('error', () => {
        // Error events lack detail in the WebSocket spec; real close follows.
      });

      ws.addEventListener('close', evt => {
        const code = typeof evt.code === 'number' ? evt.code : null;
        const reason = typeof evt.reason === 'string' ? evt.reason : '';
        finish(code, reason);
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerHttpTools(): void {
  registerTool(httpRequestTool);
  registerTool(httpDownloadTool);
  registerTool(httpUploadTool);
  registerTool(httpWebSocketTool);
}
