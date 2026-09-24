import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let requests = [];
let resultFor = () => ({ data: [], error: null });
globalThis.__orderTestDB = {
  from(table) {
    const request = { table, filters: [] };
    requests.push(request);
    const query = {
      select() { return query; },
      eq(...args) { request.filters.push(args); return query; },
      is(...args) { request.filters.push(args); return query; },
      order() { return query; },
      update(payload) { request.payload = payload; request.action = 'update'; return query; },
      upsert(payload) { request.payload = payload; request.action = 'upsert'; return query; },
      then(resolve, reject) { return Promise.resolve(resultFor(request)).then(resolve, reject); },
    };
    return query;
  },
};
const source = readFileSync(new URL('../src/db.js', import.meta.url), 'utf8')
  .replace("import { supabase } from './supabase';", 'const supabase = globalThis.__orderTestDB;');
const db = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('list reader restores web order and section metadata', async () => {
  resultFor = () => ({ data: [
    { id: 'unsorted', created_at: 'first' },
    { id: 'last', sort_order: 1, sections: [] },
    { id: 'first', sort_order: 0, sections: [{ id: 's', title: 'Werk', sortOrder: 0 }] },
  ] });
  const lists = await db.loadLists('me');
  assert.deepEqual(lists.map(l => l.id), ['first', 'last', 'unsorted']);
  assert.equal(lists[0].sections[0].title, 'Werk');
  assert.deepEqual(lists[2].sections, []);
});

test('task reader preserves sort position including zero', async () => {
  resultFor = () => ({ data: [{ id: 't', sort_order: 0 }] });
  assert.equal((await db.loadTasks('me'))[0].sortOrder, 0);
});

test('reordering updates only order/sections and scopes writes to owner and list', async () => {
  requests = [];
  resultFor = () => ({ error: null });
  await db.saveTaskOrderDB('me', 'mine', { tasks: [{ id: 't', sortOrder: 1 }], sections: [{ id: 's', sortOrder: 0 }] });
  assert.deepEqual(requests[0].payload, { sort_order: 1 });
  assert.deepEqual(requests[0].filters, [['user_id', 'me'], ['list_id', 'mine'], ['id', 't']]);
  assert.deepEqual(requests[1].filters, [['user_id', 'me'], ['id', 'mine']]);
});

test('task write errors are surfaced and do not silently save section positions', async () => {
  requests = [];
  const error = new Error('offline');
  resultFor = () => ({ error });
  await assert.rejects(db.saveTaskOrderDB('me', 'mine', { tasks: [{ id: 't', sortOrder: 1 }], sections: [] }), /offline/);
  assert.equal(requests.length, 1);
});

test('list order is saved in one request without overwriting sections', async () => {
  requests = [];
  resultFor = () => ({ error: null });
  await db.saveListOrderDB('me', [{ id: 'b', label: 'B', color: '#2563EB', sections: [] }, { id: 'a', label: 'A', color: '#DC2626' }]);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].payload.map(l => [l.user_id, l.id, l.sort_order]), [['me', 'b', 0], ['me', 'a', 1]]);
  assert.equal('sections' in requests[0].payload[0], false);
});

test('list save errors reach the caller', async () => {
  resultFor = () => ({ error: new Error('permission denied') });
  await assert.rejects(db.saveListOrderDB('me', []), /permission denied/);
  await assert.rejects(db.upsertListDB('me', { id: 'mine' }), /permission denied/);
});
