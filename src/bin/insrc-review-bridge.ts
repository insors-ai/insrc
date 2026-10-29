/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readNativeReviewBridgeConfig,forwardNativeReviewCommand } from '../mcp/review-investigation-native.js';
import { createScopedReviewMcpServer } from '../mcp/review-investigation-bridge.js';
// Deliberately independent of insrc-mcp: no general tools, plugins or database access.
const path=process.argv[2];if(!path)throw Error('Private review binding required');
const config=readNativeReviewBridgeConfig(path);
const indexed=process.argv[3]==='indexed-impact';
const server=createScopedReviewMcpServer(config.binding,indexed,command=>forwardNativeReviewCommand(config,command));
await server.connect(new StdioServerTransport());
