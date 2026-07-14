/**
 * gh:release:* -- GitHub Releases.
 *
 * list / view are read-only. create / edit / publish / delete gate.
 */

import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, num, md, fail, shellFail, ghExec, parseJson } from './helpers.js';

interface RawRelease {
  tagName: string;
  name?: string;
  isDraft?: boolean;
  isPrerelease?: boolean;
  author?: { login?: string };
  publishedAt?: string;
  createdAt?: string;
  url?: string;
  body?: string;
}

export const ghReleaseListTool: Tool = {
  id: 'gh_release_list',
  description: 'List releases.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 200 },
      excludeDrafts: { type: 'boolean' },
      excludePrereleases: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'release', 'list'];
    const limit = num(input, 'limit') ?? 30;
    argv.push('-L', String(limit));
    if (input['excludeDrafts']      === true) { argv.push('--exclude-drafts'); }
    if (input['excludePrereleases'] === true) { argv.push('--exclude-pre-releases'); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_release_list', r); }
    // gh release list has no --json option on older versions; parse the
    // tab-separated output: "<tag>\t<type>\t<tag>\t<published>"
    const releases: RawRelease[] = [];
    for (const line of r.stdout.split('\n')) {
      if (!line.trim()) { continue; }
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const tag = (parts[2] ?? parts[0] ?? '').trim();
        const type = (parts[1] ?? '').trim().toLowerCase();
        releases.push({
          tagName: tag,
          name: (parts[0] ?? '').trim(),
          isDraft: type === 'draft',
          isPrerelease: type === 'pre-release',
          publishedAt: (parts[3] ?? '').trim(),
        });
      }
    }
    const lines: string[] = [`# ${releases.length} release${releases.length === 1 ? '' : 's'}`, ''];
    if (releases.length > 0) {
      lines.push('| Tag | Name | Draft | Prerelease | Published |');
      lines.push('|-----|------|-------|-----------|-----------|');
      for (const rel of releases) {
        lines.push(`| \`${rel.tagName}\` | ${md(rel.name ?? '')} | ${rel.isDraft ? 'yes' : 'no'} | ${rel.isPrerelease ? 'yes' : 'no'} | ${rel.publishedAt ?? '—'} |`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { count: releases.length, releases } };
  },
};

export const ghReleaseViewTool: Tool = {
  id: 'gh_release_view',
  description: 'View a release (tag, body, assets).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      tag: { type: 'string', description: 'Release tag. Default: latest.' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const tag = str(input, 'tag');
    const argv = ['gh', 'release', 'view'];
    if (tag) { argv.push(tag); }
    argv.push('--json', 'tagName,name,isDraft,isPrerelease,author,publishedAt,createdAt,url,body');
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_release_view', r); }
    const rel = parseJson<RawRelease>(r.stdout);
    if (!rel) { return fail('gh_release_view', 'could not parse JSON'); }
    const lines: string[] = [
      `# Release ${rel.tagName}${rel.name ? ` -- ${md(rel.name)}` : ''}`,
      '',
      `State: ${rel.isDraft ? '**draft**' : rel.isPrerelease ? '**prerelease**' : 'published'}`,
      `Published: ${rel.publishedAt ?? '(not published)'}`,
      rel.url ? `URL: ${rel.url}` : '',
      '',
      rel.body?.trim() || '_(no release notes)_',
    ].filter(Boolean);
    return { output: lines.join('\n').trimEnd(), format: 'markdown', success: true, data: rel };
  },
};

export const ghReleaseCreateTool: Tool = {
  id: 'gh_release_create',
  description: 'Create a release.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      tag: { type: 'string' },
      title: { type: 'string' },
      notes: { type: 'string' },
      target: { type: 'string', description: 'Branch or commit SHA (default: repo default).' },
      draft: { type: 'boolean' },
      prerelease: { type: 'boolean' },
      generateNotes: { type: 'boolean', description: 'Auto-generate release notes.' },
      assets: { type: 'array', items: { type: 'string' }, description: 'File paths to attach.' },
    },
    required: ['tag'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_release_create',
      content: [
        `Repo: **${str(input, 'repo') ?? '(current)'}**`,
        `Tag: \`${str(input, 'tag')}\``,
        str(input, 'title') ? `Title: **${str(input, 'title')}**` : '',
        str(input, 'target') ? `Target: \`${str(input, 'target')}\`` : '',
        input['draft']       === true ? 'Draft: yes' : '',
        input['prerelease']  === true ? 'Prerelease: yes' : '',
        input['generateNotes'] === true ? 'Auto-generate notes: yes' : '',
        str(input, 'notes') ? '\n**Notes**\n```\n' + str(input, 'notes')!.slice(0, 1500) + '\n```' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit notes', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, notes: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const tag = str(input, 'tag');
    if (!tag) { return fail('gh_release_create', 'missing tag'); }
    const argv = ['gh', 'release', 'create', tag];
    if (str(input, 'title'))  { argv.push('-t', str(input, 'title')!); }
    if (str(input, 'notes'))  { argv.push('-n', str(input, 'notes')!); }
    else if (input['generateNotes'] !== true) { argv.push('-n', ''); }
    if (str(input, 'target')) { argv.push('--target', str(input, 'target')!); }
    if (input['draft']      === true) { argv.push('-d'); }
    if (input['prerelease'] === true) { argv.push('-p'); }
    if (input['generateNotes'] === true) { argv.push('--generate-notes'); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const assets = Array.isArray(input['assets']) ? (input['assets'] as unknown[]).map(String) : [];
    argv.push(...assets);
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), timeoutMs: 180_000 });
    if (r.code !== 0) { return shellFail('gh_release_create', r); }
    return { output: `Created release \`${tag}\`.\n${r.stdout.trim()}`, format: 'markdown', success: true, data: { tag, url: r.stdout.trim() } };
  },
};

export const ghReleaseEditTool: Tool = {
  id: 'gh_release_edit',
  description: 'Edit a release (title / notes / tag / draft / prerelease flags).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      tag: { type: 'string' },
      newTag: { type: 'string' },
      title: { type: 'string' },
      notes: { type: 'string' },
      draft: { type: 'boolean' },
      prerelease: { type: 'boolean' },
    },
    required: ['tag'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const parts: string[] = [];
    if (str(input, 'newTag')) { parts.push(`tag -> \`${str(input, 'newTag')}\``); }
    if (str(input, 'title'))  { parts.push(`title -> "${str(input, 'title')}"`); }
    if (typeof input['notes'] === 'string')      { parts.push('notes changed'); }
    if (typeof input['draft'] === 'boolean')     { parts.push(`draft -> ${input['draft']}`); }
    if (typeof input['prerelease'] === 'boolean') { parts.push(`prerelease -> ${input['prerelease']}`); }
    return {
      title: 'gh_release_edit',
      content: `Release \`${str(input, 'tag')}\` in **${str(input, 'repo') ?? '(current)'}**\n\n` + (parts.length === 0 ? '_(no changes)_' : parts.map(p => `- ${p}`).join('\n')),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const tag = str(input, 'tag');
    if (!tag) { return fail('gh_release_edit', 'missing tag'); }
    const argv = ['gh', 'release', 'edit', tag];
    if (str(input, 'newTag')) { argv.push('--tag', str(input, 'newTag')!); }
    if (str(input, 'title'))  { argv.push('-t', str(input, 'title')!); }
    if (typeof input['notes'] === 'string') { argv.push('-n', input['notes'] as string); }
    if (input['draft']      === true) { argv.push('--draft=true'); }
    if (input['draft']      === false) { argv.push('--draft=false'); }
    if (input['prerelease'] === true) { argv.push('--prerelease=true'); }
    if (input['prerelease'] === false) { argv.push('--prerelease=false'); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_release_edit', r); }
    return { output: `Edited release \`${tag}\`.`, format: 'markdown', success: true, data: { tag } };
  },
};

export const ghReleasePublishTool: Tool = {
  id: 'gh_release_publish',
  description: 'Publish a draft release.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      tag: { type: 'string' },
    },
    required: ['tag'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_release_publish',
      content: `Publish draft release \`${str(input, 'tag')}\` in **${str(input, 'repo') ?? '(current)'}**.`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const tag = str(input, 'tag');
    if (!tag) { return fail('gh_release_publish', 'missing tag'); }
    const argv = ['gh', 'release', 'edit', tag, '--draft=false'];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_release_publish', r); }
    return { output: `Published release \`${tag}\`.`, format: 'markdown', success: true, data: { tag } };
  },
};

export const ghReleaseDeleteTool: Tool = {
  id: 'gh_release_delete',
  description: 'Delete a release.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      tag: { type: 'string' },
      cleanupTag: { type: 'boolean', description: 'Also delete the git tag.' },
    },
    required: ['tag'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_release_delete',
      content: [
        `Delete release \`${str(input, 'tag')}\` in **${str(input, 'repo') ?? '(current)'}**.`,
        input['cleanupTag'] === true ? 'Also deleting the git tag.' : 'Git tag will be kept.',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const tag = str(input, 'tag');
    if (!tag) { return fail('gh_release_delete', 'missing tag'); }
    const argv = ['gh', 'release', 'delete', tag, '-y'];
    if (input['cleanupTag'] === true) { argv.push('--cleanup-tag'); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_release_delete', r); }
    return { output: `Deleted release \`${tag}\`.`, format: 'markdown', success: true, data: { tag } };
  },
};
