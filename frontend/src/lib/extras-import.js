// Import a data file into the fork's sections (fork addition): nutrition targets, saved meals and
// foods, compounds, doses, blood work and blood pressure, plus body weight, body fat and the
// weight goal. Workouts are not here: they go through Settings → Data → Import like any app's.
//
//   { "format": "opengym-extras", "version": 1,
//     "settings": { "nutriNetCarbs": true, "nutriMeals": [...], "targetW": 80 },
//     "nutriTargets": { "train": {...}, "rest": {...} },
//     "mealTemplates": { id: {...} }, "foods": { id: {...} },
//     "pedItems": { id: {...} }, "pedLog": { id: {...} },
//     "bloodwork": { id: {...} }, "markerDefs": { key: {...} }, "bpLog": { id: {...} },
//     "bodyweight": [{ "d": "2026-05-06", "w": 77.1 }],          (kg)
//     "measurements": [{ "d": "2026-05-06", "bodyFat": 11.5 }] }
//
// Records keep the file's ids, so importing the same file again replaces its own records instead
// of adding them twice, and leaves everything entered in the app alone. Weights in the file are
// kilograms and are converted for a profile kept in pounds.
import { isMap, withRecord, isISO } from './stamped.js'
import { addWeighIn } from './weigh-ins.js'
import { emptyMeasurement, normalizeMeasurementsState } from './measurements.js'

export const EXTRAS_FORMAT = 'opengym-extras'
export const EXTRAS_MAPS = ['nutriTargets', 'mealTemplates', 'foods', 'pedItems', 'pedLog', 'bloodwork', 'markerDefs', 'bpLog']
const LB = 2.2046226218

/** Reads a file's text: { data, counts } or { error: 'json' | 'format' | 'empty' }. */
export function readExtras(text) {
  let o
  try { o = JSON.parse(String(text || '').replace(/^﻿/, '')) } catch { return { error: 'json' } }
  if (!isMap(o) || o.format !== EXTRAS_FORMAT) return { error: 'format' }
  const counts = {}
  for (const f of EXTRAS_MAPS) if (isMap(o[f])) counts[f] = Object.values(o[f]).filter(isMap).length
  if (Array.isArray(o.bodyweight)) counts.bodyweight = o.bodyweight.filter(b => isMap(b) && isISO(b.d) && Number(b.w) > 0).length
  if (Array.isArray(o.measurements)) counts.measurements = o.measurements.filter(m => isMap(m) && isISO(m.d)).length
  if (isMap(o.settings)) counts.settings = Object.keys(o.settings).length
  if (!Object.values(counts).some(n => n > 0)) return { error: 'empty' }
  return { data: o, counts }
}

/** Writes `data` (from readExtras) into a draft state. Returns what it wrote. */
export function applyExtras(s, data, now = Date.now()) {
  const done = {}
  for (const f of EXTRAS_MAPS) {
    if (!isMap(data[f])) continue
    let m = isMap(s[f]) ? s[f] : {}
    let n = 0
    for (const [id, rec] of Object.entries(data[f])) {
      if (!isMap(rec) || !id) continue
      m = withRecord(m, String(id).slice(0, 64), rec, now)
      n++
    }
    s[f] = m
    if (n) done[f] = n
  }
  const st = isMap(data.settings) ? data.settings : {}
  if (typeof st.nutriNetCarbs === 'boolean') s.nutriNetCarbs = st.nutriNetCarbs
  if (Array.isArray(st.nutriMeals)) {
    const list = st.nutriMeals.map(x => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 8)
    if (list.length) s.nutriMeals = list
  }
  const toUnit = kg => (s.unit === 'lb' ? Math.round(kg * LB * 10) / 10 : kg)
  if (Number(st.targetW) > 0) s.targetW = toUnit(Number(st.targetW))

  // Weigh-ins: one per day, only on days that have none yet, so a reading from the scale or one
  // typed in the app is never overwritten. The id makes a second import correct its own.
  if (Array.isArray(data.bodyweight)) {
    if (!Array.isArray(s.bodyweight)) s.bodyweight = []
    let n = 0
    for (const b of data.bodyweight) {
      if (!isMap(b) || !isISO(b.d) || !(Number(b.w) > 0)) continue
      const had = s.bodyweight.find(x => x && x.d === b.d)
      if (had && !(had.ins || []).some(r => String(r.id) === 'imp-' + b.d)) continue
      if (addWeighIn(s, { d: b.d, at: '07:00', w: toUnit(Number(b.w)), t: now, id: 'imp-' + b.d })) n++
    }
    if (n) done.bodyweight = n
  }
  // Body fat: into the day's measurements check-in, kept apart from anything else on that day.
  if (Array.isArray(data.measurements)) {
    if (!Array.isArray(s.measurements)) s.measurements = []
    if (!Array.isArray(s.customMeasurements)) s.customMeasurements = []
    let n = 0
    for (const m of data.measurements) {
      if (!isMap(m) || !isISO(m.d)) continue
      const fat = Number(m.bodyFat)
      if (!(fat > 0 && fat < 100)) continue
      let e = s.measurements.find(x => x && x.d === m.d)
      if (!e) { e = emptyMeasurement(m.d, s.customMeasurements); s.measurements.push(e) }
      e.bodyFat = Math.round(fat * 10) / 10
      e.t = now
      n++
    }
    if (n) {
      s.measurements.sort((a, b) => (a.d < b.d ? -1 : 1))
      const on = new Set(Array.isArray(s.measurementEnabled) ? s.measurementEnabled : [])
      on.add('bodyFat')
      s.measurementEnabled = [...on]
      normalizeMeasurementsState(s)
      done.measurements = n
    }
  }
  return done
}

/** What an import holds, in words, for the confirm sheet. */
export function countsText(counts, tr = (x, ...a) => x.replace(/\{(\d+)\}/g, (_, i) => a[i])) {
  const parts = []
  const add = (n, one, many) => { if (n) parts.push(tr(n === 1 ? one : many, n)) }
  add(counts.pedItems, '{0} compound', '{0} compounds')
  add(counts.pedLog, '{0} logged dose', '{0} logged doses')
  add(counts.bloodwork, '{0} blood panel', '{0} blood panels')
  add(counts.bpLog, '{0} blood pressure reading', '{0} blood pressure readings')
  add(counts.nutriTargets, '{0} set of targets', '{0} sets of targets')
  add(counts.mealTemplates, '{0} saved meal', '{0} saved meals')
  add(counts.foods, '{0} saved food', '{0} saved foods')
  add(counts.bodyweight, '{0} weigh-in', '{0} weigh-ins')
  add(counts.measurements, '{0} body fat reading', '{0} body fat readings')
  add(counts.markerDefs, '{0} marker range', '{0} marker ranges')
  return parts.join(', ')
}
