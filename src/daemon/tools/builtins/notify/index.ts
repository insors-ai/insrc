/**
 * Notification tools -- slack / discord / teams / email.
 *
 * Slack, Discord, and Teams are all incoming webhooks, so they go
 * through undici fetch. Email uses nodemailer to talk SMTP (so the
 * caller keeps full control over relay choice -- sendgrid,
 * mailgun, localhost, corporate SMTP, etc.).
 *
 * Every tool is gated because they produce external, hard-to-undo
 * side effects. Approval previews strip credentials: webhook URLs
 * keep only the host, auth tokens show only their length.
 */

import { fetch as undiciFetch } from 'undici';
import nodemailer from 'nodemailer';
import { registerTool } from '../../registry.js';
import { getToolSettings } from '../../config.js';
import { getKey } from '../../../../shared/keystore.js';
import type {
  Tool, ToolApprovalGate, ToolInput, ToolResult,
} from '../../types.js';

/**
 * Look up a keychain-stored secret by account name. Returns the
 * stored value, or undefined when the ref is empty or nothing is
 * stored under that account. notify:* tools use this to fill
 * defaults from IDE settings without the agent having to pass them
 * per call.
 */
async function resolveSecretRef(ref: string | undefined): Promise<string | undefined> {
  if (!ref) { return undefined; }
  const v = await getKey(ref);
  return v ?? undefined;
}

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

function webhookHost(url: string): string {
  try { return new URL(url).host; } catch { return url.slice(0, 32) + '...'; }
}

function redactLen(value: string | undefined): string {
  return value ? `<redacted, ${value.length} chars>` : '<empty>';
}

// ---------------------------------------------------------------------------
// notify:slack
// ---------------------------------------------------------------------------

interface SlackSendData {
  mode: 'webhook' | 'bot';
  channel: string | undefined;
  status: number;
  ok: boolean;
  response: string;
}

export const notifySlackTool: Tool = {
  id: 'notify_slack',
  description: 'Post a Slack message via an incoming webhook URL or a bot token + channel.',
  inputSchema: {
    type: 'object',
    properties: {
      webhookUrl: { type: 'string', description: 'Incoming webhook URL. Mutually exclusive with botToken.' },
      botToken: { type: 'string', description: 'xoxb- token; requires `channel`.' },
      channel: { type: 'string', description: 'Channel ID / name (bot-token mode).' },
      text: { type: 'string' },
      blocks: { description: 'Slack Block Kit array.' },
      attachments: { description: 'Slack attachments array (legacy).' },
      threadTs: { type: 'string' },
      username: { type: 'string' },
      iconEmoji: { type: 'string' },
      iconUrl: { type: 'string' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const text = str(input, 'text') ?? '';
    const webhook = str(input, 'webhookUrl');
    const bot = str(input, 'botToken');
    const channel = str(input, 'channel');
    return {
      title: 'notify_slack',
      content: [
        webhook ? `Webhook host: \`${webhookHost(webhook)}\`` : '',
        bot     ? `Bot token: ${redactLen(bot)}, channel: \`${channel ?? '?'}\`` : '',
        '',
        '**Message**',
        '```',
        text.length > 2000 ? text.slice(0, 2000) + '\n... (truncated)' : text,
        '```',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const text = str(input, 'text');
    const blocks = input['blocks'];
    const attachments = input['attachments'];
    if (!text && blocks === undefined && attachments === undefined) {
      return fail('notify_slack', 'text, blocks, or attachments required');
    }

    let webhookUrl = str(input, 'webhookUrl');
    if (!webhookUrl) {
      webhookUrl = await resolveSecretRef(getToolSettings().notify.slack.defaultWebhookRef);
    }
    const botToken = str(input, 'botToken');
    const channel = str(input, 'channel');
    if (!webhookUrl && !botToken) { return fail('notify_slack', 'webhookUrl or botToken required (or set insrc.tools.notify.slack.defaultWebhookRef)'); }
    if (botToken && !channel)     { return fail('notify_slack', 'botToken requires channel'); }

    const payload: Record<string, unknown> = {};
    if (text !== undefined)         { payload['text'] = text; }
    if (blocks !== undefined)       { payload['blocks'] = blocks; }
    if (attachments !== undefined)  { payload['attachments'] = attachments; }
    const threadTs = str(input, 'threadTs');
    if (threadTs)                   { payload['thread_ts'] = threadTs; }
    if (botToken && channel)        { payload['channel'] = channel; }
    const username = str(input, 'username');
    if (username)                   { payload['username'] = username; }
    const iconEmoji = str(input, 'iconEmoji');
    if (iconEmoji)                  { payload['icon_emoji'] = iconEmoji; }
    const iconUrl = str(input, 'iconUrl');
    if (iconUrl)                    { payload['icon_url'] = iconUrl; }

    const url = webhookUrl ?? 'https://slack.com/api/chat.postMessage';
    const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
    if (botToken) { headers['Authorization'] = `Bearer ${botToken}`; }

    try {
      const resp = await undiciFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      const body = await resp.text();
      // Webhook mode returns "ok" as body; bot-token mode returns JSON with ok/error.
      let sendOk = resp.ok;
      if (botToken) {
        try {
          const j = JSON.parse(body) as { ok?: boolean; error?: string };
          sendOk = sendOk && j.ok === true;
        } catch { /* leave as-is */ }
      }
      const data: SlackSendData = {
        mode: webhookUrl ? 'webhook' : 'bot',
        channel, status: resp.status, ok: sendOk, response: body,
      };
      return {
        output: [
          sendOk ? `Slack message delivered via ${data.mode} (HTTP ${resp.status}).` : `**Slack send failed** (HTTP ${resp.status}).`,
          body ? '\n```\n' + body.slice(0, 1500) + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: sendOk,
        ...(sendOk ? {} : { error: `HTTP ${resp.status}` }),
        data,
      };
    } catch (err: unknown) {
      return fail('notify_slack', `request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// notify:discord
// ---------------------------------------------------------------------------

interface DiscordSendData {
  status: number;
  ok: boolean;
  response: string;
}

export const notifyDiscordTool: Tool = {
  id: 'notify_discord',
  description: 'Post a message to a Discord incoming webhook URL (webhookUrl optional when insrc.tools.notify.discord.defaultWebhookRef is set).',
  inputSchema: {
    type: 'object',
    properties: {
      webhookUrl: { type: 'string' },
      content: { type: 'string' },
      embeds: { description: 'Discord embeds array.' },
      username: { type: 'string' },
      avatarUrl: { type: 'string' },
      tts: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const content = str(input, 'content') ?? '';
    return {
      title: 'notify_discord',
      content: [
        `Webhook host: \`${webhookHost(str(input, 'webhookUrl') ?? '')}\``,
        '',
        '**Content**',
        '```',
        content.length > 2000 ? content.slice(0, 2000) + '\n... (truncated)' : content,
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    let webhookUrl = str(input, 'webhookUrl');
    if (!webhookUrl) {
      webhookUrl = await resolveSecretRef(getToolSettings().notify.discord.defaultWebhookRef);
    }
    if (!webhookUrl) { return fail('notify_discord', 'webhookUrl required (or set insrc.tools.notify.discord.defaultWebhookRef)'); }
    const content = str(input, 'content');
    const embeds = input['embeds'];
    if (content === undefined && embeds === undefined) {
      return fail('notify_discord', 'content or embeds required');
    }

    const payload: Record<string, unknown> = {};
    if (content !== undefined) { payload['content'] = content; }
    if (embeds !== undefined)  { payload['embeds'] = embeds; }
    const username = str(input, 'username');
    if (username)              { payload['username'] = username; }
    const avatarUrl = str(input, 'avatarUrl');
    if (avatarUrl)             { payload['avatar_url'] = avatarUrl; }
    if (bool(input, 'tts') === true) { payload['tts'] = true; }

    try {
      const resp = await undiciFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const body = await resp.text();
      const sendOk = resp.ok;
      const data: DiscordSendData = { status: resp.status, ok: sendOk, response: body };
      return {
        output: [
          sendOk ? `Discord message delivered (HTTP ${resp.status}).` : `**Discord send failed** (HTTP ${resp.status}).`,
          body ? '\n```\n' + body.slice(0, 1500) + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: sendOk,
        ...(sendOk ? {} : { error: `HTTP ${resp.status}` }),
        data,
      };
    } catch (err: unknown) {
      return fail('notify_discord', `request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// notify:teams
// ---------------------------------------------------------------------------

interface TeamsSendData {
  status: number;
  ok: boolean;
  response: string;
  payloadType: 'text' | 'adaptiveCard' | 'raw';
}

export const notifyTeamsTool: Tool = {
  id: 'notify_teams',
  description: 'Post to a Microsoft Teams incoming webhook (webhookUrl optional when insrc.tools.notify.teams.defaultWebhookRef is set).',
  inputSchema: {
    type: 'object',
    properties: {
      webhookUrl: { type: 'string' },
      text: { type: 'string', description: 'Plain-text message (wrapped in a MessageCard).' },
      title: { type: 'string' },
      adaptiveCard: { description: 'Adaptive Card JSON body (wrapped in the standard attachments envelope).' },
      rawPayload: { description: 'Raw payload passed through verbatim.' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const text = str(input, 'text') ?? '';
    return {
      title: 'notify_teams',
      content: [
        `Webhook host: \`${webhookHost(str(input, 'webhookUrl') ?? '')}\``,
        str(input, 'title') ? `Title: \`${str(input, 'title')}\`` : '',
        input['adaptiveCard'] !== undefined ? 'Adaptive Card payload.' : input['rawPayload'] !== undefined ? 'Raw payload.' : '',
        text ? '\n**Text**\n```\n' + (text.length > 2000 ? text.slice(0, 2000) + '\n... (truncated)' : text) + '\n```' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    let webhookUrl = str(input, 'webhookUrl');
    if (!webhookUrl) {
      webhookUrl = await resolveSecretRef(getToolSettings().notify.teams.defaultWebhookRef);
    }
    if (!webhookUrl) { return fail('notify_teams', 'webhookUrl required (or set insrc.tools.notify.teams.defaultWebhookRef)'); }
    const text = str(input, 'text');
    const title = str(input, 'title');
    const card = input['adaptiveCard'];
    const raw = input['rawPayload'];

    let payload: unknown;
    let payloadType: TeamsSendData['payloadType'];
    if (raw !== undefined) {
      payload = raw;
      payloadType = 'raw';
    } else if (card !== undefined) {
      payload = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: card,
          },
        ],
      };
      payloadType = 'adaptiveCard';
    } else if (text !== undefined) {
      payload = {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        ...(title ? { title } : {}),
        text,
      };
      payloadType = 'text';
    } else {
      return fail('notify_teams', 'text, adaptiveCard, or rawPayload required');
    }

    try {
      const resp = await undiciFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const body = await resp.text();
      const sendOk = resp.ok;
      const data: TeamsSendData = { status: resp.status, ok: sendOk, response: body, payloadType };
      return {
        output: [
          sendOk ? `Teams message delivered (HTTP ${resp.status}, ${payloadType}).` : `**Teams send failed** (HTTP ${resp.status}).`,
          body ? '\n```\n' + body.slice(0, 1500) + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: sendOk,
        ...(sendOk ? {} : { error: `HTTP ${resp.status}` }),
        data,
      };
    } catch (err: unknown) {
      return fail('notify_teams', `request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// notify:email (SMTP via nodemailer)
// ---------------------------------------------------------------------------

interface EmailSendData {
  smtpHost: string;
  from: string;
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
  messageId: string | undefined;
  accepted: readonly string[];
  rejected: readonly string[];
  response: string | undefined;
}

interface EmailAttachmentInput {
  filename: string;
  path?: string;
  content?: string;
  contentType?: string;
  encoding?: string;
}

function strList(input: ToolInput, key: string): string[] {
  const v = input[key];
  if (Array.isArray(v)) {
    return (v as unknown[]).map(String).filter(s => s.length > 0);
  }
  if (typeof v === 'string' && v.length > 0) { return [v]; }
  return [];
}

function parseAttachments(raw: unknown): EmailAttachmentInput[] {
  if (!Array.isArray(raw)) { return []; }
  const out: EmailAttachmentInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') { continue; }
    const o = item as Record<string, unknown>;
    const filename = typeof o['filename'] === 'string' ? o['filename'] : undefined;
    if (!filename) { continue; }
    const a: EmailAttachmentInput = { filename };
    if (typeof o['path']        === 'string') { a.path        = o['path']; }
    if (typeof o['content']     === 'string') { a.content     = o['content']; }
    if (typeof o['contentType'] === 'string') { a.contentType = o['contentType']; }
    if (typeof o['encoding']    === 'string') { a.encoding    = o['encoding']; }
    out.push(a);
  }
  return out;
}

export const notifyEmailTool: Tool = {
  id: 'notify_email',
  description: 'Send an email via SMTP (nodemailer). Supports multiple recipients and attachments.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: '"Name <addr>" or "addr".' },
      to:   { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      cc:   { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      bcc:  { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      replyTo: { type: 'string' },
      subject: { type: 'string' },
      text: { type: 'string' },
      html: { type: 'string' },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename:    { type: 'string' },
            path:        { type: 'string' },
            content:     { type: 'string' },
            contentType: { type: 'string' },
            encoding:    { type: 'string', description: 'e.g. "base64" for inline binary.' },
          },
          required: ['filename'],
          additionalProperties: false,
        },
      },
      smtpHost: { type: 'string' },
      smtpPort: { type: 'number', minimum: 1, maximum: 65535 },
      smtpSecure: { type: 'boolean', description: 'TLS from connection start (usually port 465).' },
      smtpUser: { type: 'string' },
      smtpPass: { type: 'string' },
      smtpRequireTls: { type: 'boolean', description: 'Require STARTTLS on 587/25.' },
    },
    required: ['to', 'subject'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const to  = strList(input, 'to');
    const cc  = strList(input, 'cc');
    const bcc = strList(input, 'bcc');
    const attachments = parseAttachments(input['attachments']);
    const bodyPreview = str(input, 'text') ?? '';
    return {
      title: 'notify_email',
      content: [
        `SMTP: \`${str(input, 'smtpHost')}:${num(input, 'smtpPort') ?? '<default>'}\` (user: \`${str(input, 'smtpUser') ?? '<none>'}\`, password: ${redactLen(str(input, 'smtpPass'))})`,
        `From: \`${str(input, 'from')}\``,
        `To: ${to.map(t => '`' + t + '`').join(', ') || '_none_'}`,
        cc.length  > 0 ? `Cc: ${cc.map(t => '`' + t + '`').join(', ')}` : '',
        bcc.length > 0 ? `Bcc: ${bcc.map(t => '`' + t + '`').join(', ')}` : '',
        `Subject: \`${str(input, 'subject')}\``,
        attachments.length > 0 ? `Attachments: ${attachments.map(a => '`' + a.filename + '`').join(', ')}` : '',
        bodyPreview ? '\n**Body (text)**\n```\n' + (bodyPreview.length > 1500 ? bodyPreview.slice(0, 1500) + '\n... (truncated)' : bodyPreview) + '\n```' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const emailDefaults = getToolSettings().notify.email;
    const from = str(input, 'from') ?? (emailDefaults.fromAddress || undefined);
    const to = strList(input, 'to');
    const subject = str(input, 'subject');
    const smtpHost = str(input, 'smtpHost') ?? (emailDefaults.smtpHost || undefined);
    if (!from || to.length === 0 || !subject || !smtpHost) {
      return fail('notify_email', 'from, to, subject, smtpHost required (defaults via insrc.tools.notify.email.*)');
    }
    const cc = strList(input, 'cc');
    const bcc = strList(input, 'bcc');
    const text = str(input, 'text');
    const html = str(input, 'html');
    if (!text && !html) { return fail('notify_email', 'text or html body required'); }

    // Resolve SMTP credentials: per-call wins, then keychain refs.
    const smtpUser = str(input, 'smtpUser') ?? (await resolveSecretRef(emailDefaults.smtpUserRef));
    const smtpPass = str(input, 'smtpPass') ?? (await resolveSecretRef(emailDefaults.smtpPassRef));
    const smtpPort = num(input, 'smtpPort') ?? emailDefaults.smtpPort;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      ...(bool(input, 'smtpSecure')         === true      ? { secure: true } : {}),
      ...(bool(input, 'smtpRequireTls')     === true      ? { requireTLS: true } : {}),
      ...(smtpUser && smtpPass
        ? { auth: { user: smtpUser, pass: smtpPass } }
        : {}),
    });

    const attachments = parseAttachments(input['attachments']).map(a => ({
      filename: a.filename,
      ...(a.path        !== undefined ? { path: a.path } : {}),
      ...(a.content     !== undefined ? { content: a.content } : {}),
      ...(a.contentType !== undefined ? { contentType: a.contentType } : {}),
      ...(a.encoding    !== undefined ? { encoding: a.encoding } : {}),
    }));
    const replyTo = str(input, 'replyTo');

    try {
      const info = await transporter.sendMail({
        from, to, subject,
        ...(cc.length  > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
        ...(text ? { text } : {}),
        ...(html ? { html } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      const data: EmailSendData = {
        smtpHost, from, to, cc, bcc,
        messageId: info.messageId,
        accepted: (info.accepted ?? []).map(v => typeof v === 'string' ? v : v.address),
        rejected: (info.rejected ?? []).map(v => typeof v === 'string' ? v : v.address),
        response: info.response,
      };
      const ok = data.rejected.length === 0;
      return {
        output: [
          ok
            ? `Email accepted by ${smtpHost}. Message-ID: \`${data.messageId ?? '<none>'}\``
            : `**Email partially rejected** by ${smtpHost}. Rejected: ${data.rejected.join(', ')}.`,
          `Accepted: ${data.accepted.join(', ') || '_none_'}`,
          data.response ? `Server response: \`${data.response}\`` : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `rejected: ${data.rejected.join(', ')}` }),
        data,
      };
    } catch (err: unknown) {
      return fail('notify_email', `SMTP send failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      transporter.close();
    }
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerNotifyTools(): void {
  registerTool(notifySlackTool);
  registerTool(notifyDiscordTool);
  registerTool(notifyTeamsTool);
  registerTool(notifyEmailTool);
}
