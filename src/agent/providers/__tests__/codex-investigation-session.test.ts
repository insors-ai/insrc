/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import { exerciseNativeInvestigationSessions } from './native-investigation-fixtures.js';
test('Codex scoped session progress budget cancellation and legacy behavior',()=>exerciseNativeInvestigationSessions('codex'));
