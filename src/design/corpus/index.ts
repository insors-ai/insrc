/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/**
 * Framework-independent corpus contracts. No I/O, providers, DBs or catalog state.
 * Decoders check structure; validateGuidanceRecord checks draft/publication semantics;
 * validateRelease checks complete in-memory packages. checkPublication additionally
 * requires digest-bound downstream assessments, but never publishes or grants approval.
 */
export * from './contracts.js';
export * from './canonical.js';
export * from './validate.js';
