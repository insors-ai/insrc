/** Read-only source inventory. Type resolution catches renamed imports and injected pool ports. */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export interface InventorySite { file: string; expression: string; boundary: string }

function sourceProgram(root: string): ts.Program {
	const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
	if (config.error) throw new Error('Cannot read source inventory tsconfig');
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
	return ts.createProgram(filesUnder(join(root, 'src')), parsed.options);
}

function filesUnder(root: string): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
		const path = join(root, entry.name);
		return entry.isDirectory() ? (entry.name === '__tests__' ? [] : filesUnder(path))
			: /\.tsx?$/.test(path) && !path.endsWith('.test.ts') ? [path] : [];
	});
}

export function connectionSourceInventory(root: string): InventorySite[] {
	const program = sourceProgram(root);
	const checker = program.getTypeChecker();
	const sites: InventorySite[] = [];
	const roots = new Set(['acquirePool', 'acquireDataPool', 'acquireDriver', 'withDriver', 'getFactory', 'DriverPool', 'DriverFactory', 'registerEphemeral', 'ConnectionResolver', 'createConnectionResolver', 'dataConnectionResolver', 'savedConnectionResolver']);
	function canonical(node: ts.Node): ts.Symbol | undefined {
		let symbol = checker.getSymbolAtLocation(node);
		if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
		return symbol;
	}
	function isPool(type: ts.Type): boolean {
		return type.symbol?.name === 'DriverPool' || type.isUnionOrIntersection() && type.types.some(isPool);
	}
	function isResolver(type: ts.Type): boolean {
		return type.symbol?.name === 'ConnectionResolver' || type.aliasSymbol?.name === 'ConnectionResolver' || type.isUnionOrIntersection() && type.types.some(isResolver);
	}
	for (const source of program.getSourceFiles()) {
		const file = relative(root, source.fileName).replaceAll('\\', '/');
		if (!file.startsWith('src/') || file.includes('/__tests__/') || source.isDeclarationFile) continue;
		function visit(node: ts.Node): void {
			let boundary: string | undefined;
			if (ts.isIdentifier(node)) {
				const symbol = canonical(node);
				if (symbol && roots.has(symbol.name) && symbol.declarations?.some(d => /\/src\/(daemon\/|analyze\/runtimes\/data|shared\/(?:db-driver|connection-management))/.test(d.getSourceFile().fileName))) {
					boundary = `symbol:${symbol.name}`;
				}
			}
			if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
				if (isPool(checker.getTypeAtLocation(node.expression))) boundary = 'pool-member';
				if (isResolver(checker.getTypeAtLocation(node.expression))) boundary = 'resolver-member';
			}
			if (ts.isCallExpression(node)) {
				const signature = checker.getResolvedSignature(node);
				const result = signature && checker.getReturnTypeOfSignature(signature);
				// Awaited injected aliases need not share an import symbol.
				if (result && isPool(checker.getAwaitedType(result) ?? result)) boundary = 'pool-port-call';
				if (result && isResolver(checker.getAwaitedType(result) ?? result)) boundary = 'resolver-port-call';
				if (result?.symbol?.name === 'DriverFactory') boundary = 'factory-port-call';
				const awaited = result && (checker.getAwaitedType(result) ?? result);
				if (awaited?.aliasSymbol?.name === 'Driver') boundary = 'driver-port-call';
				if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'acquire') {
					boundary ??= 'acquire-call'; // Includes library pools/locks for explicit exclusion.
				}
			}
			if (boundary) sites.push({ file, expression: node.getText(source), boundary });
			ts.forEachChild(node, visit);
		}
		visit(source);
	}
	return sites.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** Broader candidate inventory, deliberately including background/forbidden-route sites.
 * Each file needs an explicit reviewed classification; presence is not a safety proof.
 * Keep the S001 acquisition baseline separate so new sink families cannot hide its drift.
 */
export function sessionSourceInventory(root: string): InventorySite[] {
	const acquisitions = connectionSourceInventory(root).map(site => ({ ...site, boundary: `acquisition:${site.boundary}` }));
	const program = sourceProgram(root);
	const checker = program.getTypeChecker();
	const sites: InventorySite[] = [...acquisitions];
	const providerNames = new Set(['LLMProvider', 'OllamaProvider', 'CliProvider']);
	const connectionNames = new Set(['ConnectionResolver', 'DriverPool', 'DriverFactory', 'Driver', 'BaseDriver', 'RdbmsDriver', 'KvDriver', 'FileDriver']);
	const named = (type: ts.Type, names: Set<string>): boolean =>
		names.has(type.symbol?.name ?? '') || names.has(type.aliasSymbol?.name ?? '')
		|| type.isUnionOrIntersection() && type.types.some(t => named(t, names));
	for (const source of program.getSourceFiles()) {
		const file = relative(root, source.fileName).replaceAll('\\', '/');
		if (!file.startsWith('src/') || file.includes('/__tests__/') || source.isDeclarationFile) continue;
		function visit(node: ts.Node): void {
			if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
				const callee = node.expression;
				const expression = callee.getText(source);
				const signature = checker.getResolvedSignature(node);
				const declarationFile = signature?.declaration?.getSourceFile().fileName.replaceAll('\\', '/') ?? '';
				let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
				if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
				const name = symbol?.name ?? expression;
				const declaration = signature?.declaration;
				const declaredName = declaration?.name && ts.isIdentifier(declaration.name) ? declaration.name.text : name;
				const parent = declaration?.parent;
				const ownerName = parent && ts.isInterfaceDeclaration(parent) ? parent.name.text : '';
				const boundaries = new Set<string>();
				if (providerNames.has(ownerName)) boundaries.add('provider-use');
				if (connectionNames.has(ownerName)) boundaries.add('connection-use');
				if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
					const receiver = checker.getTypeAtLocation(callee.expression);
					if (named(receiver, providerNames)) boundaries.add('provider-use');
					if (named(receiver, connectionNames)) boundaries.add('connection-use');
				}
				if (signature) {
					const result = checker.getReturnTypeOfSignature(signature);
					const awaited = checker.getAwaitedType(result) ?? result;
					if (named(awaited, providerNames)) boundaries.add('provider-factory');
					if (named(awaited, connectionNames)) boundaries.add('connection-factory');
				}
				if (/\/src\/agent\/providers\//.test(declarationFile)) boundaries.add('provider-adapter');
				// typeof embedQuery keeps the original function declaration even when
				// injected under a different object/member name. It is not LLMProvider.
				if (/\/src\/indexer\/embedder\.ts$/.test(declarationFile)) {
					boundaries.add('provider-adapter');
					if (/^embed/.test(declaredName)) boundaries.add('provider-use');
				}
				// ONNX's awaited pipeline is explicitly cast to a callable tensor port,
				// not LLMProvider. Resolve its function-type declaration, including aliases.
				if (file === 'src/agent/providers/onnx-embedder.ts' && declaration && ts.isFunctionTypeNode(declaration)) boundaries.add('provider-use');
				if (/\/node_modules\/(?:ollama\/|@huggingface\/transformers\/|onnxruntime)/.test(declarationFile)) boundaries.add('provider-backend');
				if (/\/(?:node_modules\/pino|src\/shared\/logger)/.test(declarationFile)
					|| /^(?:console\.|process\.(?:stdout|stderr)\.)/.test(expression)) boundaries.add('diagnostic');
				if (ownerName === 'JSON' && declaredName === 'stringify' || /(?:serialize|checkpoint|persist|trace)/i.test(declaredName)) boundaries.add('serialization');
				if (/^(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|rename|renameSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync)$/.test(declaredName)
					&& /(?:\/node_modules\/@types\/node\/fs|\/src\/)/.test(declarationFile)) boundaries.add('filesystem-write');
				if (/\/src\/(?:db\/|analyze\/(?:.*\/)?(?:cache|persistence)\.ts)/.test(declarationFile)) boundaries.add('storage-call');
				for (const boundary of boundaries) sites.push({ file, expression, boundary });
			}
			ts.forEachChild(node, visit);
		}
		visit(source);
	}
	return sites.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

