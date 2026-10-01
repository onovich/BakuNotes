import fs from 'node:fs/promises';
import path from 'node:path';
import { VaultError } from './fileVault.mjs';

async function canonical(filename) {
  const absolute = path.resolve(filename);
  try { return await fs.realpath(absolute); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await canonical(parent), path.basename(absolute));
  }
}
export async function createPathGuard(roots) {
  if (!roots?.length) throw new VaultError('INVALID_CONFIG', 'Configure at least one allowed root');
  const directories = await Promise.all(roots.map(async root => {
    const resolved = await fs.realpath(root);
    if (!(await fs.stat(resolved)).isDirectory()) throw new VaultError('INVALID_CONFIG', 'Root must be an existing directory');
    return resolved;
  }));
  return async filename => {
    const resolved = await canonical(filename);
    const allowed = directories.some(root => {
      const relative = path.relative(root, resolved);
      return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
    });
    if (!allowed) throw new VaultError('PATH_OUTSIDE_ROOT', 'Path is outside the configured directories');
  };
}
