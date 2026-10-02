import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseImportFiles, buildImportCandidates, parseDreamArchive, serializeDreamArchive } from '../src/import.ts';
import { prepareImport, searchDreams, validateNoteFields, createNote, updateNote } from '../src/journal.ts';
import { readVault, transact, VaultError } from './fileVault.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');

const fail = (code, message) => { throw new VaultError(code, message); };
const writeNew = async (filename, content) => {
  const target = path.resolve(filename), temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const file = await fs.open(temporary, 'wx');
    try { await file.writeFile(content, 'utf8'); await file.sync(); } finally { await file.close(); }
    // Publish the complete file without replacing any existing destination.
    await fs.link(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
};
async function inputs(paths, guard) {
  return Promise.all(paths.map(async filename => {
    await guard(filename);
    const absolute = await fs.realpath(filename);
    const stat = await fs.stat(absolute);
    const content = await fs.readFile(absolute, 'utf8');
    return { path: absolute, sha256: hash(content), modifiedAt: stat.mtime.toISOString(),
      name: path.basename(absolute), content };
  }));
}
export async function executeOperation(command, flags, guard = async () => {}) {
  const requireFlag = name => flags[name] || fail('INVALID_ARGUMENT', `Missing --${name}`);
  for (const name of ['file', 'plan', 'choices', 'output', 'choices-output', 'input']) {
    if (flags[name]) await guard(flags[name]);
  }
  if (command === 'backup verify') {
    const content = await fs.readFile(requireFlag('file'), 'utf8');
    const dreams = parseDreamArchive(content);
    if (new Set(dreams.map(d => d.id)).size !== dreams.length) fail('INVALID_BACKUP', 'Duplicate record IDs');
    return { valid: true, count: dreams.length, sha256: hash(content) };
  }
  const vault = path.resolve(requireFlag('vault'));
  await guard(vault);
  await guard(path.join(vault, 'vault.json'));
  const state = await readVault(vault);
  if (['notes create', 'notes update'].includes(command)) {
    const revisionInput = flags['expected-revision'];
    const expected = typeof revisionInput === 'number' ? revisionInput :
      typeof revisionInput === 'string' && /^\d+$/.test(revisionInput) ? Number(revisionInput) : NaN;
    if (!Number.isSafeInteger(expected) || expected < 0) fail('INVALID_ARGUMENT', 'Pass --expected-revision from status');
    const requestId = requireFlag('request-id');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId)) fail('INVALID_ARGUMENT', 'request-id must be 8-128 letters, digits, underscores or hyphens');
    if (!!flags.input === (flags.inputValues !== undefined)) fail('INVALID_ARGUMENT', 'Pass exactly one input object or --input JSON file');
    const raw = flags.inputValues !== undefined ? flags.inputValues : JSON.parse((await fs.readFile(flags.input, 'utf8')).replace(/^\uFEFF/, ''));
    const fields = validateNoteFields(raw);
    const id = command === 'notes update' ? requireFlag('id') : null;
    const requestHash = hash(JSON.stringify({ command, id, expected, fields }));
    const receiptKey = `note:${requestId}`;
    return transact(vault, current => {
      const receipt = current.receipts[receiptKey];
      if (receipt) {
        if (receipt.requestHash !== requestHash) fail('CONFLICT', 'Request ID was used with different arguments');
        return { result: { ...receipt.result, replayed: true } };
      }
      if (current.revision !== expected) fail('CONFLICT', 'Vault changed; read the current note and revision again');
      const now = new Date().toISOString();
      const existing = id && current.dreams.find(d => d.id === id);
      if (id && !existing) fail('NOT_FOUND', 'Record not found');
      const record = existing ? updateNote(existing, fields, now) : createNote(fields, randomUUID(), now);
      const dreams = existing ? current.dreams.map(d => d.id === id ? record : d) : [record, ...current.dreams];
      const result = { operationId: randomUUID(), requestId, revision: current.revision + 1,
        count: dreams.length, record, replayed: false };
      return { result, next: { revision: result.revision, dreams,
        receipts: { ...current.receipts, [receiptKey]: { requestHash, result } } } };
    });
  }
  if (command === 'status') return { vault, revision: state.revision, count: state.dreams.length, storage: 'file', cloud: false };
  if (command === 'notes get') {
    const record = state.dreams.find(d => d.id === requireFlag('id'));
    if (!record) fail('NOT_FOUND', 'Record not found');
    return { revision: state.revision, record };
  }
  if (command === 'notes list') {
    const offset = Number(flags.offset || 0), limit = Number(flags.limit || 50);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) fail('INVALID_ARGUMENT', 'Invalid pagination');
    const rows = searchDreams(state.dreams, flags.query || '');
    return { revision: state.revision, total: rows.length, offset,
      records: rows.slice(offset, offset + limit).map(({ id, title, dreamDate }) => ({ id, title, dreamDate })) };
  }
  if (command === 'import preview') {
    if (!flags.files?.length) fail('INVALID_ARGUMENT', 'Pass one --files PATH per input');
    const files = await inputs(flags.files, guard), previewAt = new Date().toISOString();
    const preview = parseImportFiles(files, previewAt);
    const plan = { version: 1, vault, revision: state.revision, previewAt,
      files: files.map(({ path, sha256, modifiedAt }) => ({ path, sha256, modifiedAt })) };
    plan.id = hash(JSON.stringify(plan));
    await writeNew(requireFlag('output'), JSON.stringify(plan, null, 2));
    const records = buildImportCandidates(preview.dreams, state.dreams.map(d => d.id)).map(c => ({
      id: c.dream.id, title: c.dream.title, duplicate: c.duplicate, timeCandidates: preview.timeCandidates?.[c.index] || [],
    }));
    const choicesTemplate = records.filter(r => !r.duplicate).map(r => ({ id: r.id, selected: false,
      time: { key: 'none', manual: '', target: 'dreamDate' } }));
    if (flags['choices-output']) await writeNew(flags['choices-output'], JSON.stringify(choicesTemplate, null, 2));
    return { plan: path.resolve(flags.output), planId: plan.id, revision: state.revision, records, choicesTemplate };
  }
  if (command === 'import commit') {
    if (!!(flags.choices || flags.choiceRows !== undefined) === !!flags['select-all']) fail('INVALID_ARGUMENT', 'Use exactly one of --choices or --select-all');
    const plan = JSON.parse((await fs.readFile(requireFlag('plan'), 'utf8')).replace(/^\uFEFF/, ''));
    const { id, ...payload } = plan;
    if (plan.version !== 1 || plan.vault !== vault || id !== hash(JSON.stringify(payload)) || !Array.isArray(plan.files)) fail('INVALID_PLAN', 'Plan invalid or belongs to another vault');
    const choiceRows = flags.choiceRows !== undefined ? flags.choiceRows : flags.choices ? JSON.parse((await fs.readFile(flags.choices, 'utf8')).replace(/^\uFEFF/, '')) : null;
    if (choiceRows !== null && (!Array.isArray(choiceRows) || choiceRows.some(r => !r || typeof r.id !== 'string' || typeof r.selected !== 'boolean') || new Set(choiceRows.map(r => r.id)).size !== choiceRows.length)) fail('INVALID_CHOICES', 'Expected unique records with id and selected');
    const requestHash = hash(JSON.stringify(choiceRows));
    return transact(vault, async current => {
      const receipt = current.receipts[id];
      if (receipt) {
        if (receipt.requestHash !== requestHash) fail('CONFLICT', 'Plan was committed with different choices');
        return { result: { ...receipt.result, replayed: true } };
      }
      if (current.revision !== plan.revision) fail('CONFLICT', 'Vault changed; preview again');
      const files = await inputs(plan.files.map(f => f.path), guard);
      if (files.some((f,i) => f.sha256 !== plan.files[i].sha256 || f.modifiedAt !== plan.files[i].modifiedAt)) fail('SOURCE_CHANGED', 'Source files changed; preview again');
      const preview = parseImportFiles(files, plan.previewAt), selected = [], choices = {};
      for (const row of choiceRows || []) if (!preview.dreams.some(d => d.id === row.id)) fail('INVALID_CHOICES', 'Unknown record ID');
      preview.dreams.forEach((dream, index) => {
        const row = choiceRows?.find(r => r.id === dream.id);
        if (!flags['select-all'] && !row?.selected) return;
        const time = row?.time || { key: 'none', manual: '', target: 'dreamDate' };
        if (typeof time.key !== 'string' || typeof time.manual !== 'string' || !['dreamDate','recordedAt','both'].includes(time.target)) fail('INVALID_CHOICES', 'Invalid time choice');
        selected.push(index); choices[index] = time;
      });
      const additions = prepareImport(current.dreams, preview, selected, choices, new Date().toISOString());
      const revision = current.revision + 1;
      const result = { operationId: randomUUID(), planId: id, revision, imported: additions.length,
        count: current.dreams.length + additions.length, replayed: false };
      return { next: { revision, dreams: [...additions, ...current.dreams],
        receipts: { ...current.receipts, [id]: { requestHash, result } } }, result };
    });
  }
  if (command === 'backup export') {
    const content = serializeDreamArchive(state.dreams);
    if (!state.dreams.length) fail('EMPTY_VAULT', 'No records to export');
    await writeNew(requireFlag('output'), content);
    return { output: path.resolve(flags.output), revision: state.revision, count: state.dreams.length, sha256: hash(content) };
  }
  fail('INVALID_ARGUMENT', 'Unknown command; use --help');
}
