// Shared helpers for the fork's own data (nutrition, protocol): records kept in stamped maps.
//
//   S.foodLog = { [id]: { d, name, kcal, …, _ts }, … }
//
// Every record carries the time it was last written, so two devices that each added something
// keep both, and the same record keeps the later edit (lib/sync-merge.js mergeStampedMap, the
// fields are listed in STAMPED_MAPS there and in api/sync-stamps.js). Removing one writes a
// stamped tombstone (`{ _ts, gone: 1 }`), never a deleted key: a deleted key would come straight
// back from the other device's copy on the next sync. Readers skip the tombstones (live).

export const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

/** [id, record] pairs of `map` that are not tombstones. */
export function live(map) {
  if (!isMap(map)) return []
  return Object.entries(map).filter(([, v]) => isMap(v) && !v.gone)
}

/** The records of `map`, each with its `id`, tombstones left out. */
export const liveList = map => live(map).map(([id, v]) => ({ ...v, id }))

/** One record by id, or null for none or a removed one. */
export function getLive(map, id) {
  const v = isMap(map) ? map[id] : null
  return isMap(v) && !v.gone ? { ...v, id } : null
}

/** `map` with `id` set to `rec` (its `id` key dropped), stamped `now`. */
export function withRecord(map, id, rec, now = Date.now()) {
  const { id: _drop, gone: _g, ...clean } = rec || {}
  return { ...(isMap(map) ? map : {}), [id]: { ...clean, _ts: now } }
}

/** `map` with `id` removed, as a stamped tombstone so the removal syncs. */
export function withoutRecord(map, id, now = Date.now()) {
  return { ...(isMap(map) ? map : {}), [id]: { _ts: now, gone: 1 } }
}

/** A short random id, the same shape lib/format.js uid() makes. */
export const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const isISO = s => ISO.test(String(s || ''))

/** Whole days from `a` to `b` (both YYYY-MM-DD), by the calendar, never by the clock. */
export function daysBetween(a, b) {
  const [ya, ma, da] = String(a).split('-').map(Number)
  const [yb, mb, db] = String(b).split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

/** `iso` moved by `n` days. */
export function addDays(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** getDay() of a date string: 0 Sunday … 6 Saturday. */
export function weekdayOf(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** A number rounded to `dp` decimals, or null for anything that is not a finite number. */
export function round(n, dp = 1) {
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  const f = 10 ** dp
  return Math.round(x * f) / f
}

/** A number with thin groups of three ("2 600"), the same on every device whatever its locale. */
export function grouped(n, dp = 0) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '–'
  const f = 10 ** dp
  const v = Math.round(x * f) / f
  const [i, d] = Math.abs(v).toFixed(dp).split('.')
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (v < 0 ? '-' : '') + g + (d && Number(d) ? '.' + d.replace(/0+$/, '') : '')
}
