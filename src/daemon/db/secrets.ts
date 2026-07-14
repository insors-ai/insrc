/**
 * Keychain integration for the data driver.
 *
 * Connection secrets (RDBMS passwords, AWS profiles, etc.) live in
 * the OS keychain under the existing `insrc` service and are
 * referenced from `db-connections.json` via a `${secret:<ref>}`
 * token inside the `url` field + a `secretRef` pointer.
 *
 * Ref naming convention: `db:<repoId>:<connId>`. The setup UX (phase
 * 2) owns ref minting; this module just resolves + manages them.
 */

import { getLogger } from '../../shared/logger.js';
import * as defaultKeystore from '../../shared/keystore.js';

const log = getLogger('db-secrets');

const SECRET_TOKEN = /\$\{secret:([^}]+)\}/g;

// Indirection through a mutable reference so tests can swap in an
// in-memory fake -- ESM namespace imports are non-configurable, so
// `mock.method` against `keystore` doesn't work here.
interface KeystoreLike {
	getKey(name: string): Promise<string | null>;
	setKey(name: string, value: string): Promise<void>;
	deleteKey(name: string): Promise<void>;
}
let keystore: KeystoreLike = defaultKeystore;

export function _setKeystoreForTests(impl: KeystoreLike): void {
	keystore = impl;
}

export function makeSecretRef(repoId: string, connId: string): string {
	return `db:${repoId}:${connId}`;
}

/**
 * Replace every `${secret:<ref>}` token in `value` with its keychain
 * value. Missing refs throw -- callers are responsible for catching
 * and surfacing a user-actionable error (eg. "re-enter password via
 * insrc.editDbConnection").
 */
export async function resolveSecrets(value: string): Promise<string> {
	const tokens = Array.from(value.matchAll(SECRET_TOKEN));
	if (tokens.length === 0) { return value; }
	let out = value;
	for (const match of tokens) {
		const ref = match[1];
		if (ref === undefined) { continue; }
		const secret = await keystore.getKey(ref);
		if (secret === null) {
			throw new Error(`data-driver: missing keychain secret for ref '${ref}'`);
		}
		out = out.replace(match[0], secret);
	}
	return out;
}

export function setSecret(ref: string, value: string): Promise<void> {
	log.debug({ ref }, 'setting data-driver secret');
	return keystore.setKey(ref, value);
}

export function deleteSecret(ref: string): Promise<void> {
	log.debug({ ref }, 'deleting data-driver secret');
	return keystore.deleteKey(ref);
}

/**
 * Given a raw connection URL, extract the password component (if any),
 * store it under `ref`, and return the URL with the password replaced
 * by `${secret:<ref>}`.
 *
 * Returns the original URL unchanged (and does not touch the keychain)
 * when no password is present.
 *
 * Used by the setup UX on save: the user enters a plaintext URL in
 * the palette prompt, we redact it before writing to
 * db-connections.json.
 */
export async function extractUrlPassword(
	rawUrl: string,
	ref: string,
): Promise<string> {
	let u: URL;
	try {
		u = new URL(rawUrl);
	} catch {
		// Not a URL (sqlite path, mongodb atlas SRV without scheme, ...)
		// -- nothing to redact.
		return rawUrl;
	}
	if (u.password === '') { return rawUrl; }
	const password = decodeURIComponent(u.password);
	await setSecret(ref, password);
	u.password = `\${secret:${ref}}`;
	// URL constructor re-encodes the `${...}` token -- undo that so it
	// round-trips cleanly through JSON + resolveSecrets. Two variants
	// observed: `$` may or may not be percent-encoded depending on Node
	// version, but `{`, `}`, and `:` always are inside userinfo.
	return u.toString()
		.replace(/(?:\$|%24)%7Bsecret%3A/, '${secret:')
		.replace(encodeURIComponent(ref) + '%7D', ref + '}');
}
