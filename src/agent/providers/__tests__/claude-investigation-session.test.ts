/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import { exerciseNativeInvestigationSessions } from './native-investigation-fixtures.js';
test('Installed v2 sessions recheck native startup policy before accepting scoped operations',()=>exerciseNativeInvestigationSessions('claude',true));
test('Claude scoped session progress budget cancellation and legacy behavior',()=>exerciseNativeInvestigationSessions('claude'));
