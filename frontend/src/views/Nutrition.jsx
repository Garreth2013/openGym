// Nutrition (fork addition): the day's food log against your targets. Data and rules live in
// lib/nutrition.js; this file is only the screens and sheets.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { fmtDate, todayISO, DAYS } from '../lib/format.js'
import { webScanner, scanCode } from '../lib/scan.js'
import {
  mealsOf, mealsOn, totals, targetFor, dayKind, against, rangeText, carbsShown, portion, cleanPer,
  recentFoods, perOfItem, copyItems, matches, savedFoods, savedMeals, daysSeries, averageOf,
  MACRO_COLOR, DEFAULT_MEALS, cleanTarget,
} from '../lib/nutrition.js'
import { BUILTIN_FOODS } from '../lib/foods-builtin.js'
import { withRecord, withoutRecord, rid, addDays, weekdayOf, round, isMap, grouped } from '../lib/stamped.js'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import CameraScan from '../components/CameraScan.jsx'
import { Button, NumberField, TextField, SearchField, Segmented, Switch, Row, SelectRow } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import ExtrasImportButton from '../components/ExtrasImport.jsx'
import '../extras.css'

const update = (fn, push) => useStore.getState().update(fn, push)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const fmt = (x, dp = 0) => (x == null ? '–' : grouped(x, dp))
const carbLabel = S => (S.nutriNetCarbs ? t('Net carbs') : t('Carbs'))

/* ================================================================ pieces == */

export function MacroBar({ label, value, range, color, unit = 'g' }) {
  const a = against(value, range || [null, null])
  const lo = a.lo, hi = a.hi
  const scale = Math.max(a.goal || 0, hi || 0, value || 0) * 1.08 || 1
  const band = lo != null && hi != null && hi > lo ? { left: (lo / scale) * 100 + '%', width: ((hi - lo) / scale) * 100 + '%' } : null
  return <div className={'nx-bar ' + a.state} style={{ '--c': color }}>
    <div className="nx-bar-h"><b>{label}</b>
      <span>{fmt(value, unit === 'kcal' ? 0 : 0)}{a.goal != null ? ' / ' + rangeText([lo, hi]) : ''} {unit}</span></div>
    <div className="nx-track">
      {band && <div className="nx-band" style={band} />}
      <div className="nx-fill" style={{ width: Math.min(100, ((value || 0) / scale) * 100) + '%' }} />
    </div>
  </div>
}

export function KcalRing({ value, range, size = 112 }) {
  const a = against(value, range || [null, null])
  const r = 46, c = 2 * Math.PI * r
  const pct = a.goal ? Math.min(1, (value || 0) / a.goal) : 0
  return <div className={'nx-ring' + (a.state === 'over' ? ' over' : '')} style={{ width: size, height: size }}>
    <svg viewBox="0 0 112 112" aria-hidden="true">
      <circle className="bg" cx="56" cy="56" r={r} />
      <circle className="fg" cx="56" cy="56" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
    <div className="nx-ring-c">
      <b>{fmt(value)}</b>
      <span>{a.goal != null ? (a.state === 'over' ? t('{0} over', fmt(-a.left)) : t('{0} left', fmt(a.left))) : 'kcal'}</span>
    </div>
  </div>
}

function ItemMacros({ x, S }) {
  return <span className="nx-macros">
    <i className="p">P {fmt(x.p)}</i><i className="c">{S.nutriNetCarbs ? 'NC' : 'C'} {fmt(carbsShown(S, x))}</i><i className="f">F {fmt(x.f)}</i>
  </span>
}

/* ================================================================ screen == */

export default function Nutrition() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [d, setD] = useState(todayISO())
  const today = todayISO()
  const meals = useMemo(() => mealsOn(S, d), [S, d])
  const all = totals(meals.flatMap(m => m.items))
  const target = targetFor(S, d)
  const kind = dayKind(S, d)
  const week = useMemo(() => daysSeries(S, addDays(d, -6), d), [S, d])
  const avg = averageOf(week)

  const toggleKind = () => update(s => { s.nutriDays = withRecord(s.nutriDays, d, { kind: kind === 'train' ? 'rest' : 'train' }) })
  const copyYesterday = () => {
    const xs = copyItems(S, addDays(d, -1), d)
    if (!xs.length) { toast(t('Nothing logged the day before.')); return }
    update(s => { let m = s.foodLog; for (const x of xs) m = withRecord(m, rid(), { ...x, at: Date.now() }); s.foodLog = m })
    toast(t('{0} items copied', xs.length))
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Nutrition')}</h1><div className="sub">{t('Food log and macros')}</div></div>
      <button className="iconbtn" onClick={() => targetsSheet()} aria-label={t('Targets')}><Icon name="target" /></button>
      <button className="iconbtn" onClick={() => nutritionSettingsSheet()} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    <div className="nx-day">
      <button className="iconbtn" onClick={() => setD(addDays(d, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <div className="nx-day-mid">
        <div className="nx-day-t">{d === today ? t('Today') : d === addDays(today, -1) ? t('Yesterday') : fmtDate(d, true)}</div>
        <button className={'nx-kind ' + kind} onClick={toggleKind}>{kind === 'train' ? t('Training day') : t('Rest day')}</button>
      </div>
      <button className="iconbtn" onClick={() => setD(addDays(d, 1))} disabled={d >= today} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
    </div>

    <div className="card">
      <div className="nx-sum">
        <KcalRing value={all.kcal} range={target?.kcal} />
        <div className="nx-bars">
          <MacroBar label={t('Protein')} value={all.p} range={target?.p} color={MACRO_COLOR.p} />
          <MacroBar label={carbLabel(S)} value={carbsShown(S, all)} range={target?.c} color={MACRO_COLOR.c} />
          <MacroBar label={t('Fat')} value={all.f} range={target?.f} color={MACRO_COLOR.f} />
        </div>
      </div>
      <div className="nx-extra">
        <span>{t('Calories')} <b>{fmt(all.kcal)}</b>{target?.kcal && (target.kcal[0] || target.kcal[1]) ? ' / ' + rangeText(target.kcal) : ''}</span>
        {all.fib > 0 && <span>{t('Fibre')} <b>{fmt(all.fib, 1)} g</b></span>}
        {S.nutriNetCarbs && all.c > 0 && <span>{t('Total carbs')} <b>{fmt(all.c, 1)} g</b></span>}
      </div>
      {!target && <div style={{ marginTop: 12 }}><Button size="sm" variant="tinted" icon="target" onClick={() => targetsSheet()}>{t('Set your targets')}</Button></div>}
    </div>

    {meals.map(m => <div className="card nx-meal" key={m.meal}>
      <div className="nx-meal-h">
        <h3>{t(m.meal)}</h3>
        <span className="nx-meal-k">{m.items.length ? <>{fmt(m.totals.kcal)} kcal · P {fmt(m.totals.p)}</> : ''}</span>
      </div>
      {m.items.map(x => <button key={x.id} className="nx-item" onClick={() => portionSheet({ item: x })}>
        <span className="nx-item-m">
          <div className="nx-item-t">{x.name}{x.brand ? <span className="dim"> · {x.brand}</span> : null}</div>
          <div className="nx-item-s">{x.g ? fmt(x.g) + ' g · ' : ''}<ItemMacros x={x} S={S} /></div>
        </span>
        <span className="nx-item-k">{fmt(x.kcal)}</span>
      </button>)}
      <div className="nx-meal-a">
        <Button size="sm" variant="tinted" icon="plus" onClick={() => addFoodSheet({ d, meal: m.meal })}>{t('Add food')}</Button>
        {m.items.length > 0 && <Button size="sm" variant="ghost" icon="star" onClick={() => saveMealSheet(m)}>{t('Save as meal')}</Button>}
      </div>
    </div>)}

    <div className="row" style={{ gap: 8, margin: '4px 0 14px', flexWrap: 'wrap' }}>
      <Button size="sm" variant="ghost" icon="copy" onClick={copyYesterday}>{t('Copy the day before')}</Button>
      <Button size="sm" variant="ghost" icon="list" onClick={() => mealsSheet({ d })}>{t('Saved meals')}</Button>
    </div>

    <div className="card">
      <CardHead icon="chart" tint="var(--teal)" eyebrow={t('Last 7 days')} title={avg ? t('{0} kcal a day', fmt(avg.kcal)) : t('Nothing logged yet')}
        sub={avg ? `P ${fmt(avg.p)} · ${S.nutriNetCarbs ? 'NC' : 'C'} ${fmt(S.nutriNetCarbs ? Math.max(0, avg.c - avg.fib) : avg.c)} · F ${fmt(avg.f)} · ${t('{0} days logged', avg.days)}` : null} />
      <WeekBars S={S} rows={week} sel={d} onPick={setD} />
    </div>
  </div>
}

function WeekBars({ S, rows, sel, onPick }) {
  const max = Math.max(1, ...rows.map(r => r.kcal), ...rows.map(r => targetFor(S, r.d)?.kcal?.[1] || targetFor(S, r.d)?.kcal?.[0] || 0))
  return <div className="nx-week">
    {rows.map(r => {
      const tg = targetFor(S, r.d)?.kcal
      const st = against(r.kcal, tg || [null, null]).state
      return <button key={r.d} className={'nx-wk' + (r.d === sel ? ' sel' : '')} onClick={() => onPick(r.d)}>
        <div className={'col' + (r.logged ? (st === 'over' ? ' over' : ' on') : '')} style={{ height: Math.max(3, (r.kcal / max) * 70) }} />
        <span>{t(DAYS[weekdayOf(r.d)])}</span>
      </button>
    })}
  </div>
}

/* ================================================================ sheets == */

/** Search and pick a food for `meal` on `d`: recent, saved, built-in, online and by barcode. */
export function addFoodSheet({ d, meal }) {
  ui().openSheet(close => <AddFood d={d} meal={meal} close={close} />)
}

function AddFood({ d, meal, close }) {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('find')
  const [online, setOnline] = useState(null)       // null: not asked; [] results
  const [busy, setBusy] = useState(false)
  const reqId = useRef(0)
  useEffect(() => { setOnline(null) }, [q])

  const recent = recentFoods(S, 15).map(x => ({ key: 'r' + x.id, name: x.name, brand: x.brand, per: perOfItem(x), serving: x.g, src: 'recent', foodId: x.foodId }))
  const saved = savedFoods(S).map(f => ({ key: 's' + f.id, ...f, foodId: f.id, src: 'mine' }))
  const builtin = BUILTIN_FOODS.map(f => ({ key: f.id, ...f }))
  const list = q.trim()
    ? [...saved, ...recent, ...builtin].filter(f => f.per && matches(q, f.name, f.brand)).slice(0, 40)
    : [...recent, ...saved.slice(0, 10)].filter(f => f.per)
  const seen = new Set()
  const shown = list.filter(f => { const k = (f.name + '|' + (f.brand || '')).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })

  const searchOnline = async () => {
    if (q.trim().length < 2) { toast(t('Type at least two letters.')); return }
    const id = ++reqId.current
    setBusy(true)
    try {
      const r = await api('/api/food/search?q=' + encodeURIComponent(q.trim()), { timeout: 20000 })
      if (id === reqId.current) setOnline((r?.foods || []).map((f, i) => ({ key: 'o' + i, ...f })))
    } catch (e) {
      toast(e?.status === 401 ? t('Sign in to search online.') : t('The food search is not reachable right now.'))
    } finally { if (id === reqId.current) setBusy(false) }
  }

  const byCode = async code => {
    setBusy(true)
    try {
      const own = savedFoods(S).find(f => f.code && f.code === code)
      if (own) { pick({ ...own, foodId: own.id }); return }
      const r = await api('/api/food/product?code=' + encodeURIComponent(code), { timeout: 20000 })
      if (r?.food) pick(r.food)
      else { toast(t('Not found. Add it by hand and it will be saved with this barcode.')); quickAddSheet({ d, meal, code, onDone: close }) }
    } catch (e) {
      toast(t('The food search is not reachable right now.'))
    } finally { setBusy(false) }
  }

  const scan = async () => {
    const take = c => { const v = String(c?.value || '').replace(/\D/g, ''); if (v) byCode(v); else toast(t('That is not a product barcode.')) }
    if (await webScanner()) {
      ui().openSheet(closeCam => <CameraScan onCancel={closeCam} onFound={code => { closeCam(); take(code) }} />)
      return
    }
    try { const code = await scanCode(); if (code) take(code) } catch { toast(t('The camera could not be opened.')) }
  }

  const pick = food => portionSheet({ food, d, meal, onDone: close })

  return <>
    <h3>{t('Add to {0}', t(meal))}</h3>
    <Segmented value={tab} onChange={setTab} options={[{ value: 'find', label: t('Foods') }, { value: 'meals', label: t('Saved meals') }]} />
    {tab === 'meals' ? <MealsList S={S} d={d} meal={meal} onDone={close} /> : <>
      <div style={{ height: 10 }} />
      <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search foods')}
        onKeyDown={e => { if (e.key === 'Enter') searchOnline() }} />
      <div className="nx-tools">
        <Button size="sm" variant="tinted" icon="qr" onClick={scan} disabled={busy}>{t('Scan')}</Button>
        <Button size="sm" variant="tinted" icon="globe" onClick={searchOnline} disabled={busy || q.trim().length < 2}>{busy ? t('Searching…') : t('Online')}</Button>
        <Button size="sm" variant="tinted" icon="pencil" onClick={() => quickAddSheet({ d, meal, name: q, onDone: close })}>{t('By hand')}</Button>
      </div>
      <div className="nx-results">
        {online && online.length === 0 && <div className="empty small" style={{ padding: 16 }}>{t('Nothing found online. Try fewer words, or add it by hand.')}</div>}
        {(online || []).map(f => <FoodRow key={f.key} f={f} onPick={() => pick(f)} />)}
        {shown.map(f => <FoodRow key={f.key} f={f} onPick={() => pick(f)} />)}
        {!shown.length && !online && <div className="empty small" style={{ padding: 16 }}>
          {q.trim() ? t('No match in your foods. Search online, scan the barcode, or add it by hand.') : t('Search, scan a barcode, or add a food by hand. Foods you log show up here next time.')}
        </div>}
      </div>
    </>}
  </>
}

const SRC_LABEL = { recent: 'Recent', mine: 'Mine', builtin: 'Basic', off: 'Open Food Facts' }
function FoodRow({ f, onPick }) {
  const p = cleanPer(f.per)
  return <button className="nx-res" onClick={onPick}>
    <span className="nx-res-m">
      <div className="nx-res-t">{f.name}{f.brand ? <span className="dim"> · {f.brand}</span> : null}</div>
      <div className="nx-res-s">{t('per 100 g')}: {fmt(p.kcal)} kcal · P {fmt(p.p, 1)} · C {fmt(p.c, 1)} · F {fmt(p.f, 1)}</div>
    </span>
    <span className="nx-src">{t(SRC_LABEL[f.src] || '')}</span>
  </button>
}

/**
 * How much of a food, and into which meal. With `item` it edits a logged entry instead (and can
 * delete it); with `food` it adds one.
 */
export function portionSheet(opts) {
  ui().openSheet(close => <Portion {...opts} close={close} />)
}

function Portion({ food, item, d, meal, onDone, close }) {
  const S = useStore(s => s.S)
  const per = item ? (perOfItem(item) || null) : cleanPer(food?.per)
  const [g, setG] = useState(item?.g ?? food?.serving ?? 100)
  const [m, setM] = useState(item?.meal || meal || mealsOf(S)[0])
  const [save, setSave] = useState(false)
  const fixed = item && !per        // an entry logged without grams: its numbers stand as they are
  const val = fixed ? { kcal: item.kcal, p: item.p, c: item.c, f: item.f, fib: item.fib } : portion(per, g)
  const name = item?.name || food?.name
  const brand = item?.brand || food?.brand
  const canSave = !item && food && food.src !== 'mine' && !food.foodId

  const commit = () => {
    if (!fixed && !(g > 0)) { toast(t('Enter how many grams.')); return }
    update(s => {
      let foodId = item?.foodId || food?.foodId || null
      if (save && canSave) {
        foodId = rid()
        s.foods = withRecord(s.foods, foodId, { name, brand, code: food.code, per, serving: food.serving, src: food.src || 'own' })
      }
      const rec = { d: item?.d || d, meal: m, name, ...(brand ? { brand } : {}), ...(fixed ? {} : { g: round(g, 1) }), ...val, ...(foodId ? { foodId } : {}), at: item?.at || Date.now() }
      if (!rec.fib) delete rec.fib
      s.foodLog = withRecord(s.foodLog, item?.id || rid(), rec)
    })
    close(); onDone && onDone()
    toast(item ? t('Saved') : t('Added to {0}', t(m)))
  }
  const remove = () => confirmSheet({
    title: t('Remove {0}?', name), confirmText: t('Remove'), danger: true,
    onConfirm: () => { update(s => { s.foodLog = withoutRecord(s.foodLog, item.id) }); close(); toast(t('Removed')) },
  })

  const quick = [food?.serving && food.serving !== 100 ? { g: food.serving, label: food.servingLabel || fmt(food.serving) + ' g' } : null, { g: 100, label: '100 g' }, { g: 50, label: '50 g' }, { g: 200, label: '200 g' }].filter(Boolean)
  return <>
    <h3 style={{ marginBottom: 2 }}>{name}</h3>
    {brand && <div className="muted small">{brand}</div>}
    {!fixed && <>
      <div className="nx-grid">
        <label>{t('Amount (g or ml)')}<NumberField value={g} onChange={v => setG(v)} /></label>
        <label>{t('Meal')}<MealPick S={S} value={m} onChange={setM} /></label>
      </div>
      <div className="nx-chips">{quick.map(x => <button key={x.label} className={'chip' + (g === x.g ? ' on' : '')} onClick={() => setG(x.g)}>{x.label}</button>)}</div>
    </>}
    <div className="nx-preview">
      <div><b>{fmt(val.kcal)}</b><span>kcal</span></div>
      <div><b>{fmt(val.p, 1)}</b><span>{t('Protein')}</span></div>
      <div><b>{fmt(carbsShown(S, val), 1)}</b><span>{carbLabel(S)}</span></div>
      <div><b>{fmt(val.f, 1)}</b><span>{t('Fat')}</span></div>
    </div>
    {canSave && <Row icon="star" iconTint="var(--yellow)" title={t('Save to my foods')}><Switch checked={save} onChange={setSave} /></Row>}
    <div style={{ height: 10 }} />
    <Button variant="primary" onClick={commit}>{item ? t('Save') : t('Add')}</Button>
    {item && <><div style={{ height: 8 }} /><Button variant="ghost" className="danger" icon="trash" onClick={remove}>{t('Remove')}</Button></>}
  </>
}

function MealPick({ S, value, onChange }) {
  return <select className="nf" value={value} onChange={e => onChange(e.target.value)} style={{ height: 40, borderRadius: 10, padding: '0 10px', background: 'var(--surface-2)', color: 'var(--label)', border: 0, font: 'inherit' }}>
    {mealsOf(S).map(m => <option key={m} value={m}>{t(m)}</option>)}
  </select>
}

/** Numbers typed straight in: a label, a food without a barcode, a restaurant guess. */
export function quickAddSheet(opts) {
  ui().openSheet(close => <QuickAdd {...opts} close={close} />)
}

function QuickAdd({ d, meal, name: name0 = '', code, onDone, close }) {
  const S = useStore(s => s.S)
  const [name, setName] = useState(name0)
  const [mode, setMode] = useState(code ? 'per' : 'total')
  const [v, setV] = useState({ kcal: null, p: null, c: null, f: null, fib: null })
  const [g, setG] = useState(code ? 100 : null)
  const [m, setM] = useState(meal || mealsOf(S)[0])
  const [save, setSave] = useState(!!code)
  const set = k => x => setV(o => ({ ...o, [k]: x }))
  const kcal = v.kcal ?? Math.round(4 * (v.p || 0) + 4 * (v.c || 0) + 9 * (v.f || 0))

  const commit = () => {
    const clean = name.trim()
    if (!clean) { toast(t('Give it a name.')); return }
    if (mode === 'per' && !(g > 0)) { toast(t('Enter how many grams you had.')); return }
    const base = { kcal, p: v.p || 0, c: v.c || 0, f: v.f || 0, ...(v.fib ? { fib: v.fib } : {}) }
    const per = mode === 'per' ? cleanPer(base) : (g > 0 ? cleanPer(Object.fromEntries(Object.entries(base).map(([k, x]) => [k, x * 100 / g]))) : null)
    const val = mode === 'per' ? portion(per, g) : { kcal: Math.round(kcal), p: round(base.p), c: round(base.c), f: round(base.f), ...(base.fib ? { fib: round(base.fib) } : {}) }
    update(s => {
      let foodId = null
      if (save && per) { foodId = rid(); s.foods = withRecord(s.foods, foodId, { name: clean, ...(code ? { code } : {}), per, ...(g > 0 ? { serving: g } : {}), src: 'own' }) }
      s.foodLog = withRecord(s.foodLog, rid(), { d, meal: m, name: clean, ...(g > 0 ? { g: round(g, 1) } : {}), ...val, ...(foodId ? { foodId } : {}), at: Date.now() })
    })
    close(); onDone && onDone()
    toast(t('Added to {0}', t(m)))
  }

  return <>
    <h3>{t('Add by hand')}</h3>
    <label className="nx-field">{t('Name')}<TextField value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder={t('e.g. Steak, rump')} /></label>
    <div style={{ height: 10 }} />
    <Segmented value={mode} onChange={setMode} options={[{ value: 'total', label: t('What I ate') }, { value: 'per', label: t('Per 100 g') }]} />
    <div className="nx-grid">
      <label>{t('Protein (g)')}<NumberField nullable value={v.p} onChange={set('p')} /></label>
      <label>{t('Carbs (g)')}<NumberField nullable value={v.c} onChange={set('c')} /></label>
      <label>{t('Fat (g)')}<NumberField nullable value={v.f} onChange={set('f')} /></label>
      <label>{t('Fibre (g)')}<NumberField nullable value={v.fib} onChange={set('fib')} /></label>
      <label>{t('Calories (empty: worked out)')}<NumberField nullable decimal={false} value={v.kcal} onChange={set('kcal')} placeholder={String(kcal)} /></label>
      <label>{mode === 'per' ? t('Amount eaten (g)') : t('Weight (g, optional)')}<NumberField nullable value={g} onChange={setG} /></label>
      <label>{t('Meal')}<MealPick S={S} value={m} onChange={setM} /></label>
    </div>
    {(mode === 'per' || g > 0) && <Row icon="star" iconTint="var(--yellow)" title={t('Save to my foods')} subtitle={code ? t('With barcode {0}', code) : null}><Switch checked={save} onChange={setSave} /></Row>}
    <div style={{ height: 10 }} />
    <Button variant="primary" onClick={commit}>{t('Add')}</Button>
  </>
}

/* ----------------------------------------------------------- saved meals -- */

function saveMealSheet(m) {
  ui().openSheet(close => <SaveMeal m={m} close={close} />)
}
function SaveMeal({ m, close }) {
  const [name, setName] = useState(m.meal)
  const commit = () => {
    const clean = name.trim()
    if (!clean) { toast(t('Give it a name.')); return }
    const items = m.items.map(({ id, _ts, d, meal, at, ...x }) => x)
    update(s => { s.mealTemplates = withRecord(s.mealTemplates, rid(), { name: clean, items }) })
    close(); toast(t('Saved as {0}', clean))
  }
  return <>
    <h3>{t('Save as meal')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Log these {0} items again in one tap.', m.items.length)}</div>
    <TextField value={name} maxLength={60} onChange={e => setName(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={commit}>{t('Save')}</Button>
  </>
}

export function mealsSheet({ d }) {
  ui().openSheet(close => <><h3>{t('Saved meals')}</h3><MealsList d={d} onDone={close} live /></>)
}

function MealsList({ S: S0, d, meal, onDone, live: liveS }) {
  const Sl = useStore(s => s.S)
  const S = liveS ? Sl : S0 || Sl
  const list = savedMeals(S)
  const log = tpl => {
    const into = meal || mealsOf(S)[0]
    update(s => { let mm = s.foodLog; for (const x of tpl.items || []) mm = withRecord(mm, rid(), { ...x, d, meal: meal || tpl.meal || into, at: Date.now() }); s.foodLog = mm })
    onDone && onDone(); toast(t('{0} logged', tpl.name))
  }
  const remove = tpl => confirmSheet({
    title: t('Delete {0}?', tpl.name), confirmText: t('Delete'), danger: true,
    onConfirm: () => update(s => { s.mealTemplates = withoutRecord(s.mealTemplates, tpl.id) }),
  })
  if (!list.length) return <div className="empty small" style={{ padding: 20 }}>{t('No saved meals yet. Log a meal, then tap Save as meal under it.')}</div>
  return <div className="nx-results">
    {list.map(tpl => {
      const tt = totals(tpl.items)
      return <div key={tpl.id} className="nx-res" style={{ cursor: 'default' }}>
        <span className="nx-res-m">
          <div className="nx-res-t">{tpl.name}</div>
          <div className="nx-res-s">{(tpl.items || []).length} · {fmt(tt.kcal)} kcal · P {fmt(tt.p)} · C {fmt(carbsShown(S, tt))} · F {fmt(tt.f)}</div>
        </span>
        <button className="iconbtn" onClick={() => remove(tpl)} aria-label={t('Delete')} style={{ color: 'var(--red)' }}><Icon name="trash" /></button>
        <Button size="sm" variant="tinted" icon="plus" onClick={() => log(tpl)}>{t('Log')}</Button>
      </div>
    })}
  </div>
}

/* --------------------------------------------------------------- targets -- */

export function targetsSheet() {
  ui().openSheet(close => <Targets close={close} />)
}

const emptyT = () => ({ kcal: [null, null], p: [null, null], c: [null, null], f: [null, null] })
function Targets({ close }) {
  const S = useStore(s => s.S)
  const [kind, setKind] = useState(dayKind(S, todayISO()))
  const load = k => cleanTarget(isMap(S.nutriTargets) ? S.nutriTargets[k] : null) || emptyT()
  const [vals, setVals] = useState(() => ({ train: load('train'), rest: load('rest') }))
  const cur = vals[kind]
  const set = (k, i) => x => setVals(o => { const r = [...o[kind][k]]; r[i] = x > 0 ? x : null; return { ...o, [kind]: { ...o[kind], [k]: r } } })
  const implied = Math.round(4 * mid(cur.p) + 4 * mid(cur.c) + 9 * mid(cur.f))

  const commit = () => {
    update(s => {
      let m = s.nutriTargets
      for (const k of ['train', 'rest']) {
        const v = vals[k]
        const any = Object.values(v).some(r => r[0] != null || r[1] != null)
        m = any ? withRecord(m, k, v) : withoutRecord(m, k)
      }
      s.nutriTargets = m
    })
    close(); toast(t('Targets saved'))
  }
  const copyOther = () => setVals(o => ({ ...o, [kind]: JSON.parse(JSON.stringify(o[kind === 'train' ? 'rest' : 'train'])) }))

  // A plain function, not a component: a component defined in here would be a new type on every
  // render and remount its fields, dropping the keyboard after each digit.
  const pair = (k, label, unit) => <div key={k} className="nx-grid" style={{ margin: '6px 0' }}>
    <label>{label} · {t('from')} ({unit})<NumberField nullable decimal={false} value={cur[k][0]} onChange={set(k, 0)} /></label>
    <label>{t('up to')} ({unit})<NumberField nullable decimal={false} value={cur[k][1]} onChange={set(k, 1)} /></label>
  </div>
  return <>
    <h3>{t('Daily targets')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('A range for each macro. Leave "from" empty for a ceiling (carbs up to 25 g), or put the same number in both.')}</div>
    <Segmented value={kind} onChange={setKind} options={[{ value: 'train', label: t('Training days') }, { value: 'rest', label: t('Rest days') }]} />
    {pair('p', t('Protein'), 'g')}
    {pair('c', carbLabel(S), 'g')}
    {pair('f', t('Fat'), 'g')}
    {pair('kcal', t('Calories'), 'kcal')}
    {implied > 0 && <div className="muted small">{t('Your macros come to about {0} kcal.', implied)}</div>}
    <div style={{ height: 8 }} />
    <Button size="sm" variant="ghost" icon="copy" onClick={copyOther}>{kind === 'train' ? t('Same as rest days') : t('Same as training days')}</Button>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={commit}>{t('Save')}</Button>
  </>
}
const mid = ([lo, hi]) => (lo != null && hi != null ? (lo + hi) / 2 : hi ?? lo ?? 0)

/* -------------------------------------------------------------- settings -- */

export function nutritionSettingsSheet() {
  ui().openSheet(close => <NutritionSettings close={close} />)
}
function NutritionSettings({ close }) {
  const S = useStore(s => s.S)
  const [meals, setMeals] = useState(mealsOf(S).join(', '))
  const saveMeals = () => {
    const list = meals.split(',').map(x => x.trim()).filter(Boolean).slice(0, 8)
    update(s => { s.nutriMeals = list.length && list.join('|') !== DEFAULT_MEALS.join('|') ? list : null })
    toast(t('Saved'))
  }
  const foods = savedFoods(S)
  return <>
    <h3>{t('Nutrition settings')}</h3>
    <Row icon="fork" iconTint="var(--green)" title={t('Count net carbs')} subtitle={t('Carbs minus fibre, the way keto counts them.')}>
      <Switch checked={!!S.nutriNetCarbs} onChange={v => update(s => { s.nutriNetCarbs = v })} />
    </Row>
    <div style={{ height: 12 }} />
    <label className="nx-field">{t('Meals, in order, separated by commas')}
      <TextField value={meals} onChange={e => setMeals(e.target.value)} onBlur={saveMeals} />
    </label>
    <div className="muted small" style={{ margin: '6px 2px 14px' }}>{t('Renaming a meal leaves what you already logged under its old name.')}</div>
    <h4 className="sec">{t('My foods')} ({foods.length})</h4>
    {foods.length ? <div className="nx-results" style={{ maxHeight: '34vh' }}>{foods.map(f => <div key={f.id} className="nx-res" style={{ cursor: 'default' }}>
      <span className="nx-res-m"><div className="nx-res-t">{f.name}{f.brand ? <span className="dim"> · {f.brand}</span> : null}</div>
        <div className="nx-res-s">{t('per 100 g')}: {fmt(f.per?.kcal)} kcal · P {fmt(f.per?.p, 1)} · C {fmt(f.per?.c, 1)} · F {fmt(f.per?.f, 1)}</div></span>
      <button className="iconbtn" style={{ color: 'var(--red)' }} aria-label={t('Delete')}
        onClick={() => confirmSheet({ title: t('Delete {0}?', f.name), message: t('Days you already logged keep their numbers.'), confirmText: t('Delete'), danger: true, onConfirm: () => update(s => { s.foods = withoutRecord(s.foods, f.id) }) })}><Icon name="trash" /></button>
    </div>)}</div> : <div className="muted small">{t('Foods you save while logging show up here.')}</div>}
    <div style={{ height: 14 }} />
    <ExtrasImportButton />
    <div style={{ height: 10 }} />
    <Button variant="primary" onClick={() => { saveMeals(); close() }}>{t('Done')}</Button>
  </>
}

/* ============================================================== home card == */

export function NutritionHomeCard({ S, onOpen }) {
  const d = todayISO()
  const all = totals(mealsOn(S, d).flatMap(m => m.items))
  const tg = targetFor(S, d)
  const a = against(all.kcal, tg?.kcal || [null, null])
  const title = tg?.kcal && a.goal != null
    ? (a.state === 'over' ? t('{0} kcal over', fmt(-a.left)) : t('{0} kcal left', fmt(a.left)))
    : t('{0} kcal today', fmt(all.kcal))
  const cell = (label, v, r, color) => {
    const x = against(v, r || [null, null])
    return <div><span>{label}</span><b>{fmt(v)}</b><small>{x.goal != null ? '/ ' + rangeText([x.lo, x.hi]) : '\u00a0'}</small>
      <div className="nx-track" style={{ height: 5, '--c': color }}><div className="nx-fill" style={{ width: Math.min(100, x.pct * 100) + '%', background: x.state === 'over' ? 'var(--orange)' : color }} /></div></div>
  }
  return <div className="card tap-host nx-home">
    <CardHead icon="fork" tint="var(--green)" eyebrow={dayKind(S, d) === 'train' ? t('Nutrition · training day') : t('Nutrition · rest day')} title={title}
      open={{ onClick: onOpen }} action={<Button size="sm" icon="plus" onClick={() => addFoodSheet({ d, meal: nextMeal(S) })}>{t('Log')}</Button>} />
    <div className="nx-mini">
      {cell('kcal', all.kcal, tg?.kcal, MACRO_COLOR.kcal)}
      {cell(t('Protein'), all.p, tg?.p, MACRO_COLOR.p)}
      {cell(S.nutriNetCarbs ? t('Net carbs') : t('Carbs'), carbsShown(S, all), tg?.c, MACRO_COLOR.c)}
      {cell(t('Fat'), all.f, tg?.f, MACRO_COLOR.f)}
    </div>
  </div>
}

/** The meal the clock suggests: the first one before 11:00, the second before 15:00, and so on. */
function nextMeal(S) {
  const meals = mealsOf(S)
  const h = new Date().getHours()
  const i = h < 11 ? 0 : h < 15 ? 1 : h < 21 ? 2 : 3
  return meals[Math.min(i, meals.length - 1)]
}
