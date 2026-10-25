/** Server-owned transport metadata; never deserialized from request params or client labels. */
export interface TrustedRpcContext {
	readonly connectionIdentity: string;
	readonly daemonEpoch: string;
}
