/* Fork additions: what the Coach reads of the nutrition log and the protocol log.
 *
 * Shared by both runtimes, like the rest of core/: the server's payload builder imports it, and
 * the app imports the reference tables and the schedule rules from here too (frontend
 * lib/protocol.js), so a "due" day means the same thing on the screen and in the prompt.
 *
 * Bounded and small on purpose. Nutrition: the targets and one line per logged day for the last
 * two weeks. Protocol: what runs (or ran in the last month, or starts in the next two weeks), how
 * many scheduled doses were logged in the last two weeks, the latest two blood panels and the
 * week's blood pressure. Notes, sites, labs and free text never leave. */

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
const liveOf = m => (isMap(m) ? Object.entries(m).filter(([, v]) => isMap(v) && !v.gone) : []);
const r1 = x => Math.round(Number(x) * 10) / 10;
const num = v => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const word = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ dates -- */

export function daysBetween(a, b) {
  const [ya, ma, da] = String(a).split('-').map(Number);
  const [yb, mb, db] = String(b).split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}
export function addDays(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function weekdayOf(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/* -------------------------------------------------------------- schedules -- */

export function cleanSched(s) {
  const t = s && s.type;
  if (t === 'days') {
    const days = [...new Set((s.days || []).map(Number).filter(d => d >= 0 && d <= 6))].sort();
    return days.length ? { type: 'days', days } : { type: 'every', n: 1 };
  }
  if (t === 'onoff') return { type: 'onoff', on: Math.max(1, Math.round(Number(s.on) || 1)), off: Math.max(0, Math.round(Number(s.off) || 0)) };
  if (t === 'prn') return { type: 'prn' };
  return { type: 'every', n: Math.max(1, Math.round(Number(s && s.n) || 1)) };
}
export function isActive(item, d) {
  if (!item) return false;
  if (item.start && d < item.start) return false;
  if (item.end && d > item.end) return false;
  return true;
}
export function dueOn(item, d) {
  if (!isActive(item, d)) return false;
  const s = cleanSched(item.sched);
  if (s.type === 'prn') return false;
  if (s.type === 'days') return s.days.includes(weekdayOf(d));
  const k = daysBetween(item.start || d, d);
  if (k < 0) return false;
  if (s.type === 'onoff') return k % (s.on + s.off) < s.on;
  return k % s.n === 0;
}
export function perWeek(sched) {
  const s = cleanSched(sched);
  if (s.type === 'days') return s.days.length;
  if (s.type === 'onoff') return Math.round((7 * s.on / (s.on + s.off)) * 100) / 100;
  if (s.type === 'prn') return 0;
  return Math.round((7 / s.n) * 100) / 100;
}
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** The schedule as a short English phrase, for the prompt. */
export function schedPhrase(sched) {
  const s = cleanSched(sched);
  if (s.type === 'days') return s.days.length === 7 ? 'daily' : s.days.map(d => DAY[d]).join('/');
  if (s.type === 'onoff') return `${s.on} days on, ${s.off} off`;
  if (s.type === 'prn') return 'as needed';
  return s.n === 1 ? 'daily' : s.n === 7 ? 'weekly' : `every ${s.n} days`;
}

/* -------------------------------------------------------------- reference -- */

// Typical adult male reference ranges in the units South African labs report. The app lets the
// person replace any of them with their own lab's range (S.markerDefs).
//   [key, name, unit, low, high, group]
export const MARKERS = [
  ['tt', 'Total testosterone', 'nmol/L', 8.6, 29, 'Hormones'],
  ['ft', 'Free testosterone', 'pmol/L', 170, 419, 'Hormones'],
  ['shbg', 'SHBG', 'nmol/L', 18.3, 54.1, 'Hormones'],
  ['e2', 'Oestradiol (E2)', 'pmol/L', null, 185, 'Hormones'],
  ['prl', 'Prolactin', 'µg/L', 3, 13, 'Hormones'],
  ['lh', 'LH', 'IU/L', 1.7, 8.6, 'Hormones'],
  ['fsh', 'FSH', 'IU/L', 1.5, 12.4, 'Hormones'],
  ['igf1', 'IGF-1', 'nmol/L', null, null, 'Hormones'],
  ['cort', 'Cortisol (morning)', 'nmol/L', 185, 624, 'Hormones'],
  ['tsh', 'TSH', 'mIU/L', 0.27, 4.2, 'Hormones'],
  ['ft4', 'Free T4', 'pmol/L', 12, 22, 'Hormones'],
  ['psa', 'PSA', 'ng/mL', null, 4, 'Hormones'],
  ['hct', 'Haematocrit', '%', 41.3, 52.4, 'Blood count'],
  ['hb', 'Haemoglobin', 'g/dL', 13.6, 17.6, 'Blood count'],
  ['rbc', 'Red cell count', '×10¹²/L', 4.66, 6.04, 'Blood count'],
  ['wbc', 'White cell count', '×10⁹/L', 3.9, 12.6, 'Blood count'],
  ['plt', 'Platelets', '×10⁹/L', 186, 454, 'Blood count'],
  ['lymph', 'Lymphocytes', '×10⁹/L', 1.4, 4.5, 'Blood count'],
  ['ferritin', 'Ferritin', 'ng/mL', 30, 400, 'Blood count'],
  ['alt', 'ALT', 'U/L', null, 50, 'Liver'],
  ['ast', 'AST', 'U/L', null, 50, 'Liver'],
  ['ggt', 'GGT', 'U/L', null, 60, 'Liver'],
  ['alp', 'ALP', 'U/L', 40, 130, 'Liver'],
  ['bili', 'Bilirubin, total', 'µmol/L', 5, 21, 'Liver'],
  ['creat', 'Creatinine', 'µmol/L', 64, 104, 'Kidney'],
  ['egfr', 'eGFR (creatinine)', 'mL/min', 90, null, 'Kidney'],
  ['cysc', 'Cystatin C', 'mg/L', 0.51, 0.98, 'Kidney'],
  ['urea', 'Urea', 'mmol/L', 2.1, 8.4, 'Kidney'],
  ['urate', 'Urate', 'mmol/L', 0.21, 0.43, 'Kidney'],
  ['chol', 'Total cholesterol', 'mmol/L', null, 5, 'Lipids'],
  ['ldl', 'LDL', 'mmol/L', null, 3, 'Lipids'],
  ['hdl', 'HDL', 'mmol/L', 1, null, 'Lipids'],
  ['nonhdl', 'Non-HDL cholesterol', 'mmol/L', null, 3.7, 'Lipids'],
  ['tg', 'Triglycerides', 'mmol/L', null, 1.7, 'Lipids'],
  ['apob', 'Apolipoprotein B', 'g/L', null, 1.2, 'Lipids'],
  ['glu', 'Glucose, fasting', 'mmol/L', 3.9, 5.6, 'Metabolic'],
  ['hba1c', 'HbA1c', '%', null, 5.7, 'Metabolic'],
  ['insulin', 'Insulin, fasting', 'mIU/L', 2.6, 24.9, 'Metabolic'],
  ['crp', 'CRP', 'mg/L', null, 5, 'Metabolic'],
  ['esr', 'ESR', 'mm/h', null, 15, 'Metabolic'],
].map(([key, name, unit, lo, hi, group]) => ({ key, name, unit, lo, hi, group }));

/** The marker table with the profile's own ranges and own markers. */
export function markerTable(S) {
  const own = isMap(S && S.markerDefs) ? S.markerDefs : {};
  const out = MARKERS.map(m => {
    const o = own[m.key];
    if (!isMap(o) || o.gone) return m;
    return { ...m, ...(o.name ? { name: o.name } : {}), ...(o.unit ? { unit: o.unit } : {}), lo: o.lo ?? m.lo, hi: o.hi ?? m.hi, own: true };
  });
  for (const [key, o] of liveOf(own)) {
    if (MARKERS.some(m => m.key === key)) continue;
    out.push({ key, name: o.name || key, unit: o.unit || '', lo: o.lo ?? null, hi: o.hi ?? null, group: 'Your own', custom: true });
  }
  return out;
}

/* -------------------------------------------------------------- nutrition -- */

export const NUTRITION_DAYS = 14;

const rangeOut = v => {
  const lo = Array.isArray(v) ? num(v[0]) : num(v), hi = Array.isArray(v) ? num(v[1]) : num(v);
  return lo || hi ? [lo || null, hi || null] : null;
};
function targetOut(t) {
  if (!isMap(t) || t.gone) return null;
  const o = {};
  for (const k of ['kcal', 'p', 'c', 'f']) { const r = rangeOut(t[k]); if (r) o[k] = r; }
  return Object.keys(o).length ? o : null;
}

/**
 * The nutrition picture for the Coach, or null when nothing was ever logged or targeted.
 * { netCarbs, targets: { train?, rest? }, days: [{ d, train, kcal, p, c, f, fib? }] }
 * Macros in grams, energy in kcal; `train` says whether that day had a workout (or was set as one).
 */
export function nutritionOut(S, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const from = addDays(today, -(NUTRITION_DAYS - 1));
  const tg = isMap(S && S.nutriTargets) ? S.nutriTargets : {};
  const targets = {};
  const tt = targetOut(tg.train), tr = targetOut(tg.rest);
  if (tt) targets.train = tt;
  if (tr) targets.rest = tr;
  const byDay = new Map();
  for (const [, x] of liveOf(S && S.foodLog)) {
    if (!ISO.test(x.d || '') || x.d < from || x.d > today) continue;
    const cur = byDay.get(x.d) || { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    for (const k of Object.keys(cur)) cur[k] += Number(x[k]) || 0;
    byDay.set(x.d, cur);
  }
  if (!byDay.size && !tt && !tr) return null;
  const trained = new Set((S.workouts || []).filter(w => w && ISO.test(w.d || '')).map(w => w.d));
  const nd = isMap(S.nutriDays) ? S.nutriDays : {};
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({
    d,
    train: nd[d] && (nd[d].kind === 'train' || nd[d].kind === 'rest') ? nd[d].kind === 'train' : trained.has(d),
    kcal: Math.round(v.kcal), p: r1(v.p), c: r1(v.c), f: r1(v.f), ...(v.fib > 0 ? { fib: r1(v.fib) } : {}),
  }));
  return { netCarbs: !!S.nutriNetCarbs, targets, days };
}

/* --------------------------------------------------------------- protocol -- */

export const PROTOCOL_DAYS = 14;

/**
 * The protocol picture for the Coach, or null when nothing is logged.
 * { items: [{ name, kind, route, dose, unit, schedule, perWeek, start, end?, phase?, logged14? }],
 *   blood: [{ d, markers: [{ name, v, unit, range, flag }] }], bp: { avg7?, last? } }
 */
export function protocolOut(S, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const from = addDays(today, -(PROTOCOL_DAYS - 1));
  const monthAgo = addDays(today, -30), soon = addDays(today, 14);
  const logged = new Map();
  for (const [, x] of liveOf(S && S.pedLog)) {
    if (!x.item || !ISO.test(x.d || '') || x.d < from || x.d > today) continue;
    if (!logged.has(x.item)) logged.set(x.item, new Set());
    logged.get(x.item).add(x.d);
  }
  const items = liveOf(S && S.pedItems)
    .filter(([, it]) => word(it.name, 80) && (!it.end || it.end >= monthAgo) && (!it.start || it.start <= soon))
    .slice(0, 24)
    .map(([id, it]) => {
      const o = {
        name: word(it.name, 80), kind: word(it.kind, 16) || 'other', route: word(it.route, 8) || undefined,
        dose: num(it.dose) ?? undefined, unit: word(it.unit, 6) || undefined,
        schedule: schedPhrase(it.sched), perWeek: perWeek(it.sched), start: ISO.test(it.start || '') ? it.start : undefined,
        ...(ISO.test(it.end || '') ? { end: it.end } : {}), ...(word(it.phase, 40) ? { phase: word(it.phase, 40) } : {}),
        status: it.start && it.start > today ? 'upcoming' : it.end && it.end < today ? 'ended' : 'running',
      };
      if (o.status === 'running' && cleanSched(it.sched).type !== 'prn') {
        let due = 0, taken = 0;
        const start = it.start && it.start > from ? it.start : from;
        for (let d = start; d <= today; d = addDays(d, 1)) if (dueOn(it, d)) { due++; if (logged.get(id) && logged.get(id).has(d)) taken++; }
        o.logged14 = { due, taken };
      }
      return o;
    });
  const table = markerTable(S);
  const blood = liveOf(S && S.bloodwork)
    .filter(([, p]) => ISO.test(p.d || '') && isMap(p.vals))
    .sort((a, b) => (a[1].d < b[1].d ? 1 : -1))
    .slice(0, 2)
    .map(([, p]) => ({
      d: p.d,
      markers: Object.entries(p.vals).filter(([, v]) => Number.isFinite(Number(v))).slice(0, 60).map(([k, v]) => {
        const m = table.find(x => x.key === k) || { name: k, unit: '', lo: null, hi: null };
        const x = Number(v);
        const flag = m.lo != null && x < m.lo ? 'low' : m.hi != null && x > m.hi ? 'high' : undefined;
        return { name: word(m.name, 60), v: x, unit: m.unit || undefined, range: m.lo != null || m.hi != null ? [m.lo, m.hi] : undefined, ...(flag ? { flag } : {}) };
      }),
    }));
  const bpAll = liveOf(S && S.bpLog).map(([, x]) => x).filter(x => ISO.test(x.d || '') && x.sys > 0 && x.dia > 0).sort((a, b) => (a.d < b.d ? 1 : -1));
  const week = bpAll.filter(x => x.d >= addDays(today, -6));
  const bp = {};
  if (week.length) bp.avg7 = { n: week.length, sys: Math.round(week.reduce((s, x) => s + x.sys, 0) / week.length), dia: Math.round(week.reduce((s, x) => s + x.dia, 0) / week.length) };
  if (bpAll.length) bp.last = { d: bpAll[0].d, sys: Math.round(bpAll[0].sys), dia: Math.round(bpAll[0].dia), ...(bpAll[0].hr ? { hr: Math.round(bpAll[0].hr) } : {}) };
  if (!items.length && !blood.length && !bpAll.length) return null;
  return { items, blood, ...(Object.keys(bp).length ? { bp } : {}) };
}
