import { describe, it, expect } from 'vitest'
import {
  portion, cleanPer, totals, against, rangeText, targetFor, dayKind, mealsOn, logOn, daysSeries,
  averageOf, carbsShown, perOfItem, copyItems, recentFoods, matches, cleanTarget, mealsOf, hasNutrition,
} from './nutrition.js'
import { withRecord, withoutRecord, live } from './stamped.js'
import { mergeStates, STAMPED_MAPS } from './sync-merge.js'
import { STAMPED_MAPS as API_STAMPED_MAPS } from '../../../api/sync-stamps.js'

const base = (extra = {}) => ({ workouts: [], routines: [], week: {}, dayPlan: {}, foodLog: {}, nutriTargets: {}, nutriDays: {}, ...extra })

describe('portions and totals', () => {
  it('scales per-100 values by grams', () => {
    expect(portion({ kcal: 212, p: 18, c: 0, f: 15.5 }, 200)).toEqual({ kcal: 424, p: 36, c: 0, f: 31 })
  })
  it('works out kcal from the macros when a label has none', () => {
    expect(cleanPer({ p: 10, c: 10, f: 10 }).kcal).toBe(170)
  })
  it('keeps fibre only when there is some', () => {
    expect(portion({ kcal: 160, p: 2, c: 8.5, f: 14.7, fib: 6.7 }, 75).fib).toBe(5)
    expect('fib' in portion({ kcal: 100, p: 1, c: 1, f: 1 }, 50)).toBe(false)
  })
  it('totals a list of items', () => {
    expect(totals([{ kcal: 100, p: 10, c: 1, f: 5 }, { kcal: 50.4, p: 2.25, c: 0, f: 1, fib: 2 }])).toEqual({ kcal: 150, p: 12.3, c: 1, f: 6, fib: 2 })
  })
  it('counts net carbs when asked', () => {
    expect(carbsShown({ nutriNetCarbs: true }, { c: 10, fib: 4 })).toBe(6)
    expect(carbsShown({}, { c: 10, fib: 4 })).toBe(10)
  })
  it('backs per-100 values out of a logged item', () => {
    expect(perOfItem({ g: 200, kcal: 424, p: 36, c: 0, f: 31 })).toEqual({ kcal: 212, p: 18, c: 0, f: 15.5 })
    expect(perOfItem({ kcal: 300 })).toBeNull()
  })
})

describe('targets', () => {
  it('reads a range, a ceiling and a single number', () => {
    expect(cleanTarget({ p: [190, 210], c: [null, 25], kcal: 2600 })).toMatchObject({ p: [190, 210], c: [null, 25], kcal: [2600, 2600], f: [null, null] })
    expect(cleanTarget({})).toBeNull()
  })
  it('judges a value against a range', () => {
    expect(against(180, [190, 210]).state).toBe('under')
    expect(against(200, [190, 210]).state).toBe('ok')
    expect(against(220, [190, 210]).state).toBe('over')
    expect(against(20, [null, 25]).state).toBe('ok')
    expect(against(30, [null, 25]).state).toBe('over')
    expect(against(5, [null, null]).state).toBe('none')
  })
  it('words a range', () => {
    expect(rangeText([190, 210])).toBe('190–210')
    expect(rangeText([null, 25])).toBe('≤ 25')
    expect(rangeText([2600, 2600])).toBe('2 600')
  })
  it('a day with a workout is a training day, unless switched by hand', () => {
    const S = base({ workouts: [{ id: 'w', d: '2026-11-03' }], nutriDays: withRecord({}, '2026-11-04', { kind: 'train' }) })
    expect(dayKind(S, '2026-11-03')).toBe('train')
    expect(dayKind(S, '2026-11-04')).toBe('train')
    expect(dayKind(S, '2026-11-05')).toBe('rest')
  })
  it('uses the other kind of day when only one is set', () => {
    const S = base({ nutriTargets: withRecord({}, 'train', { p: [190, 210] }) })
    expect(targetFor(S, '2026-11-05').p).toEqual([190, 210])
  })
})

describe('the log', () => {
  const S = base({
    nutriMeals: ['Breakfast', 'Lunch', 'Supper'],
    foodLog: {
      a: { d: '2026-11-05', meal: 'Supper', name: 'Steak', kcal: 400, p: 36, c: 0, f: 30, at: 3, _ts: 3 },
      b: { d: '2026-11-05', meal: 'Breakfast', name: 'Eggs', kcal: 215, p: 19, c: 1, f: 15, at: 1, _ts: 1 },
      c: { _ts: 5, gone: 1 },
      e: { d: '2026-11-04', meal: 'Lunch', name: 'Biltong', g: 30, kcal: 90, p: 17, c: 0.6, f: 2.4, at: 2, _ts: 2 },
    },
  })
  it('orders by meal and leaves removed items out', () => {
    expect(logOn(S, '2026-11-05').map(x => x.name)).toEqual(['Eggs', 'Steak'])
    expect(mealsOn(S, '2026-11-05').map(m => [m.meal, m.items.length])).toEqual([['Breakfast', 1], ['Lunch', 0], ['Supper', 1]])
  })
  it('falls back to the default meals', () => {
    expect(mealsOf({})).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks'])
  })
  it('builds a daily series and averages only logged days', () => {
    const rows = daysSeries(S, '2026-11-03', '2026-11-05')
    expect(rows.map(r => r.kcal)).toEqual([0, 90, 615])
    expect(averageOf(rows)).toMatchObject({ days: 2, kcal: 353 })
  })
  it('copies a day as new records', () => {
    const xs = copyItems(S, '2026-11-05', '2026-11-06')
    expect(xs).toHaveLength(2)
    expect(xs.every(x => x.d === '2026-11-06' && !('id' in x) && !('_ts' in x))).toBe(true)
  })
  it('offers recent foods once per name', () => {
    expect(recentFoods(S).map(x => x.name)).toEqual(['Steak', 'Biltong', 'Eggs'])
  })
  it('matches every word', () => {
    expect(matches('club steak', 'Club steak, bone-in')).toBe(true)
    expect(matches('steak rice', 'Club steak')).toBe(false)
  })
  it('knows when there is something for the Coach', () => {
    expect(hasNutrition(S)).toBe(true)
    expect(hasNutrition(base())).toBe(false)
  })
})

describe('sync', () => {
  it('the new maps merge per record on both sides', () => {
    for (const f of ['foodLog', 'foods', 'mealTemplates', 'nutriTargets', 'nutriDays']) expect(STAMPED_MAPS).toContain(f)
    expect(API_STAMPED_MAPS).toEqual(STAMPED_MAPS)
  })
  it('two devices each logging food keep both, and a removal sticks', () => {
    const common = { _ts: 10, foodLog: { x: { d: '2026-11-05', name: 'Eggs', kcal: 215, _ts: 10 } } }
    const phone = { ...common, _ts: 20, foodLog: withRecord(common.foodLog, 'p', { d: '2026-11-05', name: 'Steak', kcal: 400 }, 20) }
    const laptop = { ...common, _ts: 30, foodLog: withoutRecord(withRecord(common.foodLog, 'l', { d: '2026-11-05', name: 'Biltong', kcal: 90 }, 25), 'x', 30) }
    const m = mergeStates(phone, laptop)
    expect(live(m.foodLog).map(([, v]) => v.name).sort()).toEqual(['Biltong', 'Steak'])
  })
})
