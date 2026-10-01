import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseDreamArchive, serializeDreamArchive } from '../src/import.ts';

export class VaultError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export async function readVault(directory) {
  let raw;
  try { raw = await fs.readFile(path.join(directory, 'vault.json'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { revision: 0, dreams: [], receipts: {} }; throw error; }
  const value = JSON.parse(raw);
  if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      typeof value.archive !== 'string' || !value.receipts || typeof value.receipts !== 'object' || Array.isArray(value.receipts)) {
    throw new VaultError('INVALID_VAULT', 'Unsupported or invalid vault snapshot');
  }
  const dreams = parseDreamArchive(value.archive, true);
  if (new Set(dreams.map(d => d.id)).size !== dreams.length) throw new VaultError('INVALID_VAULT', 'Duplicate record IDs');
  return { revision: value.revision, dreams, receipts: value.receipts };
}
export async function transact(directory, operation) {
  await fs.mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, '.write-lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new VaultError('VAULT_BUSY', 'Vault is locked by a writer; retry after it finishes'); throw error; }
  const temporary = path.join(directory, `.snapshot-${randomUUID()}.tmp`);
  try {
    const state = await readVault(directory);
    const outcome = await operation(state);
    if (!outcome.next) return outcome.result;
    const snapshot = JSON.stringify({ version: 1, revision: outcome.next.revision,
      archive: serializeDreamArchive(outcome.next.dreams), receipts: outcome.next.receipts });
    const file = await fs.open(temporary, 'wx');
    try { await file.writeFile(snapshot, 'utf8'); await file.sync(); } finally { await file.close(); }
    await fs.rename(temporary, path.join(directory, 'vault.json'));
    return outcome.result;
  } finally {
    await fs.rm(temporary, { force: true });
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}
