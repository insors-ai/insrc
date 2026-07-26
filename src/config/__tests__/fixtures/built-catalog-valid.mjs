// A stand-in for a freshly-BUILT out/config/config-catalog.js. Carries a row
// (`freshKey`) that is absent from the statically-imported src/cli catalog, so
// a test can prove loadBuiltCatalog returned THIS module, not the resident one.
export const CONFIG_CATALOG = [
	{ path: 'freshKey', type: 'string', default: 'fresh', desc: 'only in the freshly built catalog' },
	{ path: 'logLevel', type: 'enum', default: 'info', desc: 'daemon log level' },
];
