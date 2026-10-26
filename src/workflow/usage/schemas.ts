/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import avsc from 'avsc';
import logicalSchema from './ledger-record.v1.schema.json' with { type: 'json' };
import writerSchema from './ledger-record.v1.avsc.json' with { type: 'json' };

/** Freeze only our statically imported schema data, never caller-owned payloads. */
function freezeSchema<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeSchema(child);
    Object.freeze(value);
  }
  return value;
}

export const ledgerRecordV1Schema = freezeSchema(logicalSchema);
export const ledgerRecordV1AvroSchema = freezeSchema(writerSchema);

/**
 * avsc's default long rejects MAX_SAFE_INTEGER. Preserve the entire domain's
 * safe range using its supported custom-long hook and exact bigint conversion.
 * This is an in-memory type only: no container header, writer or filesystem IO.
 * Union values use Avro's explicit branch wrappers, avoiding ambiguous controls.
 * Apply the companion logical validator to domain records before encoding.
 */
export function createUsageAvroType(): avsc.Type {
  const checked = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new RangeError('usage Avro long must be a nonnegative safe integer');
    }
    return value;
  };
  const long = avsc.types.LongType.__with({
    toBuffer(value: unknown): Buffer {
      const bytes = Buffer.alloc(8);
      bytes.writeBigInt64LE(BigInt(checked(value)));
      return bytes;
    },
    fromBuffer(bytes: Buffer): number {
      const value = bytes.readBigInt64LE();
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError('usage Avro long exceeds safe integer bounds');
      }
      return Number(value);
    },
    fromJSON: checked,
    toJSON: checked,
    isValid: (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    compare: (a: number, b: number) => a < b ? -1 : a > b ? 1 : 0,
  });
  return avsc.Type.forSchema(ledgerRecordV1AvroSchema as avsc.Schema, {
    wrapUnions: true,
    typeHook: schema => schema === 'long' ? long : undefined,
  });
}
