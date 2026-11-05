import { describe, it, expect } from 'vitest'
import { readExtras, applyExtras, countsText } from './extras-import.js'
import { live } from './stamped.js'

const file = {
  format: 'opengym-extras', version: 1,
  settings: { nutriNetCarbs: true, nutriMeals: ['Breakfast', 'Lunch', 'Supper'], targetW: 80 },
  nutriTargets: { train: { p: [190, 210], c: [null, 25] } },
  pedItems: { 'imp-a': { name: 'Test C', kind: 'injectable', route: 'im', dose: 100, unit: 'mg', sched: { type: 'days', days: [1, 3, 5] } } },
  bloodwork: { 'imp-p': { d: '2026-07-16', vals: { hct: 54.5 } } },
  bodyweight: [{ d: '2026-05-06', w: 77.1 }, { d: '2026-09-01', w: 73.8 }],
  measurements: [{ d: '2026-05-06', bodyFat: 11.5 }],
}
const fresh = () => ({ unit: 'kg', bodyweight: [{ d: '2026-09-01', w: 74.2, t: 1, ins: [{ id: 'mine', at: '07:00', w: 74.2, t: 1 }] }], measurements: [], customMeasurements: [], pedItems: { own: { name: 'Mine', _ts: 1 } } })

describe('extras import', () => {
  it('reads a file and counts what is in it', () => {
    const r = readExtras(JSON.stringify(file))
    expect(r.counts).toMatchObject({ pedItems: 1, bloodwork: 1, nutriTargets: 1, bodyweight: 2, measurements: 1 })
    expect(countsText(r.counts)).toContain('1 compound')
    expect(readExtras('not json').error).toBe('json')
    expect(readExtras('{"format":"other"}').error).toBe('format')
    expect(readExtras('{"format":"opengym-extras"}').error).toBe('empty')
  })

  it('loads records next to the ones made in the app, and a second import replaces its own', () => {
    const s = fresh()
    const done = applyExtras(s, file, 100)
    expect(live(s.pedItems).map(([id]) => id).sort()).toEqual(['imp-a', 'own'])
    expect(s.pedItems['imp-a']._ts).toBe(100)
    expect(s.nutriNetCarbs).toBe(true)
    expect(s.nutriMeals).toEqual(['Breakfast', 'Lunch', 'Supper'])
    expect(s.targetW).toBe(80)
    expect(done).toMatchObject({ pedItems: 1, bloodwork: 1, nutriTargets: 1, bodyweight: 1, measurements: 1 })
    applyExtras(s, file, 200)
    expect(Object.keys(s.pedItems)).toHaveLength(2)
    expect(s.pedItems['imp-a']._ts).toBe(200)
  })

  it('never overwrites a weigh-in from the app, and adds the others', () => {
    const s = fresh()
    applyExtras(s, file, 100)
    expect(s.bodyweight.find(b => b.d === '2026-09-01').w).toBe(74.2)
    expect(s.bodyweight.find(b => b.d === '2026-05-06').w).toBe(77.1)
    applyExtras(s, file, 200)
    expect(s.bodyweight.find(b => b.d === '2026-05-06').ins).toHaveLength(1)
  })

  it('puts body fat into that day\'s measurements and switches the field on', () => {
    const s = fresh()
    applyExtras(s, file, 100)
    expect(s.measurements.find(m => m.d === '2026-05-06').bodyFat).toBe(11.5)
    expect(s.measurementEnabled).toContain('bodyFat')
  })

  it('converts kilograms for a profile in pounds', () => {
    const s = { ...fresh(), unit: 'lb', bodyweight: [] }
    applyExtras(s, file, 100)
    expect(s.targetW).toBe(176.4)
    expect(s.bodyweight.find(b => b.d === '2026-05-06').w).toBe(170)
  })
})
