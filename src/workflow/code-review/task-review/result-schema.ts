/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { CloneType, Type } from '@sinclair/typebox';
import type { TaskAssignment } from './packet.js';
import { TaskResultSchema } from './contracts.js';

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
 const paths = [...new Set(assignment.changes.flatMap(change => [change.path, change.previousPath]))];
 if (paths.length) schema.properties.findings.items.properties.location = Type.String({ pattern: `^(?:${paths.map(escape).join('|')})(?::[1-9][0-9]*(?:-[1-9][0-9]*)?)?$`, maxLength: 65536 });
 else schema.properties.findings.maxItems = 0;
 return schema;
}
