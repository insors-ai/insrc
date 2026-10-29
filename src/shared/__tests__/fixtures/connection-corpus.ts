/** Test-only shared corpus. Never bundle fixtures or synthetic tickets into a client. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const connectionCorpusDirectory = new URL('../../../../test-fixtures/connection-management/v1/', import.meta.url);
export interface CorpusWireCase { id: string; kind: string; input: unknown; valid: boolean }
export interface CorpusTranscript { id: string; initial: Record<string, unknown>; events: Record<string, unknown>[]; expected: Record<string, unknown>; effects: Record<string, unknown>[] }
export interface ConnectionCorpus {
 version: 1; protocolVersion: 2; releaseEnabled: false; fixturesAreAcceptance: false;
 identity: { key: { repoRoot: string; scope: string; id: string }; revision: string; operationId: string; daemonEpoch: string };
 wire: CorpusWireCase[]; transcripts: CorpusTranscript[]; removalSnapshots: unknown[];
 managerScenarios: {id:string;steps:{event:Record<string,unknown>;expected:Record<string,unknown>;effects?:Record<string,unknown>[]}[]}[];
 driverDescriptors: unknown[]; draftTestMessages: Record<string,string>;
 coverage: { subject: string; requirement: string; acceptance: 'pending'; fixtureEvidenceOnly: true; requiredEvidence: string }[];
}

export function verifyConnectionCorpus(bytes: Uint8Array, manifest: Record<string, unknown>): ConnectionCorpus {
 if (manifest['version'] !== 1 || manifest['protocolVersion'] !== 2 || manifest['file'] !== 'corpus.json' || manifest['digest'] !== 'sha256-bytes'
  || createHash('sha256').update(bytes).digest('hex') !== manifest['sha256']) throw new Error('Connection corpus version/digest mismatch.');
 const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as ConnectionCorpus;
 if (value.version !== 1 || value.protocolVersion !== 2 || value.releaseEnabled !== false || value.fixturesAreAcceptance !== false) throw new Error('Connection corpus version/acceptance mismatch.');
 return value;
}

export function loadConnectionCorpus(): ConnectionCorpus {
 return verifyConnectionCorpus(readFileSync(new URL('corpus.json', connectionCorpusDirectory)),
  JSON.parse(readFileSync(new URL('manifest.json', connectionCorpusDirectory), 'utf8')) as Record<string, unknown>);
}
