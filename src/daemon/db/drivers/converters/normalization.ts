/** One normalization contract shared by saved Parquet and memory row sinks. */
import type { ConvertedColumn } from '../../../../shared/connection-management.js';

export function convertedColumn(name: string, physicalType: string, nullable = true, normalization = 'scalar'): ConvertedColumn {
 const logicalTypes: Record<string, string> = { UTF8: 'string', INT32: 'integer', INT64: 'integer', FLOAT: 'number', DOUBLE: 'number', BOOLEAN: 'boolean', BYTE_ARRAY: 'binary', TIMESTAMP_MILLIS: 'timestamp' };
 const logicalType = logicalTypes[physicalType];
 if (logicalType === undefined) throw new Error('Unsupported converted physical type');
 return { name, logicalType, physicalType, nullable, normalization };
}
export function normalizeScalar(value: unknown, column: ConvertedColumn): unknown {
 if (value === null || value === undefined) return null;
 if (column.normalization === 'json') return JSON.stringify(value, (_key, v: unknown) => typeof v === 'bigint' ? v.toString() : v);
 switch (column.physicalType) {
  case 'TIMESTAMP_MILLIS': return value instanceof Date ? value.getTime() : value;
  case 'BYTE_ARRAY': return value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(String(value));
  case 'UTF8': return value instanceof Date ? value.toISOString() : String(value);
  default: return value;
 }
}
