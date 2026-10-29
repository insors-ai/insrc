/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { z } from 'zod';
import { ReviewInvestigationCommandSchema,parseReviewInvestigationCommand,ReviewIntegrationError } from './review-investigation.js';
import { reviewBudgetDeclarationSchema } from './review-controller-budget-schema.js';

/** Same registered schema is used by MCP and daemon admission; caller JSON carries no party/receipt authority. */
export const investigationCapabilitiesSchema=z.object({version:z.literal(1),engines:z.array(z.enum(['legacy','plan-investigation-v1'])).max(8),
 investigationWireVersions:z.array(z.number().int().nonnegative()).max(16),canonicalInvestigationVersions:z.array(z.number().int().nonnegative()).max(16),
 operations:z.array(z.enum(['start','status','resume','cancel','read','impact','progress','reply'])).max(16)}).strict();
export const investigationEnvelopeInput={version:z.literal(1),engine:z.literal('plan-investigation-v1'),
 command:z.fromJSONSchema(JSON.parse(JSON.stringify(ReviewInvestigationCommandSchema))),capabilities:investigationCapabilitiesSchema,
 reviewBudget:reviewBudgetDeclarationSchema.optional()};
const envelopeSchema=z.object(investigationEnvelopeInput).strict();
export type InvestigationEnvelope=Omit<z.infer<typeof envelopeSchema>,'command'>&{readonly command:ReturnType<typeof parseReviewInvestigationCommand>};
export function isInvestigationInput(input:unknown):boolean{
 return !!input&&typeof input==='object'&&('engine' in input||'command' in input||('phase' in input&&input.phase==='investigation'));
}
export function parseInvestigationEnvelope(raw:unknown):InvestigationEnvelope{
 let value:Record<string,unknown>;
 try{const text=JSON.stringify(raw);if(!text||Buffer.byteLength(text)>1024*1024)throw Error('bound');value=JSON.parse(text) as Record<string,unknown>;}catch{throw new ReviewIntegrationError('invalid-command','Invalid investigation envelope');}
 if(value&&Object.hasOwn(value,'phase')){if(value['phase']!=='investigation')throw new ReviewIntegrationError('invalid-command','Investigation commands require their own phase');delete value['phase'];}
 const parsed=envelopeSchema.safeParse(value);if(!parsed.success)throw new ReviewIntegrationError('invalid-command','Invalid investigation engine, version or envelope fields');
 const capabilities=parsed.data.capabilities;
 if(!capabilities.engines.includes('plan-investigation-v1')||!capabilities.investigationWireVersions.includes(1)||!capabilities.canonicalInvestigationVersions.includes(1))throw new ReviewIntegrationError('unsupported-version','Compatible investigation command and canonical readers are required');
 const command=parseReviewInvestigationCommand(parsed.data.command);if(!capabilities.operations.includes(command.operation))throw new ReviewIntegrationError('unsupported-version','Client does not support the requested operation');
 return {...parsed.data,command};
}
