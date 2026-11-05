import { describe, it, expect } from 'vitest'
import {
  cleanSched, schedText, dueOn, perWeek, weeklyAmount, drawFor, dueList, nextSite, adherence, nextDue,
  markerDefs, flagOf, rangeOf, markerSeries, latestValues, bpBand, bpAverage, isActive, phasesOf,
} from './protocol.js'
import { withRecord } from './stamped.js'

// 2026-11-02 is a Monday.
const test = { name: 'Test C 200', kind: 'injectable', route: 'im', dose: 100, unit: 'mg', conc: 200, sched: { type: 'days', days: [1, 3, 5] }, start: '2026-09-28' }
const bpc = { name: 'Wolverine', kind: 'peptide', route: 'subq', dose: 750, unit: 'mcg', conc: 7.4, sched: { type: 'every', n: 1 }, start: '2026-09-07' }
const tesa = { name: 'Tesa/Ipa', kind: 'peptide', route: 'subq', dose: 1, unit: 'mg', sched: { type: 'onoff', on: 5, off: 2 }, start: '2026-11-02' }
const caber = { name: 'Cabergoline', kind: 'ancillary', route: 'oral', dose: 0.25, unit: 'mg', sched: { type: 'days', days: [1, 4] }, start: '2026-10-12', end: '2026-12-28' }
const adex = { name: 'Anastrozole', kind: 'ancillary', route: 'oral', dose: 0.5, unit: 'mg', sched: { type: 'prn' }, start: '2026-09-28' }

describe('schedules', () => {
  it('reads weekdays, every n days, on/off and as needed', () => {
    expect(dueOn(test, '2026-11-02')).toBe(true)   // Mon
    expect(dueOn(test, '2026-11-03')).toBe(false)  // Tue
    expect(dueOn(bpc, '2026-11-03')).toBe(true)
    expect([0, 1, 2, 3, 4, 5, 6].map(i => dueOn(tesa, `2026-11-0${2 + i}`))).toEqual([true, true, true, true, true, false, false])
    expect(dueOn(adex, '2026-11-02')).toBe(false)
  })
  it('respects start and end', () => {
    expect(dueOn(test, '2026-09-21')).toBe(false)
    expect(isActive(caber, '2026-12-29')).toBe(false)
  })
  it('counts doses and the weekly amount', () => {
    expect(perWeek(test.sched)).toBe(3)
    expect(weeklyAmount(test)).toEqual({ amount: 300, unit: 'mg' })
    expect(perWeek(tesa.sched)).toBe(5)
    expect(weeklyAmount(adex)).toBeNull()
  })
  it('says the schedule in words', () => {
    expect(schedText(test.sched)).toBe('Mon · Wed · Fri')
    expect(schedText({ type: 'every', n: 1 })).toBe('Daily')
    expect(schedText({ type: 'every', n: 7 })).toBe('Weekly')
    expect(cleanSched({ type: 'days', days: [] })).toEqual({ type: 'every', n: 1 })
  })
  it('works out the draw from the vial strength', () => {
    expect(drawFor(test)).toEqual({ ml: 0.5, units: 50 })
    expect(drawFor(bpc)).toEqual({ ml: 0.101, units: 10.1 })
    expect(drawFor({ ...test, conc: null })).toBeNull()
  })
  it('finds the next due day', () => {
    expect(nextDue(test, '2026-11-02')).toBe('2026-11-04')
  })
})

describe('the log', () => {
  const S = {
    pedItems: { t: test, b: bpc, c: caber, a: adex, x: { _ts: 1, gone: 1 } },
    pedLog: {
      l1: { d: '2026-10-30', at: Date.parse('2026-10-30T08:00:00'), item: 't', dose: 100, unit: 'mg', site: 'Glute L' },
      l2: { d: '2026-11-02', at: Date.parse('2026-11-02T08:00:00'), item: 't', dose: 100, unit: 'mg', site: 'Glute R' },
      l3: { d: '2026-11-02', at: Date.parse('2026-11-02T09:00:00'), item: 'a', dose: 0.5, unit: 'mg' },
    },
  }
  it('lists what is due, and an as-needed dose once logged', () => {
    const due = dueList(S, '2026-11-02')
    expect(due.map(x => x.item.name).sort()).toEqual(['Anastrozole', 'Cabergoline', 'Test C 200', 'Wolverine'])
    expect(due.find(x => x.item.name === 'Test C 200').taken).toHaveLength(1)
  })
  it('rotates to the site used longest ago', () => {
    expect(nextSite(S, { ...test, id: 't' })).toBe('Ventroglute L')
    const all = { pedLog: Object.fromEntries(['Glute L', 'Glute R', 'Ventroglute L', 'Ventroglute R', 'Delt L', 'Delt R', 'Quad L', 'Quad R', 'Lat L', 'Lat R']
      .map((s, i) => ['k' + i, { d: '2026-10-01', at: 1000 + i, site: s }])) }
    expect(nextSite(all, test)).toBe('Glute L')
    expect(nextSite(S, caber)).toBeNull()
  })
  it('counts adherence', () => {
    expect(adherence(S, { ...test, id: 't' }, '2026-10-26', '2026-11-02')).toEqual({ due: 4, taken: 2 })
  })
  it('groups by phase', () => {
    expect(phasesOf({ pedItems: { a: { name: 'A', phase: 'Cruise', start: '2026-06-15' }, b: { name: 'B', phase: 'Blast', start: '2026-09-28' } } })).toEqual(['Blast', 'Cruise'])
  })
})

describe('blood work', () => {
  const S = {
    bloodwork: {
      p1: { d: '2026-04-28', vals: { hct: 49.7, e2: 107 } },
      p2: { d: '2026-07-16', vals: { hct: 54.5, e2: 103, u_cystatin: 0.84 } },
    },
    markerDefs: withRecord({}, 'u_cystatin', { name: 'Cystatin C (own)', unit: 'mg/L', lo: 0.51, hi: 0.98 }),
  }
  it('flags against the range', () => {
    const hct = markerDefs(S).find(m => m.key === 'hct')
    expect(flagOf(54.5, hct)).toBe('high')
    expect(flagOf(45, hct)).toBe('ok')
    expect(rangeOf(hct)).toBe('41.3–52.4')
    expect(rangeOf({ lo: null, hi: 185 })).toBe('< 185')
  })
  it('a range of your own replaces the built-in one', () => {
    const S2 = { ...S, markerDefs: withRecord(S.markerDefs, 'hct', { lo: 40, hi: 55 }) }
    expect(flagOf(54.5, markerDefs(S2).find(m => m.key === 'hct'))).toBe('ok')
  })
  it('series oldest first, latest with the previous value', () => {
    expect(markerSeries(S, 'hct')).toEqual([{ d: '2026-04-28', v: 49.7 }, { d: '2026-07-16', v: 54.5 }])
    const latest = latestValues(S)
    expect(latest.find(x => x.def.key === 'hct')).toMatchObject({ v: 54.5, prev: 49.7, flag: 'high' })
    expect(latest.find(x => x.def.key === 'u_cystatin')).toMatchObject({ v: 0.84, flag: 'ok' })
  })
})

describe('blood pressure', () => {
  it('bands a reading', () => {
    expect(bpBand(118, 76).id).toBe('normal')
    expect(bpBand(124, 78).id).toBe('elevated')
    expect(bpBand(132, 79).id).toBe('high1')
    expect(bpBand(128, 92).id).toBe('high2')
  })
  it('averages the recent readings', () => {
    const S = { bpLog: { a: { d: '2026-11-04', sys: 130, dia: 80 }, b: { d: '2026-11-05', sys: 126, dia: 78 }, c: { d: '2026-10-01', sys: 150, dia: 95 } } }
    expect(bpAverage(S, '2026-10-30')).toEqual({ n: 2, sys: 128, dia: 79 })
  })
})
