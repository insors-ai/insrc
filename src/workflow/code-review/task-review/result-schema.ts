/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { CloneType, Type } from '@sinclair/typebox';
import type { TaskAssignment } from './packet.js';
import { TaskResultSchema, reviewJsonLimit, requireReview } from './contracts.js';

/** Decimal interval without enumerating lines or introducing leading zeros. */
function decimalRange(low: string, high: string): string {
 if (low === high) return low;
 if (low[0] === high[0]) return low[0]! + decimalRange(low.slice(1), high.slice(1));
 const first = Number(low[0]), last = Number(high[0]), rest = low.length - 1;
 if (!rest) return `[${first}-${last}]`;
 const parts = [String(first) + decimalRange(low.slice(1), '9'.repeat(rest))];
 if (last > first + 1) parts.push(`${last === first + 2 ? first + 1 : `[${first + 1}-${last - 1}]`}[0-9]{${rest}}`);
 parts.push(String(last) + decimalRange('0'.repeat(rest), high.slice(1)));
 return `(?:${parts.join('|')})`;
}
function lineRange(low: number, high: number): string {
 requireReview(Number.isSafeInteger(low) && Number.isSafeInteger(high) && low >= 1 && high >= low, 'scope_conflict', 'Invalid schema line interval');
 const parts = [];
 for (let digits = String(low).length; digits <= String(high).length; digits++) parts.push(decimalRange(digits === String(low).length ? String(low) : '1' + '0'.repeat(digits - 1), digits === String(high).length ? String(high) : '9'.repeat(digits)));
 return `(?:${parts.join('|')})`;
}

/** Constrain native structured output as well as the final host validator.
 * Context references remain open to committed files the reviewer investigates;
 * identity and finding locations belong to this assignment, never placeholders. */
export function assignmentResultSchema(assignment: TaskAssignment): typeof TaskResultSchema {
 const schema = CloneType(TaskResultSchema);
 const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 schema.properties.taskId = Type.String({ pattern: `^${escape(assignment.taskId)}$` });
 const references = Type.Array(Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64}):[^:\\x00-\\x1f\\x7f]+$', minLength: 42, maxLength: 65536 }), { maxItems: 10000 });
 schema.properties.inspectedReferences = references;
 schema.properties.testCoverage.properties.evidenceReferences = references;
 schema.properties.executedTests.items.properties.evidenceReferences = references;
 schema.properties.findings.items.properties.evidenceReferences = { ...references, minItems: 1 };
 const locations = assignment.changes.flatMap(change => {
  if (!('origin' in change)) return [change.path, change.previousPath].map(path => `${escape(path)}(?::[1-9][0-9]*(?:-[1-9][0-9]*)?)?`);
  if (change.findingScope === 'none') return [];
  return change.segments.map(segment => {
   if ('after' in segment) { const range = lineRange(segment.after[0], segment.after[1]); return `${escape(change.path)}:${range}(?:-${range})?`; }
   const boundary = Math.max(1, segment.deletionAt);
   return `${escape(change.path)}:${boundary}(?:-${boundary})?`;
  });
 });
 if (locations.length) schema.properties.findings.items.properties.location = Type.String({ pattern: `^(?:${[...new Set(locations)].join('|')})$`, maxLength: 65536 });
 else schema.properties.findings.maxItems = 0;
 requireReview(Buffer.byteLength(JSON.stringify(schema)) <= reviewJsonLimit(), 'projection_limit', 'Final-scope response schema exceeds its bound');
 return schema;
}
