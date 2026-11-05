/* Fork additions: the Coach's nutrition and protocol context, and the food lookup's reducer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nutritionOut, protocolOut, dueOn, perWeek, schedPhrase } from '../coach/core/extras.js';
import { build } from '../coach/core/payload.js';
import { DATA_CATEGORIES } from '../coach/core/categories.js';
import { normalizeProduct, searchFoods, productByCode, _clearFoodCache } from '../food.js';

const NOW = Date.parse('2026-11-05T10:00:00Z');

const S = {
  unit: 'kg', lang: 'en', routines: [], week: {}, dayPlan: {},
  workouts: [{ id: 'w1', d: '2026-11-04', entries: [] }],
  nutriNetCarbs: true,
  nutriTargets: { train: { p: [190, 210], c: [null, 25], f: [180, 210], kcal: [2500, 2750], _ts: 1 } },
  foodLog: {
    a: { d: '2026-11-04', name: 'Steak', kcal: 466, p: 40, c: 0, f: 34, _ts: 1 },
    b: { d: '2026-11-04', name: 'Avocado', kcal: 120, p: 1.5, c: 6.4, f: 11, fib: 5, _ts: 1 },
    c: { d: '2026-11-05', name: 'Eggs', kcal: 215, p: 18.8, c: 1, f: 15, _ts: 1 },
    old: { d: '2026-10-01', name: 'Out of window', kcal: 999, p: 1, c: 1, f: 1, _ts: 1 },
    gone: { _ts: 2, gone: 1 },
  },
  pedItems: {
    t: { name: 'Test C 200', kind: 'injectable', route: 'im', dose: 100, unit: 'mg', sched: { type: 'days', days: [1, 3, 5] }, start: '2026-09-28', phase: 'Blast', notes: 'secret note', _ts: 1 },
    old: { name: 'Anavar', kind: 'oral', dose: 10, unit: 'mg', sched: { type: 'every', n: 1 }, start: '2026-05-12', end: '2026-06-18', _ts: 1 },
  },
  pedLog: {
    l1: { d: '2026-11-02', item: 't', dose: 100, unit: 'mg', site: 'Glute L', _ts: 1 },
    l2: { d: '2026-11-04', item: 't', dose: 100, unit: 'mg', site: 'Glute R', _ts: 1 },
  },
  bloodwork: { p: { d: '2026-07-16', lab: 'Lancet', vals: { hct: 54.5, e2: 103 }, note: 'private', _ts: 1 } },
  bpLog: { b: { d: '2026-11-05', sys: 128, dia: 79, hr: 61, _ts: 1 } },
};

test('nutrition: daily totals in the window, targets, training days', () => {
  const n = nutritionOut(S, NOW);
  assert.equal(n.netCarbs, true);
  assert.deepEqual(n.targets.train, { kcal: [2500, 2750], p: [190, 210], c: [null, 25], f: [180, 210] });
  assert.deepEqual(n.days.map(d => [d.d, d.kcal, d.train]), [['2026-11-04', 586, true], ['2026-11-05', 215, false]]);
  assert.equal(n.days[0].fib, 5);
  assert.equal(JSON.stringify(n).includes('Steak'), false, 'food names never leave');
  assert.equal(nutritionOut({ workouts: [] }, NOW), null);
});

test('protocol: running items with doses logged, recent ended ones out, no notes or sites', () => {
  const p = protocolOut(S, NOW);
  assert.equal(p.items.length, 1);
  assert.deepEqual(p.items[0], { name: 'Test C 200', kind: 'injectable', route: 'im', dose: 100, unit: 'mg', schedule: 'Mon/Wed/Fri', perWeek: 3, start: '2026-09-28', phase: 'Blast', status: 'running', logged14: { due: 6, taken: 2 } });
  assert.deepEqual(p.blood[0].markers.find(m => m.name === 'Haematocrit'), { name: 'Haematocrit', v: 54.5, unit: '%', range: [41.3, 52.4], flag: 'high' });
  assert.deepEqual(p.bp.last, { d: '2026-11-05', sys: 128, dia: 79, hr: 61 });
  const json = JSON.stringify(p);
  for (const leak of ['secret note', 'Glute', 'Lancet', 'private']) assert.equal(json.includes(leak), false, leak);
});

test('schedule rules', () => {
  assert.equal(dueOn({ start: '2026-11-02', sched: { type: 'onoff', on: 5, off: 2 } }, '2026-11-07'), false);
  assert.equal(perWeek({ type: 'every', n: 2 }), 3.5);
  assert.equal(schedPhrase({ type: 'prn' }), 'as needed');
});

test('payload: a review and a question carry both, a create neither', () => {
  const review = build(S, { handle: 'h'.repeat(16), kind: 'review', now: NOW });
  assert.ok(review.nutrition && review.protocol);
  const ask = build(S, { handle: 'h'.repeat(16), kind: 'ask', note: 'how is my protein?', now: NOW });
  assert.ok(ask.nutrition && ask.protocol);
  const create = build(S, { handle: 'h'.repeat(16), kind: 'create', now: NOW });
  assert.equal('nutrition' in create, false);
  assert.ok(DATA_CATEGORIES.includes('nutrition') && DATA_CATEGORIES.includes('protocol'));
});

test('food: Open Food Facts product reduced to per-100 numbers', () => {
  const f = normalizeProduct({ code: '6001234567890', product_name: 'Beef Biltong', brands: 'Brand A, Brand B', serving_quantity: '30', nutriments: { 'energy-kcal_100g': 301.4, proteins_100g: 56, carbohydrates_100g: '2,1', fat_100g: 8, fiber_100g: 0 } });
  assert.deepEqual(f, { name: 'Beef Biltong', brand: 'Brand A', code: '6001234567890', per: { kcal: 301, p: 56, c: 2.1, f: 8 }, serving: 30, src: 'off' });
  assert.equal(normalizeProduct({ product_name: 'No numbers', nutriments: {} }), null);
  assert.equal(normalizeProduct({ product_name: 'kJ only', nutriments: { energy_100g: 418.4 } }).per.kcal, 100);
});

test('food: search merges the country and world results, product by barcode', async () => {
  _clearFoodCache();
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('/api/v2/product/')) return { ok: true, json: async () => ({ status: 1, product: { product_name: 'Cottage cheese', nutriments: { 'energy-kcal_100g': 103, proteins_100g: 11, carbohydrates_100g: 3, fat_100g: 4.5 } } }) };
    const host = new URL(url).host;
    return { ok: true, json: async () => ({ products: [{ code: host.startsWith('za') ? '1' : '2', product_name: 'Biltong ' + host, nutriments: { 'energy-kcal_100g': 300, proteins_100g: 55, carbohydrates_100g: 2, fat_100g: 8 } }] }) };
  };
  const foods = await searchFoods('biltong', { country: 'za', fetchImpl });
  assert.equal(foods.length, 2);
  assert.ok(calls[0].startsWith('https://za.openfoodfacts.org/'));
  assert.equal((await productByCode('6009876543210', { fetchImpl })).name, 'Cottage cheese');
  assert.equal(await productByCode('12', { fetchImpl }), null);
});
