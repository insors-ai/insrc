/** Resolve activation's AWS identity in the parent; private probe workers receive only a snapshot. */
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import { ProfileError } from './driver-profiles.js';
import { parseDynamoRuntimeAuth } from './draft-probe.js';
import type { DynamoRuntimeAuth } from './draft-probe.js';

export interface DynamoIdentity {
	readonly accessKeyId: string; readonly secretAccessKey: string;
	readonly sessionToken?: string | undefined; readonly expiration?: Date | undefined;
}
export type DynamoIdentityProvider = () => Promise<DynamoIdentity>;
export function dynamoIdentityProvider(config: ConnectionConfig): DynamoIdentityProvider {
	const profile = config.options?.['profile'];
	if (profile !== undefined && (typeof profile !== 'string' || !profile.length)) throw new ProfileError();
	return typeof profile === 'string' ? fromIni({ profile }) : fromNodeProviderChain();
}
export async function prepareDynamoAuth(config: ConnectionConfig, signal?: AbortSignal, provider: DynamoIdentityProvider = dynamoIdentityProvider(config), now: () => number = Date.now): Promise<DynamoRuntimeAuth> {
	signal?.throwIfAborted();
	if (config.kind !== 'dynamodb') throw new ProfileError();
	let value: DynamoIdentity;
	try { value = await provider(); } catch { signal?.throwIfAborted(); throw new ProfileError('secret-unavailable'); }
	signal?.throwIfAborted();
	try {
		const auth = parseDynamoRuntimeAuth({ type: 'aws-v1', accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey,
			...(value.sessionToken !== undefined ? { sessionToken: value.sessionToken } : {}), ...(value.expiration !== undefined ? { expiration: value.expiration.toISOString() } : {}) });
		if (auth.expiration !== undefined && Date.parse(auth.expiration) <= now()) throw new Error();
		return auth;
	} catch { throw new ProfileError('secret-unavailable'); }
}
export function dynamoSnapshotIdentity(value: DynamoRuntimeAuth): DynamoIdentity {
	try {
		const auth = parseDynamoRuntimeAuth(value);
		if (auth.expiration !== undefined && Date.parse(auth.expiration) <= Date.now()) throw new Error();
		return { accessKeyId: auth.accessKeyId, secretAccessKey: auth.secretAccessKey, ...(auth.sessionToken !== undefined ? {sessionToken:auth.sessionToken}:{}), ...(auth.expiration !== undefined ? {expiration:new Date(auth.expiration)}:{}) };
	} catch { throw new ProfileError('secret-unavailable'); }
}
