import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load = async file => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(file, import.meta.url), 'utf8')).toString('base64')}`);
const { shortenTaskTitle } = await load('../src/shortenTaskTitle.js');
const { edgeScroll, rowShift, dragTarget } = await load('../src/dragGeometry.js');
const { adjustEventTime, eventTimeLabel } = await load('../src/calendarGesture.js');
const longTitle = 'Morgen de uitgebreide planning voor het schoolproject met Lucas bespreken en de acties verdelen';
const appointment = { id: 'meeting', title: 'Overleg', date: '2026-09-22', startH: 10, startM: 0, endH: 11, endM: 0, note: 'Bewaren' };

test('calendar resize snaps to quarters and preserves metadata and opposite endpoint', () => {
  const result = adjustEventTime(appointment, 'end', 37, 60, 8, 22);
  assert.equal(eventTimeLabel(result), '10:00 - 11:30 (90 min)');
  assert.equal(result.note, 'Bewaren');
  assert.equal(result.date, appointment.date);
  assert.equal(appointment.endH, 11);
  assert.equal(eventTimeLabel(adjustEventTime(appointment, 'start', -30, 60, 8, 22)), '09:30 - 11:00 (90 min)');
});

test('calendar resize never crosses the other edge or the grid boundaries', () => {
  assert.equal(eventTimeLabel(adjustEventTime(appointment, 'end', -1000, 60, 8, 22)), '10:00 - 10:15 (15 min)');
  assert.equal(eventTimeLabel(adjustEventTime(appointment, 'start', 1000, 60, 8, 22)), '10:45 - 11:00 (15 min)');
  assert.equal(adjustEventTime(appointment, 'start', -1000, 60, 8, 22).startH, 8);
  assert.equal(adjustEventTime(appointment, 'end', 1000, 60, 8, 22).endH, 22);
});

test('moving a calendar block preserves duration including at both grid limits', () => {
  for (const delta of [-1000, -45, 45, 1000]) {
    const result = adjustEventTime(appointment, 'move', delta, 60, 8, 22);
    assert.equal((result.endH - result.startH) * 60 + result.endM - result.startM, 60);
    assert.ok(result.startH >= 8);
    assert.ok(result.endH <= 22);
  }
});

test('AI preserves full original title and existing notes without sending those notes', async () => {
  let payload;
  const result = await shortenTaskTitle(longTitle, 'Persoonlijke notitie', async (url, options) => {
    assert.equal(url, 'https://justmyplan.com/api/claude');
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"title":"Schoolplanning met Lucas bespreken"}' }] }) };
  });
  assert.equal(result.title, 'Schoolplanning met Lucas bespreken');
  assert.equal(result.note, `Persoonlijke notitie\n\nOorspronkelijke taaknaam:\n${longTitle}`);
  assert.equal(JSON.stringify(payload).includes('Persoonlijke notitie'), false);
  assert.ok(JSON.stringify(payload).includes(longTitle));
});

test('short titles do not make an AI request', async () => {
  const result = await shortenTaskTitle('Boodschappen', 'Melk', () => { throw new Error('Unexpected request'); });
  assert.deepEqual(result, { title: 'Boodschappen', note: 'Melk' });
});

test('invalid, failed and overlong AI responses leave user content untouched', async () => {
  for (const response of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ content: [] }) }),
    async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{"title":""}' }] }) }),
    async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ title: 'x'.repeat(60) }) }] }) }),
  ]) assert.deepEqual(await shortenTaskTitle(longTitle, 'Notitie', response), { title: longTitle, note: 'Notitie' });
});

test('an original title already in notes is not duplicated', async () => {
  const result = await shortenTaskTitle(longTitle, longTitle, async () => ({ ok: true,
    json: async () => ({ content: [{ type: 'text', text: '{"title":"Planning bespreken"}' }] }) }));
  assert.equal(result.note, longTitle);
});

test('autoscroll moves in either edge zone, stops in middle and clamps both ends', () => {
  assert.ok(edgeScroll(105, 100, 500, 400, 2000) < 400);
  assert.ok(edgeScroll(595, 100, 500, 400, 2000) > 400);
  assert.equal(edgeScroll(350, 100, 500, 400, 2000), 400);
  assert.equal(edgeScroll(100, 100, 500, 0, 2000), 0);
  assert.equal(edgeScroll(600, 100, 500, 1500, 2000), 1500);
  assert.equal(edgeScroll(600, 100, 500, 0, 200), 0);
});

test('neighbouring rows move exactly one dragged-card height to make a gap', () => {
  const down = { from: 0, to: 2, size: 108 };
  assert.deepEqual([0, 1, 2, 3].map(i => rowShift(i, down)), [0, -108, -108, 0]);
  const up = { from: 3, to: 1, size: 60 };
  assert.deepEqual([0, 1, 2, 3].map(i => rowShift(i, up)), [0, 60, 60, 0]);
});

test('a stationary pointer can reach the end through accumulated scroll distance', () => {
  const ids = Array.from({ length: 80 }, (_, i) => String(i));
  const sizes = Object.fromEntries(ids.map(id => [id, 80]));
  assert.equal(dragTarget(ids, sizes, '0', 79 * 80), 79);
  assert.equal(dragTarget(ids, sizes, '79', -79 * 80), 0);
});
