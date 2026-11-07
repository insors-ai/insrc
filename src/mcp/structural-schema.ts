import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { TSchema } from '@sinclair/typebox';

/** Advertise the same bounded structural schemas the task host enforces. */
export function structural(schema: TSchema): z.ZodTypeAny {
 let output: z.ZodTypeAny;
 if (schema.const !== undefined) output = z.literal(schema.const);
 else if (schema.anyOf) output = z.union(schema.anyOf.map((entry: TSchema) => structural(entry)) as [z.ZodTypeAny,z.ZodTypeAny,...z.ZodTypeAny[]]);
 else if (schema.type === 'object') {
  const required = new Set(schema.required ?? []);
  const fields = Object.fromEntries(Object.entries(schema.properties as Record<string,TSchema>).map(([name,child]) => [name, required.has(name) ? structural(child) : structural(child).optional()]));
  output = schema.additionalProperties === false ? z.object(fields).strict() : z.object(fields);
 } else if (schema.type === 'array') {
  if (Array.isArray(schema.items)) {
   // Codex cannot ingest draft-07 array-valued `items`. Homogeneous tuples
   // have the same contract as a fixed-length array with one item schema.
   const first = schema.items[0] as TSchema | undefined;
   output = first && schema.items.every((entry: TSchema) => isDeepStrictEqual(entry, first))
    ? z.array(structural(first)).length(schema.items.length)
    : z.tuple(schema.items.map((entry: TSchema) => structural(entry)) as [z.ZodTypeAny,...z.ZodTypeAny[]]);
  }
  else { let array = z.array(structural(schema.items)); if (schema.minItems !== undefined) array = array.min(schema.minItems); if (schema.maxItems !== undefined) array = array.max(schema.maxItems); output = array; }
 } else if (schema.type === 'string') {
  let text = z.string(); if(schema.minLength!==undefined)text=text.min(schema.minLength);if(schema.maxLength!==undefined)text=text.max(schema.maxLength);if(schema.pattern)text=text.regex(new RegExp(schema.pattern));output=text;
 } else if (schema.type === 'integer' || schema.type === 'number') {
  let number=z.number();if(schema.type==='integer')number=number.int();if(schema.minimum!==undefined)number=number.min(schema.minimum);if(schema.maximum!==undefined)number=number.max(schema.maximum);output=number;
 } else if(schema.type==='boolean')output=z.boolean();
 else if(schema.type==='null')output=z.null();
 else throw new Error('Unsupported structural schema');
 return schema.description ? output.describe(schema.description) : output;
}
