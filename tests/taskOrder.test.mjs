import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/taskOrder.js', import.meta.url), 'utf8');
const { taskRows, moveItem, orderChanges, dropIndex } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const today = new Date(2026, 8, 21);
const ids = rows => rows.map(r => r.id);

test('automatic order matches web: dated, undated, sleeping recurrence', () => {
  const tasks = [
    { id: 'sleep', deadline: '2026-09-24', recurrence: 'weekly' },
    { id: 'plain', deadline: null },
    { id: 'low', deadline: '2026-09-22', priority: 'laag' },
    { id: 'high', deadline: '2026-09-22', priority: 'hoog' },
    { id: 'past', deadline: '2026-09-20' },
  ];
  assert.deepEqual(ids(taskRows(tasks, [], {}, today)), ['past', 'high', 'low', 'plain', 'sleep']);
  assert.equal(tasks[0].id, 'sleep');
});

test('frozen priority retains position until editing finishes', () => {
  assert.deepEqual(ids(taskRows([{ id: 'a', priority: 'hoog' }, { id: 'b', priority: 'midden' }], [], { a: 'laag' }, today)), ['b', 'a']);
});

test('web sections and manually positioned tasks interleave, unsorted tasks first', () => {
  const tasks = [{ id: 'a', sortOrder: 3 }, { id: 'new' }, { id: 'b', sortOrder: 1 }];
  const sections = [{ id: 's1', title: 'Werk', sortOrder: 0 }, { id: 's2', title: 'Thuis', sortOrder: 2 }];
  assert.deepEqual(ids(taskRows(tasks, sections, {}, today)), ['new', 's1', 'b', 's2', 'a']);
});

test('reordering and section deletion retain every task exactly once', () => {
  const rows = taskRows([{ id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }], [{ id: 's', title: 'Werk', color: '#2563EB', sortOrder: 0 }]);
  const moved = moveItem(rows, 'b', 0);
  assert.deepEqual(ids(moved), ['b', 's', 'a']);
  assert.deepEqual(orderChanges(moved), {
    tasks: [{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 2 }],
    sections: [{ id: 's', title: 'Werk', color: '#2563EB', sortOrder: 1 }],
  });
  assert.deepEqual(orderChanges(moved.filter(r => r.id !== 's')).tasks, [{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }]);
  assert.deepEqual(ids(rows), ['s', 'a', 'b']);
});

test('unknown IDs and out-of-range destinations cannot lose items', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(moveItem(items, 'unknown', 1), items);
  assert.deepEqual(ids(moveItem(items, 'a', 99)), ['b', 'c', 'a']);
  assert.deepEqual(ids(moveItem(items, 'c', -2)), ['c', 'a', 'b']);
});

test('drag targets use measured widths/heights in both directions', () => {
  const items = ['a', 'b', 'c'];
  const sizes = { a: 100, b: 60, c: 120 };
  assert.equal(dropIndex(items, sizes, 'a', 29), 0);
  assert.equal(dropIndex(items, sizes, 'a', 31), 1);
  assert.equal(dropIndex(items, sizes, 'a', 130), 2);
  assert.equal(dropIndex(items, sizes, 'c', -120), 0);
  assert.equal(dropIndex(items, sizes, 'a', -300), 0);
  assert.equal(dropIndex(items, sizes, 'c', 300), 2);
  assert.equal(dropIndex(items, sizes, 'gone', 10), -1);
});
