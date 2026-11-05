// Macro tracking (fork addition). Pure helpers, no React, no store.
//
// What is stored (all stamped maps, lib/stamped.js):
//
//   S.foodLog       = { [id]: { d, meal, name, brand?, g, kcal, p, c, f, fib?, foodId?, _ts } }
//                     what was eaten: the numbers are copied in when logged, so editing or
//                     deleting a saved food later never rewrites a day that is already done
//   S.foods         = { [id]: { name, brand?, code?, per: { kcal, p, c, f, fib? }, serving?, src, _ts } }
//                     saved foods, values per 100 g (or 100 ml)
//   S.mealTemplates = { [id]: { name, items: [{ name, brand?, g, kcal, p, c, f, fib?, foodId? }], _ts } }
//                     a meal you eat often, logged in one tap
//   S.nutriTargets  = { train: Target, rest: Target }, each { kcal, p, c, f, fib? } as [lo, hi]
//                     ranges (either end may be null: [null, 25] is "under 25 g"), plus _ts
//   S.nutriDays     = { [iso]: { kind: 'train' | 'rest', _ts } }   a day switched by hand
//
// and two plain settings: S.nutriMeals (the meal names, in order) and S.nutriNetCarbs (count
// carbs as net carbs: carbs minus fibre, for keto).
import { live, liveList, isMap, round, addDays, grouped } from './stamped.js'
import { effectiveRoutineIds } from './history.js'

export const DEFAULT_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
export const MACROS = ['kcal', 'p', 'c', 'f']
export const MACRO_LABEL = { kcal: 'Calories', p: 'Protein', c: 'Carbs', f: 'Fat', fib: 'Fibre' }
export const MACRO_UNIT = { kcal: 'kcal', p: 'g', c: 'g', f: 'g', fib: 'g' }
export const MACRO_COLOR = { kcal: 'var(--acc)', p: 'var(--red)', c: 'var(--blue)', f: 'var(--orange)', fib: 'var(--green)' }

/** The meal names this profile uses. */
export function mealsOf(S) {
  const m = Array.isArray(S?.nutriMeals) ? S.nutriMeals.map(x => String(x || '').trim()).filter(Boolean) : []
  return m.length ? m.slice(0, 8) : DEFAULT_MEALS
}

/** Energy from the three macros (Atwater: 4 / 4 / 9). */
export const kcalOf = (p, c, f) => 4 * (Number(p) || 0) + 4 * (Number(c) || 0) + 9 * (Number(f) || 0)

/** Per-100 values, cleaned: every macro a number ≥ 0, kcal worked out when it is missing. */
export function cleanPer(per) {
  const n = v => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0 }
  const o = { p: n(per?.p), c: n(per?.c), f: n(per?.f) }
  const k = Number(per?.kcal)
  o.kcal = Number.isFinite(k) && k > 0 ? k : round(kcalOf(o.p, o.c, o.f), 0)
  const fib = Number(per?.fib)
  if (Number.isFinite(fib) && fib > 0) o.fib = fib
  return o
}

/** What `g` grams of a food with per-100 values `per` carries, to one decimal (kcal whole). */
export function portion(per, g) {
  const p = cleanPer(per)
  const k = (Number(g) || 0) / 100
  const o = { kcal: round(p.kcal * k, 0), p: round(p.p * k), c: round(p.c * k), f: round(p.f * k) }
  if (p.fib) o.fib = round(p.fib * k)
  return o
}

/** Sum of a list of logged items. */
export function totals(items) {
  const o = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 }
  for (const x of items || []) for (const k of Object.keys(o)) o[k] += Number(x?.[k]) || 0
  for (const k of Object.keys(o)) o[k] = round(o[k], k === 'kcal' ? 0 : 1)
  return o
}

/** Carbs as this profile counts them: net (minus fibre) when S.nutriNetCarbs is on. */
export const carbsShown = (S, t) => (S?.nutriNetCarbs ? Math.max(0, round((t?.c || 0) - (t?.fib || 0))) : (t?.c || 0))

/** The items logged on `d`, in meal order, then in the order they were added. */
export function logOn(S, d) {
  const meals = mealsOf(S)
  const idx = m => { const i = meals.indexOf(m); return i < 0 ? meals.length : i }
  return liveList(S?.foodLog).filter(x => x.d === d)
    .sort((a, b) => idx(a.meal) - idx(b.meal) || (a.at || a._ts || 0) - (b.at || b._ts || 0))
}

/** The items of `d` grouped by meal: [{ meal, items, totals }], every meal of the profile listed. */
export function mealsOn(S, d) {
  const items = logOn(S, d)
  const meals = mealsOf(S)
  const extra = [...new Set(items.map(x => x.meal).filter(m => !meals.includes(m)))]
  return [...meals, ...extra].map(meal => {
    const xs = items.filter(x => x.meal === meal)
    return { meal, items: xs, totals: totals(xs) }
  })
}

/* ---------------------------------------------------------------- targets -- */

/** 'train' or 'rest' for `d`: a hand-set day first, then a workout logged or planned that day. */
export function dayKind(S, d) {
  const set = isMap(S?.nutriDays) ? S.nutriDays[d] : null
  if (set && (set.kind === 'train' || set.kind === 'rest')) return set.kind
  if ((S?.workouts || []).some(w => w && w.d === d)) return 'train'
  try { if (effectiveRoutineIds(S, d).length) return 'train' } catch { /* a profile without a plan */ }
  return 'rest'
}

const range = v => {
  if (Array.isArray(v)) {
    const lo = Number(v[0]), hi = Number(v[1])
    return [Number.isFinite(lo) && lo > 0 ? lo : null, Number.isFinite(hi) && hi > 0 ? hi : null]
  }
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? [x, x] : [null, null]
}

/** A stored target, cleaned: every macro an [lo, hi] pair. Null when nothing at all is set. */
export function cleanTarget(t) {
  if (!isMap(t)) return null
  const o = {}
  let any = false
  for (const k of [...MACROS, 'fib']) { o[k] = range(t[k]); if (o[k][0] != null || o[k][1] != null) any = true }
  return any ? o : null
}

/** The target for `d`: that kind of day's, the other kind's when only one is set, or null. */
export function targetFor(S, d) {
  const tg = isMap(S?.nutriTargets) ? S.nutriTargets : {}
  const kind = dayKind(S, d)
  const other = kind === 'train' ? 'rest' : 'train'
  return cleanTarget(tg[kind]) || cleanTarget(tg[other]) || null
}

/** One number against an [lo, hi] range: how full the bar is and whether it is in range. */
export function against(value, [lo, hi] = [null, null]) {
  const v = Number(value) || 0
  const goal = hi != null && lo != null ? (lo + hi) / 2 : hi ?? lo
  if (goal == null) return { pct: 0, state: 'none', goal: null, left: null }
  const pct = Math.max(0, Math.min(1.25, v / goal))
  let state = 'ok'
  if (lo != null && v < lo) state = 'under'
  else if (hi != null && v > hi) state = 'over'
  // A ceiling only ("under 25 g"): anything up to it is fine.
  if (lo == null && hi != null) state = v > hi ? 'over' : 'ok'
  const left = round((hi ?? lo) - v, 0)
  return { pct, state, goal, left, lo, hi }
}

/** A target range in words: "190–210", "under 25", "2 600". */
export function rangeText([lo, hi] = [null, null]) {
  const f = x => grouped(x)
  if (lo != null && hi != null) return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`
  if (hi != null) return `≤ ${f(hi)}`
  if (lo != null) return `≥ ${f(lo)}`
  return ''
}

/* ---------------------------------------------------------------- history -- */

/** One row per day from `from` to `to`: { d, kind, logged, kcal, p, c, f, fib }. */
export function daysSeries(S, from, to) {
  const byDay = new Map()
  for (const [, x] of live(S?.foodLog)) {
    if (!x.d || x.d < from || x.d > to) continue
    if (!byDay.has(x.d)) byDay.set(x.d, [])
    byDay.get(x.d).push(x)
  }
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const xs = byDay.get(d) || []
    out.push({ d, kind: dayKind(S, d), logged: xs.length > 0, ...totals(xs) })
    if (out.length > 400) break
  }
  return out
}

/** Averages of the days that have something logged. */
export function averageOf(rows) {
  const xs = (rows || []).filter(r => r.logged)
  if (!xs.length) return null
  const o = { days: xs.length }
  for (const k of ['kcal', 'p', 'c', 'f', 'fib']) o[k] = round(xs.reduce((s, r) => s + (r[k] || 0), 0) / xs.length, k === 'kcal' ? 0 : 1)
  return o
}

/** Whether something was ever logged: decides whether the Coach hears about nutrition at all. */
export const hasNutrition = S => live(S?.foodLog).length > 0 || !!cleanTarget(S?.nutriTargets?.train) || !!cleanTarget(S?.nutriTargets?.rest)

/* ----------------------------------------------------------- quick re-use -- */

/** The foods logged most recently, one per name: what the add sheet offers before any search. */
export function recentFoods(S, n = 12) {
  const seen = new Set()
  const out = []
  const all = liveList(S?.foodLog).sort((a, b) => (b._ts || 0) - (a._ts || 0))
  for (const x of all) {
    const k = (x.name || '').toLowerCase() + '|' + (x.brand || '').toLowerCase()
    if (!x.name || seen.has(k)) continue
    seen.add(k)
    out.push(x)
    if (out.length >= n) break
  }
  return out
}

/** Per-100 values backed out of a logged item, so "log again" can rescale it. */
export function perOfItem(x) {
  const g = Number(x?.g)
  if (!(g > 0)) return null
  const k = 100 / g
  return cleanPer({ kcal: (x.kcal || 0) * k, p: (x.p || 0) * k, c: (x.c || 0) * k, f: (x.f || 0) * k, fib: (x.fib || 0) * k })
}

/** The items of `fromD` as new records dated `toD` (each needs its own id and stamp). */
export function copyItems(S, fromD, toD, meal = null) {
  return logOn(S, fromD).filter(x => !meal || x.meal === meal).map(({ id, _ts, ...x }) => ({ ...x, d: toD }))
}

/** A loose text match for the food search: every word of `q` somewhere in name or brand. */
export function matches(q, ...fields) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return words.every(w => hay.includes(w))
}

/** Saved foods, newest first. */
export const savedFoods = S => liveList(S?.foods).sort((a, b) => (b._ts || 0) - (a._ts || 0))
/** Saved meals, by name. */
export const savedMeals = S => liveList(S?.mealTemplates).sort((a, b) => String(a.name).localeCompare(String(b.name)))
