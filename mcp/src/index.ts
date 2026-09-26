import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// stdout carries the JSON-RPC protocol — log to stderr only (console.error).
process.on('uncaughtException', (err) => console.error('[devdigest-mcp] uncaught', err));
process.on('unhandledRejection', (err) => console.error('[devdigest-mcp] unhandled rejection', err));

await createServer().connect(new StdioServerTransport());
