/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readNativeReviewBridgeConfig,forwardNativeReviewCommand,resolveNativeReviewBindingPath,NATIVE_REVIEW_BINDING_ENV } from '../mcp/review-investigation-native.js';
import { createScopedReviewMcpServer } from '../mcp/review-investigation-bridge.js';
// Deliberately independent of insrc-mcp: no general tools, plugins or database access.
const path=process.argv[2];if(!path)throw Error('Private review binding required');
const bindingId=process.env[NATIVE_REVIEW_BINDING_ENV];
const config=readNativeReviewBridgeConfig(resolveNativeReviewBindingPath(path,bindingId));
if(config.binding.bindingId!==bindingId)throw Error('Private invocation binding mismatch');
const indexed=process.argv[3]==='indexed-impact';
const server=createScopedReviewMcpServer(config.binding,indexed,command=>forwardNativeReviewCommand(config,command),config.version===2?'compact-v1':'bound-v1');
await server.connect(new StdioServerTransport());
