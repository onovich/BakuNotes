#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBakuServer } from './mcpServer.mjs';

try {
  const { values } = parseArgs({ options: { vault: { type: 'string' },
    root: { type: 'string', multiple: true }, 'read-only': { type: 'boolean' } } });
  if (!values.vault || !values.root?.length) throw new Error('Pass --vault DIRECTORY and at least one --root DIRECTORY');
  const server = await createBakuServer({ vault: path.resolve(values.vault), roots: values.root, readOnly: values['read-only'] });
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code || 'INVALID_CONFIG', message: error.message }));
  process.exitCode = 2;
}
