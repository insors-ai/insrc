/** Read-only source inventory. Type resolution catches renamed imports and injected pool ports. */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export interface InventorySite { file: string; expression: string; boundary: string }

function filesUnder(root: string): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
		const path = join(root, entry.name);
		return entry.isDirectory() ? (entry.name === '__tests__' ? [] : filesUnder(path))
			: /\.tsx?$/.test(path) && !path.endsWith('.test.ts') ? [path] : [];
	});
}

export function connectionSourceInventory(root: string): InventorySite[] {
	const configPath = join(root, 'tsconfig.json');
	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	if (config.error) throw new Error('Cannot read source inventory tsconfig');
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
	const program = ts.createProgram(filesUnder(join(root, 'src')), parsed.options);
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

