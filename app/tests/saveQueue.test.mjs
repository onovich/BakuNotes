import assert from 'node:assert/strict';
import test from 'node:test';
import { SaveQueue } from '../src/saveQueue.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('loads a stored snapshot without writing it again', async () => {
  const writes = [];
  const states = [];
  const loaded = [{ id: 'one' }];
  const queue = new SaveQueue(async (value) => { writes.push(value); }, (state) => states.push(state));
  queue.acknowledgeLoaded(loaded);
  queue.schedule(loaded);
  await queue.flush();
  assert.deepEqual(writes, []);
  assert.deepEqual(states, ['saved']);
});

test('an old write cannot claim a newer edit is saved', async () => {
  const writes = [];
  const states = [];
  const gates = [deferred(), deferred()];
  const queue = new SaveQueue((value) => {
    writes.push(value);
    return gates[writes.length - 1].promise;
  }, (state) => states.push(state), 60_000);
  queue.acknowledgeLoaded([]);
  queue.schedule(['first']);
  const flush = queue.flush();
  queue.schedule(['second']);
  gates[0].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [['first'], ['second']]);
  assert.equal(states.at(-1), 'saving');
  gates[1].resolve();
  await flush;
  assert.equal(states.at(-1), 'saved');
});

test('failed latest write remains failed until an explicit retry succeeds', async () => {
  const writes = [];
  const states = [];
  let fail = true;
  const queue = new SaveQueue(async (value) => {
    writes.push(value);
    if (fail) throw new Error('storage unavailable');
  }, (state) => states.push(state), 60_000);
  queue.acknowledgeLoaded([]);
  queue.schedule(['entry']);
  await assert.rejects(queue.flush(), /storage unavailable/);
  assert.equal(states.at(-1), 'failed');
  fail = false;
  await queue.flush();
  assert.deepEqual(writes, [['entry'], ['entry']]);
  assert.equal(states.at(-1), 'saved');
});

test('failure of a superseded write does not hide the newer save', async () => {
  const first = deferred();
  const states = [];
  let calls = 0;
  const queue = new SaveQueue(() => ++calls === 1 ? first.promise : Promise.resolve(),
    (state) => states.push(state), 60_000);
  queue.acknowledgeLoaded([]);
  queue.schedule(['old']);
  const flush = queue.flush();
  queue.schedule(['new']);
  first.reject(new Error('old write failed'));
  await flush;
  assert.equal(calls, 2);
  assert.equal(states.includes('failed'), false);
  assert.equal(states.at(-1), 'saved');
});

test('a confirmed import flushes immediately and its state echo does not duplicate the write', async () => {
  const writes = [];
  const queue = new SaveQueue(async (value) => { writes.push(value); }, () => {}, 60_000);
  queue.acknowledgeLoaded([]);
  const merged = [{ id: 'restored' }];
  queue.schedule(merged);
  await queue.flush();
  queue.schedule(merged);
  await queue.flush();
  assert.deepEqual(writes, [merged]);
});
