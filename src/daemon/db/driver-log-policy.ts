/** Immutable resource diagnostics and daemon-only temporary construction authority. */
import { getLogger } from '../../shared/logger.js';
import type { ConnectionConfig, DriverFactory, DriverFactoryContext } from '../../shared/db-driver.js';
import type { FileExecutionPolicy } from '../../shared/connection-management.js';
export class DriverLogPolicyError extends Error {
 readonly code = 'unsupported-temporary';
 constructor() { super('Temporary driver privacy policy is unavailable.'); this.name = 'DriverLogPolicyError'; }
}
type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export interface DriverResourceLog {
 readonly quiet: boolean;
 readonly emit: (level: Level, format: () => { readonly message: string; readonly fields?: Readonly<Record<string, unknown>> | undefined }) => void;
}
interface Owner { readonly ownerId: string; readonly root: string; readonly assertActive: () => void }
const owners = new WeakMap<object, Owner>();
const contexts = new WeakMap<DriverFactoryContext, object>();
const configs = new WeakMap<ConnectionConfig, { readonly owner: object; readonly revision: string }>();
const factories = new WeakSet<DriverFactory>();
const quiet: DriverResourceLog = Object.freeze({ quiet: true, emit: () => {} });
const denied = () => new DriverLogPolicyError();
/** Called by the session owner for an exact owned overlay, never from connection JSON. */
export function temporaryDriverOwner(ownerId: string, root: string, assertActive: () => void): object {
 const token = Object.freeze({}); owners.set(token, Object.freeze({ ownerId, root, assertActive })); return token;
}
export function temporaryDriverContext(owner: object, policy: FileExecutionPolicy): DriverFactoryContext {
 const record = owners.get(owner); if (!record) throw denied(); record.assertActive();
 if (policy.persistence !== 'memory-only' || policy.allowSpill !== false || policy.memoryBudgetBytes !== 256 * 1024 * 1024 || policy.identity.ownerId !== record.ownerId || policy.identity.lookupRoot !== record.root) throw denied();
 const context: DriverFactoryContext = { runtimeLogPolicy: 'temporary-quiet', fileExecutionPolicy: Object.freeze({ ...policy, identity: Object.freeze({ ...policy.identity }) }) };
 Object.defineProperty(context, 'toJSON', { value: () => { throw denied(); } });
 contexts.set(context, owner); return Object.freeze(context);
}
function validate(context: DriverFactoryContext): object {
 const owner = contexts.get(context), record = owner && owners.get(owner);
 if (!owner || !record || context.runtimeLogPolicy !== 'temporary-quiet' || !Object.isFrozen(context)) throw denied();
 record.assertActive(); return owner;
}
function hasPolicy(context: DriverFactoryContext | undefined): boolean {
 if (context === undefined) return false;
 if (contexts.has(context)) return true;
 try {
  if (Object.getPrototypeOf(context) !== Object.prototype) throw denied();
  const field = Object.getOwnPropertyDescriptor(context, 'runtimeLogPolicy');
  if (!field) return false;
  if (!Object.hasOwn(field, 'value')) throw denied();
  return field.value !== undefined;
 } catch { throw denied(); }
}
/** Factory identity is support, not a config-selected flag. SDK closure proof is a release gate. */
export function contextualDriverFactory(factory: DriverFactory): DriverFactory {
 const wrapped: DriverFactory = (config, context) => {
  const expected = configs.get(config);
  if (expected || hasPolicy(context)) {
   if (!context) throw denied(); const owner = validate(context);
   if (expected && (owner !== expected.owner || context.fileExecutionPolicy?.identity.revision !== expected.revision)) throw denied();
  }
  return factory(config, context);
 };
 factories.add(wrapped); return wrapped;
}
/** Validate before config handoff, including injected factories and wrappers that drop context. */
export function invokeTemporaryFactory(factory: DriverFactory, config: ConnectionConfig, context: DriverFactoryContext) {
 const owner = validate(context), identity = context.fileExecutionPolicy?.identity;
 if (!factories.has(factory) || !identity || identity.connectionId !== config.id) throw denied();
 const existing = configs.get(config);
 if (existing && (existing.owner !== owner || existing.revision !== identity.revision)) throw denied();
 configs.set(config, { owner, revision: identity.revision }); return factory(config, context);
}
export function supportsTemporaryDriverContext(factory: DriverFactory): boolean { return factories.has(factory); }
/** No normal logger is resolved or created on the quiet resource path. */
export function driverResourceLog(module: string, context?: DriverFactoryContext): DriverResourceLog {
 if (hasPolicy(context)) {
  validate(context!);
  // These installed SDK paths expose ambient diagnostics without a resource-local sink.
  // Refuse before SDK construction rather than altering process-wide logging.
  if (module === 'db-nats' || module === 'db-etcd' ||
   ['DEBUG', 'NODE_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL'].some(key => !!process.env[key])) throw denied();
  return quiet;
 }
 return Object.freeze({ quiet: false, emit: (level: Level, format: Parameters<DriverResourceLog['emit']>[1]) => {
  const { fields, message } = format(); getLogger(module)[level](fields ?? {}, message);
 } });
}
