import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readVault, transact, VaultError } from './fileVault.mjs';
import { parseDreamArchive, serializeDreamArchive } from '../src/import.ts';
import { createPathGuard } from './pathScope.mjs';

export async function createWebServer({ vault, dist, token = randomBytes(32).toString('hex') }) {
  vault = path.resolve(vault);
  dist = await fs.realpath(dist);
  await fs.access(path.join(dist, 'index.html'));
  const guard = await createPathGuard([dist]);
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
        return json(403, { code: 'FORBIDDEN', message: 'Only the local server origin is allowed' });
      }
      const url = new URL(req.url, origin);
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (url.pathname.startsWith('/api/')) {
        if (req.headers.authorization !== `Bearer ${token}`) return json(401, { code: 'UNAUTHORIZED', message: '请使用启动时提供的完整连接地址' });
        if (url.pathname !== '/api/library') return json(404, { code: 'NOT_FOUND' });
        if (req.method === 'GET') {
          const state = await readVault(vault);
          return json(200, { revision: state.revision, name: path.basename(vault), archive: serializeDreamArchive(state.dreams) });
        }
        if (req.method !== 'PUT') return json(405, { code: 'METHOD_NOT_ALLOWED' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { code: 'INVALID_CONTENT_TYPE' });
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) return json(413, { code: 'TOO_LARGE', message: '快照超过 16 MiB' });
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Number.isSafeInteger(body.revision) || body.revision < 0 || typeof body.archive !== 'string') throw new VaultError('INVALID_ARGUMENT', 'Invalid snapshot');
        const dreams = parseDreamArchive(body.archive, true);
        if (new Set(dreams.map(d => d.id)).size !== dreams.length) throw new VaultError('INVALID_ARGUMENT', 'Duplicate record IDs');
        const archive = serializeDreamArchive(dreams);
        const result = await transact(vault, state => {
          // A lost response may be retried without creating another revision.
          if (state.revision === body.revision + 1 && serializeDreamArchive(state.dreams) === archive) return { result: { revision: state.revision } };
          if (state.revision !== body.revision) throw new VaultError('CONFLICT', 'Library changed; export unsaved work before reloading');
          const next = { ...state, revision: state.revision + 1, dreams };
          return { next, result: { revision: next.revision } };
        });
        return json(200, result);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { code: 'METHOD_NOT_ALLOWED' });
      const filename = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      await guard(filename);
      const content = await fs.readFile(filename);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      json(error.code === 'CONFLICT' || error.code === 'VAULT_BUSY' ? 409 : error.code === 'ENOENT' ? 404 : error.code === 'PATH_OUTSIDE_ROOT' ? 403 : 400,
        { code: error.code || 'VALIDATION_FAILED', message: error.message });
    }
  });
  return { server, token };
}
