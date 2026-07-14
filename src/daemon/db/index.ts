/**
 * Data-driver barrel -- imports that other daemon modules reach for.
 *
 * Nothing here yet registers drivers; that happens in phase 1 when
 * the first driver modules land and self-register via
 * `registerDriver` at daemon boot.
 */

export {
	familyOf,
	getFactory,
	kindExists,
	listRegisteredKinds,
	registerDriver,
	unregisterDriver,
	_resetRegistryForTests,
} from './registry.js';

export {
	connectionsPath,
	loadConnections,
	repoIdOf,
	saveConnections,
	type LoadedConnections,
} from './config.js';

export {
	deleteSecret,
	extractUrlPassword,
	makeSecretRef,
	resolveSecrets,
	setSecret,
} from './secrets.js';

export { DriverPool } from './pool.js';

export {
	_resetCacheForTests,
	acquirePool,
	closeAll,
	reloadAll,
} from './pool-cache.js';

export type {
	BaseDriver,
	ColumnDescription,
	ConnectionConfig,
	ConnectionsFile,
	Driver,
	DriverFactory,
	DriverFamily,
	DriverRegistration,
	FileDriver,
	KeyList,
	KvDriver,
	KvValue,
	PlanResult,
	QueryAst,
	RdbmsDriver,
	SampleOpts,
	SampleResult,
	ScanOpts,
	SchemaDescription,
	ShapeReport,
	WhereClause,
} from '../../shared/db-driver.js';
