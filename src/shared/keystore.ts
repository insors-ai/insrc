/**
 * Secure key storage via OS keychain (keytar).
 *
 * All keys stored under service name 'insrc'.
 * Key names are stored as accounts (e.g., 'anthropic', 'brave', 'db-password').
 */

import keytar from 'keytar';

const SERVICE = 'insrc';

/**
 * Retrieve a key from the OS keychain.
 */
export async function getKey(name: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, name);
}

/**
 * Store a key in the OS keychain.
 */
export async function setKey(name: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE, name, value);
}

/**
 * Remove a key from the OS keychain.
 */
export async function deleteKey(name: string): Promise<void> {
  await keytar.deletePassword(SERVICE, name);
}

/**
 * List all key names stored under the insrc service.
 * Returns only the account names, not the values.
 */
export async function listKeys(): Promise<string[]> {
  const credentials = await keytar.findCredentials(SERVICE);
  return credentials.map(c => c.account);
}

/**
 * Mask a key value for display.
 *
 * Proportional reveal: show ceil(length / 16) chars, min 2, max 8.
 * Examples:
 *   length  8 → show 2: "sk******"
 *   length 32 → show 2: "sk******"
 *   length 64 → show 4: "sk-a****"
 *   length 128 → show 8: "sk-ant-a****"
 */
export function maskKey(value: string): string {
  if (value.length === 0) return '****';
  const reveal = Math.min(8, Math.max(2, Math.ceil(value.length / 16)));
  return value.slice(0, reveal) + '****';
}
