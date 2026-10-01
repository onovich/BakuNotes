import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createWebServer } from './webServer.mjs';

try {
  const { values } = parseArgs({ options: { vault: { type: 'string' }, port: { type: 'string', default: '8775' } } });
  if (!values.vault) throw new Error('Use --vault DIRECTORY');
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const { server, token } = await createWebServer({ vault: values.vault, dist: fileURLToPath(new URL('../dist/', import.meta.url)) });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`文件库：${path.resolve(values.vault)}\nhttp://127.0.0.1:${port}/?local-vault=1#token=${token}\n保持此终端运行；CLI/MCP 使用相同 --vault 路径。`);
  });
} catch (error) { console.error(error.message); process.exitCode = 1; }
