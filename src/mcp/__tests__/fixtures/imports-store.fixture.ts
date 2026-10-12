/**
 * A fixture for the MCP import-graph test (Epic c2ba6fa6, Story s11, t9): a
 * module that imports the graph store by value. Never imported by the server;
 * the test adds it as an extra root and expects the walk to report it.
 */
import { getGraphStore } from '../../../db/graph/store.js';
import type { Entity } from '../../../shared/types.js';

export const fixtureOpens = getGraphStore;
export type FixtureEntity = Entity;
