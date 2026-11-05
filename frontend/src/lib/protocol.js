// Protocol tracking (fork addition): compounds, the doses actually taken, injection-site
// rotation, blood work and blood pressure. Pure helpers, no React, no store.
//
// This is a log, not an adviser. Nothing here suggests a compound or a dose: it schedules what
// the person entered, counts what they logged and flags a lab value against the range they (or
// their lab) gave.
//
// What is stored (stamped maps, lib/stamped.js):
//
//   S.pedItems   = { [id]: Item }
//     Item = { name, kind, route, dose, unit, sched, start, end?, conc?, phase?, notes?, _ts }
//       kind   'injectable' | 'oral' | 'peptide' | 'ancillary' | 'supplement' | 'other'
//       route  'im' | 'subq' | 'oral' | 'other'
//       unit   'mg' | 'mcg' | 'iu' | 'ml' | 'tab' | 'cap'
//       sched  { type: 'days', days: [1, 4] }       weekdays, getDay() numbers
//              { type: 'every', n: 2 }              every n days from start (1 = daily)
//              { type: 'onoff', on: 5, off: 2 }     n days on, m days off from start
//              { type: 'prn' }                      as needed: never "due"
//       conc   strength of the vial, mg/ml (or IU/ml for an IU dose), for the draw volume
//   S.pedLog     = { [id]: { d, at, item, name, dose, unit, site?, note?, _ts } }
//   S.bloodwork  = { [id]: { d, lab?, vals: { [marker]: number }, note?, _ts } }
//   S.markerDefs = { [marker]: { name, unit, lo, hi, group, _ts } }  your own or overridden ranges
//   S.bpLog      = { [id]: { d, at, sys, dia, hr?, note?, _ts } }
import { live, liveList, isMap, addDays, round } from './stamped.js'
// The schedule rules and the marker table are shared with the Coach's payload (api/coach/core/
// extras.js), so a dose that is "due" here is due in the prompt too.
import { cleanSched, isActive, dueOn, perWeek, MARKERS, markerTable } from '../../../api/coach/core/extras.js'
export { cleanSched, isActive, dueOn, perWeek, MARKERS }

export const KINDS = [
  { id: 'injectable', label: 'Injectable', icon: 'syringe', route: 'im' },
  { id: 'oral', label: 'Oral', icon: 'pill', route: 'oral' },
  { id: 'peptide', label: 'Peptide', icon: 'syringe', route: 'subq' },
  { id: 'ancillary', label: 'Ancillary', icon: 'pill', route: 'oral' },
  { id: 'supplement', label: 'Supplement', icon: 'pill', route: 'oral' },
  { id: 'other', label: 'Other', icon: 'pill', route: 'other' },
]
export const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]))
export const ROUTES = [
  { id: 'im', label: 'Intramuscular' }, { id: 'subq', label: 'Subcutaneous' },
  { id: 'oral', label: 'Oral' }, { id: 'other', label: 'Other' },
]
export const UNITS = ['mg', 'mcg', 'iu', 'ml', 'tab', 'cap']
export const UNIT_LABEL = { mg: 'mg', mcg: 'mcg', iu: 'IU', ml: 'ml', tab: 'tab', cap: 'cap' }

// Rotation sites per route. Left and right are separate sites, so a rotation alternates sides.
export const SITES = {
  im: ['Glute L', 'Glute R', 'Ventroglute L', 'Ventroglute R', 'Delt L', 'Delt R', 'Quad L', 'Quad R', 'Lat L', 'Lat R'],
  subq: ['Abdomen L', 'Abdomen R', 'Love handle L', 'Love handle R', 'Thigh L', 'Thigh R', 'Upper arm L', 'Upper arm R'],
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* --------------------------------------------------------------- schedule -- */

/** The schedule in words: "Mon · Thu", "Daily", "Every 3 days", "5 on / 2 off", "As needed". */
export function schedText(s, tr = x => x) {
  const c = cleanSched(s)
  if (c.type === 'days') return c.days.length === 7 ? tr('Daily') : c.days.map(d => tr(DAY_SHORT[d])).join(' · ')
  if (c.type === 'onoff') return tr('{0} on / {1} off', c.on, c.off)
  if (c.type === 'prn') return tr('As needed')
  return c.n === 1 ? tr('Daily') : c.n === 7 ? tr('Weekly') : tr('Every {0} days', c.n)
}

/** The weekly amount: "300 mg / week". Null for an as-needed item or a dose without a number. */
export function weeklyAmount(item) {
  const dose = Number(item?.dose)
  if (!(dose > 0)) return null
  const n = perWeek(item.sched)
  if (!n) return null
  return { amount: round(dose * n, 2), unit: item.unit || 'mg' }
}

/** How much to draw for `dose` from a vial of `item.conc`: { ml, units } (U-100 syringe), or null. */
export function drawFor(item, dose = item?.dose) {
  const conc = Number(item?.conc), d = Number(dose)
  if (!(conc > 0) || !(d > 0)) return null
  const unit = item?.unit || 'mg'
  let amount = d
  if (unit === 'mcg') amount = d / 1000
  else if (unit !== 'mg' && unit !== 'iu') return null
  const ml = amount / conc
  return { ml: round(ml, 3), units: round(ml * 100, 1) }
}

/* --------------------------------------------------------------- the log -- */

export const items = S => liveList(S?.pedItems).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')) || String(a.name).localeCompare(String(b.name)))
export const activeItems = (S, d) => items(S).filter(i => isActive(i, d))
export const logList = S => liveList(S?.pedLog).sort((a, b) => (b.d || '').localeCompare(a.d || '') || (b.at || 0) - (a.at || 0))

/** What was logged for `itemId` on `d`. */
export const takenOn = (S, itemId, d) => liveList(S?.pedLog).filter(x => x.item === itemId && x.d === d)

/** Today's list: every active item due on `d`, plus as-needed ones already logged that day. */
export function dueList(S, d) {
  const out = []
  for (const it of activeItems(S, d)) {
    const taken = takenOn(S, it.id, d)
    if (dueOn(it, d) || taken.length) out.push({ item: it, taken, due: dueOn(it, d) })
  }
  return out
}

/** Active items not due on `d`, each with the next day it is due (within 60 days). */
export function nextDue(item, d) {
  for (let i = 1; i <= 60; i++) {
    const day = addDays(d, i)
    if (dueOn(item, day)) return day
  }
  return null
}

/**
 * The rotation site to use next for `item`: of its route's sites (or the person's own list on
 * the item), the one used longest ago across every logged dose; never used comes first, in
 * list order.
 */
export function nextSite(S, item) {
  const sites = Array.isArray(item?.sites) && item.sites.length ? item.sites : SITES[item?.route] || null
  if (!sites) return null
  const last = new Map()
  for (const x of liveList(S?.pedLog)) {
    if (!x.site) continue
    const t = x.at || Date.parse((x.d || '') + 'T12:00:00') || 0
    if (!last.has(x.site) || last.get(x.site) < t) last.set(x.site, t)
  }
  let best = null, bestT = Infinity
  for (const s of sites) {
    const t = last.has(s) ? last.get(s) : -1
    if (t < bestT) { best = s; bestT = t }
  }
  return best
}

/** Of the doses due from `from` to `to`, how many have a log entry that day. */
export function adherence(S, item, from, to) {
  let due = 0, taken = 0
  const logged = new Set(liveList(S?.pedLog).filter(x => x.item === item.id).map(x => x.d))
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!dueOn(item, d)) continue
    due++
    if (logged.has(d)) taken++
  }
  return { due, taken }
}

/** Phases in use, newest start first: what the compounds screen groups by. */
export function phasesOf(S) {
  const seen = new Map()
  for (const it of items(S)) {
    const p = (it.phase || '').trim()
    if (!p) continue
    if (!seen.has(p) || (it.start || '') > seen.get(p)) seen.set(p, it.start || '')
  }
  return [...seen.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([p]) => p)
}

/* ------------------------------------------------------------- blood work -- */

export const MARKER_GROUPS = ['Hormones', 'Blood count', 'Liver', 'Kidney', 'Lipids', 'Metabolic', 'Your own']

/** Every marker this profile knows: the built-in ones (with any range of their own), then its own. */
export const markerDefs = S => markerTable(S)
export const markerDef = (S, key) => markerDefs(S).find(m => m.key === key) || { key, name: key, unit: '', lo: null, hi: null, group: 'Your own' }

/** 'low' | 'high' | 'ok' | null against a marker's range. */
export function flagOf(value, def) {
  const v = Number(value)
  if (!Number.isFinite(v) || !def) return null
  if (def.lo != null && v < def.lo) return 'low'
  if (def.hi != null && v > def.hi) return 'high'
  return def.lo != null || def.hi != null ? 'ok' : null
}

/** A range in words: "41.3–52.4", "< 185", "> 90". */
export function rangeOf(def) {
  if (!def) return ''
  if (def.lo != null && def.hi != null) return `${def.lo}–${def.hi}`
  if (def.hi != null) return `< ${def.hi}`
  if (def.lo != null) return `> ${def.lo}`
  return ''
}

/** Panels, newest first. */
export const panels = S => liveList(S?.bloodwork).sort((a, b) => (b.d || '').localeCompare(a.d || ''))

/** One marker over time, oldest first: [{ d, v }]. */
export function markerSeries(S, key) {
  return panels(S).filter(p => isMap(p.vals) && Number.isFinite(Number(p.vals[key])))
    .map(p => ({ d: p.d, v: Number(p.vals[key]) })).reverse()
}

/** The markers a profile has ever logged, in the reference list's order, own ones after. */
export function loggedMarkers(S) {
  const have = new Set()
  for (const p of panels(S)) if (isMap(p.vals)) for (const [k, v] of Object.entries(p.vals)) if (Number.isFinite(Number(v))) have.add(k)
  return markerDefs(S).filter(m => have.has(m.key))
}

/** The newest value of every marker, with its date and flag: the blood work summary. */
export function latestValues(S) {
  const out = []
  for (const m of loggedMarkers(S)) {
    const s = markerSeries(S, m.key)
    const last = s.at(-1), prev = s.at(-2)
    out.push({ def: m, d: last.d, v: last.v, prev: prev ? prev.v : null, flag: flagOf(last.v, m) })
  }
  return out
}

/* ---------------------------------------------------------- blood pressure -- */

export const bpList = S => liveList(S?.bpLog).sort((a, b) => (b.d || '').localeCompare(a.d || '') || (b.at || 0) - (a.at || 0))

/** A reading's band, by the common adult categories. */
export function bpBand(sys, dia) {
  const s = Number(sys), d = Number(dia)
  if (!(s > 0) || !(d > 0)) return null
  if (s >= 140 || d >= 90) return { id: 'high2', label: 'High (stage 2)', color: 'var(--red)' }
  if (s >= 130 || d >= 80) return { id: 'high1', label: 'High (stage 1)', color: 'var(--orange)' }
  if (s >= 120) return { id: 'elevated', label: 'Elevated', color: 'var(--yellow)' }
  return { id: 'normal', label: 'Normal', color: 'var(--green)' }
}

/** Average of the readings from `from` on. */
export function bpAverage(S, from) {
  const xs = bpList(S).filter(x => x.d >= from && x.sys > 0 && x.dia > 0)
  if (!xs.length) return null
  return { n: xs.length, sys: Math.round(xs.reduce((s, x) => s + x.sys, 0) / xs.length), dia: Math.round(xs.reduce((s, x) => s + x.dia, 0) / xs.length) }
}

/** Whether anything at all is logged here: decides whether the Coach hears about it. */
export const hasProtocol = S => live(S?.pedItems).length > 0 || live(S?.bloodwork).length > 0 || live(S?.bpLog).length > 0
