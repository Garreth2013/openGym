// Protocol (fork addition): compounds and the doses actually taken, injection-site rotation,
// blood work and blood pressure. Data and rules live in lib/protocol.js; this file is only the
// screens and sheets. It records and schedules what you enter. It never suggests a dose.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, todayISO } from '../lib/format.js'
import {
  KINDS, KIND, ROUTES, UNITS, UNIT_LABEL, SITES, cleanSched, schedText, isActive, dueList, nextDue,
  weeklyAmount, drawFor, nextSite, adherence, items as allItems, logList, phasesOf,
  markerDefs, markerDef, flagOf, rangeOf, panels, markerSeries, latestValues, MARKER_GROUPS,
  bpList, bpBand, bpAverage,
} from '../lib/protocol.js'
import { withRecord, withoutRecord, rid, addDays, getLive, round, isMap } from '../lib/stamped.js'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import DateField from '../components/DateField.jsx'
import LineChart from '../components/LineChart.jsx'
import { Button, NumberField, TextField, TextArea, Segmented, Switch, Row, SelectRow } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import ExtrasImportButton from '../components/ExtrasImport.jsx'
import '../extras.css'

const update = fn => useStore.getState().update(fn)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const num = (x, dp = 2) => (x == null || x === '' ? '–' : String(round(x, dp)))
const doseText = (dose, unit) => (dose ? `${num(dose)} ${UNIT_LABEL[unit] || unit || ''}`.trim() : '')
const timeOf = at => (at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
const kindTint = k => ({ injectable: 'var(--purple)', peptide: 'var(--teal)', oral: 'var(--orange)', ancillary: 'var(--blue)', supplement: 'var(--green)' }[k] || 'var(--grey)')

function ItemIcon({ item }) {
  return <span className="px-ico" style={{ '--t': kindTint(item?.kind) }}><Icon name={KIND[item?.kind]?.icon || 'pill'} /></span>
}

/* ================================================================ screen == */

export default function Protocol() {
  const nav = useNavigate()
  const [tab, setTab] = useState('today')
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Protocol')}</h1><div className="sub">{t('Compounds, blood work, blood pressure')}</div></div>
    </div>
    <div className="px-tabs">
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'today', label: t('Today') }, { value: 'items', label: t('Compounds') },
        { value: 'blood', label: t('Blood work') }, { value: 'bp', label: t('BP') },
      ]} />
    </div>
    {tab === 'today' && <TodayTab />}
    {tab === 'items' && <ItemsTab />}
    {tab === 'blood' && <BloodTab />}
    {tab === 'bp' && <BpTab />}
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}><ExtrasImportButton /></div>
    <div className="px-note">{t('A personal log. It schedules and counts what you enter and flags results against the ranges you set. Talk to your doctor about your results.')}</div>
  </div>
}

/* ----------------------------------------------------------------- today -- */

function TodayTab() {
  const S = useStore(s => s.S)
  const [d, setD] = useState(todayISO())
  const today = todayISO()
  const due = dueList(S, d)
  const active = allItems(S).filter(i => isActive(i, d))
  const notDue = active.filter(i => !due.some(x => x.item.id === i.id))
  const recent = logList(S).slice(0, 8)
  const from14 = addDays(today, -13)

  return <>
    <div className="nx-day">
      <button className="iconbtn" onClick={() => setD(addDays(d, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <div className="nx-day-mid"><div className="nx-day-t">{d === today ? t('Today') : fmtDate(d, true)}</div></div>
      <button className="iconbtn" onClick={() => setD(addDays(d, 1))} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
    </div>

    <div className="card">
      <CardHead icon="syringe" tint="var(--purple)" eyebrow={d === today ? t('Due today') : t('Due')} title={due.length ? t('{0} of {1} done', due.filter(x => x.taken.length).length, due.length) : t('Nothing due')} />
      {due.map(({ item, taken }) => <DueRow key={item.id} S={S} item={item} taken={taken} d={d} />)}
      {!due.length && !active.length && <div className="muted small" style={{ marginTop: 8 }}>{t('Add your compounds and their schedule, and each day shows what is due.')}</div>}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {!active.length && <Button size="sm" variant="tinted" icon="plus" onClick={() => itemSheet()}>{t('Add a compound')}</Button>}
        {active.length > 0 && <Button size="sm" variant="ghost" icon="plus" onClick={() => pickItemSheet(d)}>{t('Log another dose')}</Button>}
      </div>
    </div>

    {notDue.length > 0 && <div className="card">
      <CardHead icon="calendar" tint="var(--grey)" eyebrow={t('Running')} title={t('Not due today')} />
      {notDue.map(i => {
        const nx = nextDue(i, d)
        return <div key={i.id} className="px-due">
          <ItemIcon item={i} />
          <div className="px-due-m"><div className="px-due-t">{i.name}</div>
            <div className="px-due-s">{[doseText(i.dose, i.unit), schedText(i.sched, t), nx ? t('next {0}', fmtDate(nx, true)) : null].filter(Boolean).join(' · ')}</div></div>
        </div>
      })}
    </div>}

    {active.some(i => cleanSched(i.sched).type !== 'prn') && <div className="card">
      <CardHead icon="checkCircle" tint="var(--green)" eyebrow={t('Last 14 days')} title={t('Doses logged')} />
      {active.filter(i => cleanSched(i.sched).type !== 'prn').map(i => {
        const a = adherence(S, i, i.start && i.start > from14 ? i.start : from14, today)
        return <div key={i.id} className="px-due">
          <div className="px-due-m"><div className="px-due-t" style={{ fontWeight: 500 }}>{i.name}</div></div>
          <span className={'px-tag' + (a.due && a.taken >= a.due ? ' on' : '')}>{a.taken} / {a.due}</span>
        </div>
      })}
    </div>}

    {recent.length > 0 && <div className="card">
      <CardHead icon="history" tint="var(--blue)" eyebrow={t('Log')} title={t('Recent doses')} />
      {recent.map(x => <button key={x.id} className="px-mk" onClick={() => logDoseSheet({ entry: x })}>
        <span className="px-mk-m"><div className="px-mk-t">{x.name}</div>
          <div className="px-mk-s">{[fmtDate(x.d, true), timeOf(x.at), x.site].filter(Boolean).join(' · ')}</div></span>
        <span className="px-mk-v"><b>{doseText(x.dose, x.unit)}</b></span>
      </button>)}
    </div>}
  </>
}

function DueRow({ S, item, taken, d }) {
  const draw = drawFor(item)
  const site = item.route === 'im' || item.route === 'subq' ? nextSite(S, item) : null
  const sub = [doseText(item.dose, item.unit), draw ? t('draw {0} ml ({1} units)', num(draw.ml, 3), num(draw.units, 1)) : null, !taken.length && site ? t('site: {0}', t(site)) : null].filter(Boolean).join(' · ')
  return <div className="px-due">
    <ItemIcon item={item} />
    <div className="px-due-m">
      <div className="px-due-t">{item.name}</div>
      <div className="px-due-s">{sub}</div>
      {taken.map(x => <button key={x.id} className="px-done" style={{ border: 0, background: 'none', padding: '4px 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}
        onClick={() => logDoseSheet({ entry: x })}><Icon name="checkCircle" />{[timeOf(x.at), x.site, doseText(x.dose, x.unit)].filter(Boolean).join(' · ')}</button>)}
    </div>
    {!taken.length && <Button size="sm" variant="tinted" icon="check" onClick={() => quickLog(S, item, d, site)}>{t('Done')}</Button>}
  </div>
}

/** One tap: the scheduled dose, now, on the suggested site. Tap the tick afterwards to change it. */
function quickLog(S, item, d, site) {
  const at = d === todayISO() ? Date.now() : Date.parse(d + 'T08:00:00')
  update(s => { s.pedLog = withRecord(s.pedLog, rid(), { d, at, item: item.id, name: item.name, dose: item.dose, unit: item.unit, ...(site ? { site } : {}) }) })
  toast(site ? t('{0} logged · {1}', item.name, t(site)) : t('{0} logged', item.name))
}

function pickItemSheet(d) {
  ui().openSheet(close => {
    const S = useStore.getState().S
    const list = allItems(S).filter(i => isActive(i, d))
    return <>
      <h3>{t('Log a dose')}</h3>
      {list.map(i => <Row key={i.id} icon={KIND[i.kind]?.icon || 'pill'} iconTint={kindTint(i.kind)} title={i.name} subtitle={doseText(i.dose, i.unit)} accessory="chevron"
        onClick={() => { close(); logDoseSheet({ item: i, d }) }} />)}
    </>
  })
}

/** Log or edit one dose. */
export function logDoseSheet(opts) {
  ui().openSheet(close => <LogDose {...opts} close={close} />)
}
function LogDose({ item: item0, entry, d: d0, close }) {
  const S = useStore(s => s.S)
  const item = item0 || getLive(S.pedItems, entry?.item) || { name: entry?.name, unit: entry?.unit, route: null }
  const sites = item.route === 'im' || item.route === 'subq' ? (item.sites?.length ? item.sites : SITES[item.route]) : null
  const [d, setD] = useState(entry?.d || d0 || todayISO())
  const [time, setTime] = useState(() => { const x = entry?.at ? new Date(entry.at) : new Date(); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0') })
  const [dose, setDose] = useState(entry?.dose ?? item.dose ?? null)
  const [site, setSite] = useState(entry?.site || (sites ? nextSite(S, item) : null))
  const [note, setNote] = useState(entry?.note || '')
  const draw = drawFor(item, dose)

  const save = () => {
    const at = Date.parse(d + 'T' + (time || '08:00') + ':00')
    update(s => { s.pedLog = withRecord(s.pedLog, entry?.id || rid(), { d, at: Number.isFinite(at) ? at : Date.now(), item: entry?.item || item.id, name: item.name || entry?.name, dose, unit: item.unit || entry?.unit, ...(site ? { site } : {}), ...(note.trim() ? { note: note.trim().slice(0, 300) } : {}) }) })
    close(); toast(t('Saved'))
  }
  const remove = () => confirmSheet({ title: t('Remove this dose?'), confirmText: t('Remove'), danger: true,
    onConfirm: () => { update(s => { s.pedLog = withoutRecord(s.pedLog, entry.id) }); close() } })

  return <>
    <h3>{item.name}</h3>
    <div className="nx-grid">
      <label>{t('Date')}<DateField compact value={d} max={todayISO()} onChange={setD} label={t('Date')} /></label>
      <label>{t('Time')}<input type="time" className="timef" value={time} onChange={e => setTime(e.target.value)} /></label>
      <label>{t('Dose')} ({UNIT_LABEL[item.unit] || item.unit || ''})<NumberField nullable value={dose} onChange={setDose} /></label>
      {draw && <label>{t('Draw')}<div style={{ padding: '10px 0', color: 'var(--label)' }}>{num(draw.ml, 3)} ml · {num(draw.units, 1)} {t('units')}</div></label>}
    </div>
    {sites && <>
      <div className="muted small">{t('Site')}</div>
      <div className="px-sites">{sites.map(x => <button key={x} className={'chip' + (site === x ? ' on' : '')} onClick={() => setSite(site === x ? null : x)}>{t(x)}</button>)}</div>
    </>}
    <TextArea value={note} rows={2} maxLength={300} placeholder={t('Note (optional)')} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {entry && <><div style={{ height: 8 }} /><Button variant="ghost" className="danger" icon="trash" onClick={remove}>{t('Remove')}</Button></>}
  </>
}

/* ------------------------------------------------------------- compounds -- */

function ItemsTab() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const list = allItems(S)
  const groups = [
    [t('Running'), list.filter(i => isActive(i, today))],
    [t('Coming up'), list.filter(i => i.start && i.start > today)],
    [t('Finished'), list.filter(i => i.end && i.end < today).reverse()],
  ]
  const weekly = list.filter(i => isActive(i, today) && i.kind !== 'supplement' && i.kind !== 'other').map(i => ({ i, w: weeklyAmount(i) })).filter(x => x.w && (x.w.unit === 'mg' || x.w.unit === 'mcg' || x.w.unit === 'iu'))
  return <>
    <Button variant="tinted" icon="plus" onClick={() => itemSheet()}>{t('Add a compound')}</Button>
    {weekly.length > 0 && <div className="card" style={{ marginTop: 12 }}>
      <CardHead icon="chart" tint="var(--purple)" eyebrow={t('Running now')} title={t('Weekly amounts')} />
      {weekly.map(({ i, w }) => <div key={i.id} className="px-due"><div className="px-due-m"><div className="px-due-t" style={{ fontWeight: 500 }}>{i.name}</div></div>
        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{num(w.amount)} {UNIT_LABEL[w.unit]} / {t('week')}</b></div>)}
    </div>}
    {groups.map(([title, xs]) => xs.length > 0 && <div key={title}>
      <div className="px-group-t">{title}</div>
      <div className="card">{xs.map(i => <button key={i.id} className="px-mk" onClick={() => itemSheet(i)}>
        <ItemIcon item={i} />
        <span className="px-mk-m"><div className="px-mk-t">{i.name} {i.phase ? <span className="px-tag">{i.phase}</span> : null}</div>
          <div className="px-mk-s">{[doseText(i.dose, i.unit), schedText(i.sched, t), i.start ? (i.end ? `${fmtDate(i.start, true)} – ${fmtDate(i.end, true)}` : t('from {0}', fmtDate(i.start, true))) : null].filter(Boolean).join(' · ')}</div></span>
        <Icon name="chevronRight" className="chev" />
      </button>)}</div>
    </div>)}
    {!list.length && <div className="empty small">{t('No compounds yet.')}</div>}
  </>
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Add or edit a compound. */
export function itemSheet(item = null) {
  ui().openSheet(close => <ItemForm item={item} close={close} />)
}
function ItemForm({ item, close }) {
  const S = useStore(s => s.S)
  const [f, setF] = useState(() => ({
    name: item?.name || '', kind: item?.kind || 'injectable', route: item?.route || 'im', dose: item?.dose ?? null, unit: item?.unit || 'mg',
    sched: cleanSched(item?.sched || { type: 'days', days: [1, 4] }), start: item?.start || todayISO(), end: item?.end || '',
    conc: item?.conc ?? null, phase: item?.phase || '', notes: item?.notes || '',
  }))
  const set = k => v => setF(o => ({ ...o, [k]: v }))
  const setSched = patch => setF(o => ({ ...o, sched: cleanSched({ ...o.sched, ...patch }) }))
  const phases = phasesOf(S)
  const injected = f.route === 'im' || f.route === 'subq'
  const preview = { ...f, sched: f.sched }
  const w = weeklyAmount(preview), draw = drawFor(preview)

  const save = () => {
    const name = f.name.trim()
    if (!name) { toast(t('Give it a name.')); return }
    if (f.end && f.end < f.start) { toast(t('The end date is before the start.')); return }
    const rec = {
      name: name.slice(0, 80), kind: f.kind, route: f.route, unit: f.unit, sched: cleanSched(f.sched), start: f.start,
      ...(f.dose > 0 ? { dose: f.dose } : {}), ...(f.end ? { end: f.end } : {}), ...(injected && f.conc > 0 ? { conc: f.conc } : {}),
      ...(f.phase.trim() ? { phase: f.phase.trim().slice(0, 40) } : {}), ...(f.notes.trim() ? { notes: f.notes.trim().slice(0, 500) } : {}),
    }
    update(s => { s.pedItems = withRecord(s.pedItems, item?.id || rid(), rec) })
    close(); toast(t('Saved'))
  }
  const endNow = () => { setF(o => ({ ...o, end: todayISO() })) }
  const remove = () => confirmSheet({ title: t('Delete {0}?', item.name), message: t('The doses you logged stay in the log.'), confirmText: t('Delete'), danger: true,
    onConfirm: () => { update(s => { s.pedItems = withoutRecord(s.pedItems, item.id) }); close() } })

  const st = f.sched.type
  return <>
    <h3>{item ? t('Edit compound') : t('Add a compound')}</h3>
    <label className="nx-field">{t('Name')}<TextField value={f.name} maxLength={80} onChange={e => set('name')(e.target.value)} placeholder={t('e.g. Testosterone cypionate 200')} /></label>
    <div style={{ height: 8 }} />
    <SelectRow title={t('Type')} value={f.kind} onChange={v => setF(o => ({ ...o, kind: v, route: KIND[v]?.route || o.route }))} options={KINDS.map(k => ({ value: k.id, label: t(k.label) }))} />
    <SelectRow title={t('Route')} value={f.route} onChange={set('route')} options={ROUTES.map(r => ({ value: r.id, label: t(r.label) }))} />
    <div className="nx-grid">
      <label>{t('Dose each time')}<NumberField nullable value={f.dose} onChange={set('dose')} /></label>
      <label>{t('Unit')}<select className="nf" value={f.unit} onChange={e => set('unit')(e.target.value)} style={selStyle}>{UNITS.map(u => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></label>
      {injected && <label>{f.unit === 'iu' ? t('Strength (IU/ml)') : t('Strength (mg/ml)')}<NumberField nullable value={f.conc} onChange={set('conc')} /></label>}
      {injected && <label>{t('Draw')}<div style={{ padding: '10px 0' }}>{draw ? `${num(draw.ml, 3)} ml · ${num(draw.units, 1)} ${t('units')}` : '–'}</div></label>}
    </div>

    <SelectRow title={t('Schedule')} value={st} onChange={v => setSched({ type: v })} options={[
      { value: 'days', label: t('On set weekdays') }, { value: 'every', label: t('Every few days') },
      { value: 'onoff', label: t('Days on, days off') }, { value: 'prn', label: t('As needed') },
    ]} />
    {st === 'days' && <div className="px-days">{WEEK_ORDER.map(dn => <button key={dn} className={'chip' + (f.sched.days.includes(dn) ? ' on' : '')}
      onClick={() => setSched({ days: f.sched.days.includes(dn) ? f.sched.days.filter(x => x !== dn) : [...f.sched.days, dn] })}>{t(DAY_SHORT[dn])}</button>)}</div>}
    {st === 'every' && <div className="nx-grid"><label>{t('Every … days (1 = daily, 7 = weekly)')}<NumberField decimal={false} value={f.sched.n} onChange={v => setSched({ n: v })} /></label></div>}
    {st === 'onoff' && <div className="nx-grid">
      <label>{t('Days on')}<NumberField decimal={false} value={f.sched.on} onChange={v => setSched({ on: v })} /></label>
      <label>{t('Days off')}<NumberField decimal={false} value={f.sched.off} onChange={v => setSched({ off: v })} /></label>
    </div>}
    <div className="muted small" style={{ margin: '4px 2px 8px' }}>{schedText(f.sched, t)}{w ? ' · ' + t('{0} a week', `${num(w.amount)} ${UNIT_LABEL[w.unit]}`) : ''}</div>

    <div className="nx-grid">
      <label>{t('Start')}<DateField compact value={f.start} onChange={set('start')} label={t('Start')} /></label>
      <label>{t('End (optional)')}<div className="row" style={{ gap: 6 }}>
        <DateField compact value={f.end} onChange={set('end')} label={t('End')} />
        {f.end && <button className="iconbtn" aria-label={t('Clear')} onClick={() => set('end')('')}><Icon name="xmark" /></button>}</div></label>
    </div>
    <label className="nx-field">{t('Phase (optional)')}<TextField value={f.phase} maxLength={40} onChange={e => set('phase')(e.target.value)} placeholder={t('e.g. Blast, Cruise, Peptides')} /></label>
    {phases.length > 0 && <div className="nx-chips">{phases.map(p => <button key={p} className={'chip' + (f.phase === p ? ' on' : '')} onClick={() => set('phase')(p)}>{p}</button>)}</div>}
    <div style={{ height: 8 }} />
    <TextArea value={f.notes} rows={2} maxLength={500} placeholder={t('Notes (optional)')} onChange={e => set('notes')(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {item && !item.end && <><div style={{ height: 8 }} /><Button variant="ghost" icon="flag" onClick={endNow}>{t('End today')}</Button></>}
    {item && <><div style={{ height: 8 }} /><Button variant="ghost" className="danger" icon="trash" onClick={remove}>{t('Delete')}</Button></>}
  </>
}
const selStyle = { height: 40, borderRadius: 10, padding: '0 10px', background: 'var(--surface-2)', color: 'var(--label)', border: 0, font: 'inherit' }

/* ------------------------------------------------------------ blood work -- */

function BloodTab() {
  const S = useStore(s => s.S)
  const latest = latestValues(S)
  const list = panels(S)
  const flagged = latest.filter(x => x.flag === 'high' || x.flag === 'low')
  const groups = MARKER_GROUPS.map(g => [g, latest.filter(x => x.def.group === g)]).filter(([, xs]) => xs.length)
  return <>
    <Button variant="tinted" icon="plus" onClick={() => panelSheet()}>{t('Add results')}</Button>
    {list.length > 0 && <div className="card" style={{ marginTop: 12 }}>
      <CardHead icon="drop" tint="var(--red)" eyebrow={t('Latest of each marker · last panel {0}', fmtDate(list[0].d, true))}
        title={flagged.length ? t('{0} outside range', flagged.length) : t('All within range')} />
      {flagged.map(x => <MarkerRow key={x.def.key} x={x} />)}
    </div>}
    {groups.map(([g, xs]) => <div key={g}>
      <div className="px-group-t">{t(g)}</div>
      <div className="card">{xs.map(x => <MarkerRow key={x.def.key} x={x} />)}</div>
    </div>)}
    {list.length > 0 && <>
      <div className="px-group-t">{t('Panels')}</div>
      <div className="card">{list.map(p => {
        const n = Object.values(p.vals || {}).filter(v => Number.isFinite(Number(v))).length
        return <button key={p.id} className="px-mk" onClick={() => panelSheet(p)}>
          <span className="px-mk-m"><div className="px-mk-t">{fmtDate(p.d, true)}</div><div className="px-mk-s">{[p.lab, t('{0} markers', n)].filter(Boolean).join(' · ')}</div></span>
          <Icon name="chevronRight" className="chev" />
        </button>
      })}</div>
    </>}
    {!list.length && <div className="empty small">{t('No blood work yet. Add a panel from your lab report.')}</div>}
  </>
}

function MarkerRow({ x }) {
  const delta = x.prev != null ? round(x.v - x.prev, 2) : null
  return <button className="px-mk" onClick={() => markerSheet(x.def.key)}>
    <span className="px-mk-m"><div className="px-mk-t">{x.def.name} {x.flag === 'high' || x.flag === 'low' ? <span className={'px-flag ' + x.flag}>{x.flag === 'high' ? 'H' : 'L'}</span> : null}</div>
      <div className="px-mk-s">{[rangeOf(x.def) && t('range {0}', rangeOf(x.def)), fmtDate(x.d, true)].filter(Boolean).join(' · ')}</div></span>
    <span className="px-mk-v"><b>{num(x.v)}</b> <span>{x.def.unit}{delta ? ` · ${delta > 0 ? '+' : ''}${delta}` : ''}</span></span>
  </button>
}

function markerSheet(key) {
  ui().openSheet(close => <MarkerDetail mkey={key} close={close} />)
}
function MarkerDetail({ mkey, close }) {
  const S = useStore(s => s.S)
  const def = markerDef(S, mkey)
  const series = markerSeries(S, mkey)
  const [lo, setLo] = useState(def.lo)
  const [hi, setHi] = useState(def.hi)
  const points = series.map(p => ({ t: Date.parse(p.d + 'T12:00:00'), d: p.d, y: p.v }))
  const saveRange = () => {
    update(s => { const cur = isMap(s.markerDefs) ? s.markerDefs[mkey] : null; s.markerDefs = withRecord(s.markerDefs, mkey, { ...(isMap(cur) && !cur.gone ? cur : {}), lo: lo ?? null, hi: hi ?? null, ...(def.custom ? { name: def.name, unit: def.unit } : {}) }) })
    toast(t('Range saved'))
  }
  return <>
    <h3>{def.name}</h3>
    <div className="muted small">{[def.unit, rangeOf(def) && t('range {0}', rangeOf(def))].filter(Boolean).join(' · ')}</div>
    <div className="chart" style={{ marginTop: 10 }}><LineChart points={points} h={170} unit={def.unit} color="var(--red)" /></div>
    <div className="card" style={{ marginTop: 10 }}>{series.slice().reverse().map(p => {
      const fl = flagOf(p.v, def)
      return <div key={p.d} className="px-due"><div className="px-due-m">{fmtDate(p.d, true)}</div>
        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{num(p.v)} {fl === 'high' || fl === 'low' ? <span className={'px-flag ' + fl}>{fl === 'high' ? 'H' : 'L'}</span> : null}</b></div>
    })}</div>
    <h4 className="sec">{t('Reference range')}</h4>
    <div className="muted small">{t('Use the range printed on your own lab report.')}</div>
    <div className="nx-grid">
      <label>{t('Low')}<NumberField nullable value={lo} onChange={setLo} /></label>
      <label>{t('High')}<NumberField nullable value={hi} onChange={setHi} /></label>
    </div>
    <Button onClick={saveRange}>{t('Save range')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}

/** Add or edit one panel of results. */
export function panelSheet(panel = null) {
  ui().openSheet(close => <PanelForm panel={panel} close={close} />)
}
function PanelForm({ panel, close }) {
  const S = useStore(s => s.S)
  const defs = markerDefs(S)
  const used = new Set(Object.keys(panel?.vals || {}))
  for (const x of latestValues(S)) used.add(x.def.key)
  const [d, setD] = useState(panel?.d || todayISO())
  const [lab, setLab] = useState(panel?.lab || '')
  const [vals, setVals] = useState(() => ({ ...(panel?.vals || {}) }))
  const [all, setAll] = useState(!used.size)
  const [note, setNote] = useState(panel?.note || '')
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const shown = defs.filter(m => all || used.has(m.key) || vals[m.key] != null)

  const save = () => {
    const clean = Object.fromEntries(Object.entries(vals).filter(([, v]) => v != null && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]))
    if (!Object.keys(clean).length) { toast(t('Enter at least one result.')); return }
    update(s => { s.bloodwork = withRecord(s.bloodwork, panel?.id || rid(), { d, ...(lab.trim() ? { lab: lab.trim().slice(0, 60) } : {}), vals: clean, ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}) }) })
    close(); toast(t('Results saved'))
  }
  const addMarker = () => {
    const name = newName.trim()
    if (!name) return
    const key = 'u_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)
    update(s => { s.markerDefs = withRecord(s.markerDefs, key, { name: name.slice(0, 60), unit: newUnit.trim().slice(0, 20), lo: null, hi: null }) })
    setVals(o => ({ ...o, [key]: o[key] ?? null })); setNewName(''); setNewUnit(''); setAll(true)
  }
  const remove = () => confirmSheet({ title: t('Delete this panel?'), confirmText: t('Delete'), danger: true,
    onConfirm: () => { update(s => { s.bloodwork = withoutRecord(s.bloodwork, panel.id) }); close() } })

  return <>
    <h3>{panel ? t('Edit results') : t('Add results')}</h3>
    <div className="nx-grid">
      <label>{t('Date of the blood draw')}<DateField compact value={d} max={todayISO()} onChange={setD} label={t('Date')} /></label>
      <label>{t('Lab (optional)')}<TextField value={lab} maxLength={60} onChange={e => setLab(e.target.value)} placeholder="Lancet, Ampath…" /></label>
    </div>
    {used.size > 0 && <Row title={t('Show every marker')}><Switch checked={all} onChange={setAll} /></Row>}
    {MARKER_GROUPS.map(g => {
      const xs = shown.filter(m => m.group === g)
      if (!xs.length) return null
      return <div key={g}><div className="px-group-t">{t(g)}</div>
        {xs.map(m => <div key={m.key} className="px-panel-f">
          <span>{m.name}<small>{[m.unit, rangeOf(m)].filter(Boolean).join(' · ')}</small></span>
          <NumberField nullable value={vals[m.key] ?? null} onChange={v => setVals(o => ({ ...o, [m.key]: v }))} />
        </div>)}
      </div>
    })}
    <div className="px-group-t">{t('A marker of your own')}</div>
    <div className="row" style={{ gap: 8 }}>
      <TextField value={newName} maxLength={60} placeholder={t('Name')} onChange={e => setNewName(e.target.value)} />
      <TextField value={newUnit} maxLength={20} placeholder={t('Unit')} onChange={e => setNewUnit(e.target.value)} style={{ maxWidth: 110 }} />
      <Button icon="plus" onClick={addMarker} disabled={!newName.trim()}>{t('Add')}</Button>
    </div>
    <div style={{ height: 10 }} />
    <TextArea value={note} rows={2} maxLength={500} placeholder={t('Note (optional)')} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {panel && <><div style={{ height: 8 }} /><Button variant="ghost" className="danger" icon="trash" onClick={remove}>{t('Delete')}</Button></>}
  </>
}

/* ---------------------------------------------------------------- blood pressure -- */

function BpTab() {
  const S = useStore(s => s.S)
  const list = bpList(S)
  const avg = bpAverage(S, addDays(todayISO(), -6))
  const band = avg ? bpBand(avg.sys, avg.dia) : null
  const sysPts = useMemo(() => list.slice().reverse().map(x => ({ t: x.at || Date.parse(x.d + 'T12:00:00'), d: x.d, y: x.sys })), [list])
  const diaPts = useMemo(() => list.slice().reverse().map(x => ({ t: x.at || Date.parse(x.d + 'T12:00:00'), d: x.d, y: x.dia })), [list])
  return <>
    <Button variant="tinted" icon="plus" onClick={() => bpSheet()}>{t('Log blood pressure')}</Button>
    {avg && <div className="card" style={{ marginTop: 12 }}>
      <CardHead icon="heart" tint="var(--red)" eyebrow={t('7-day average · {0} readings', avg.n)}
        title={<span className="px-bp"><b>{avg.sys}/{avg.dia}</b> <span className="muted small">mmHg</span></span>}
        sub={band ? <span style={{ color: band.color }}>{t(band.label)}</span> : null} />
      {list.length > 1 && <div className="chart" style={{ marginTop: 8 }}><LineChart points={sysPts} h={150} unit="mmHg" color="var(--red)"
        series={[{ points: sysPts, color: 'var(--red)' }, { points: diaPts, color: 'var(--blue)' }]} /></div>}
    </div>}
    {list.length > 0 && <div className="card" style={{ marginTop: avg ? 0 : 12 }}>{list.slice(0, 30).map(x => {
      const b = bpBand(x.sys, x.dia)
      return <button key={x.id} className="px-mk" onClick={() => bpSheet(x)}>
        <span className="px-mk-m"><div className="px-mk-t">{x.sys}/{x.dia} {x.hr ? <span className="dim">· {x.hr} bpm</span> : null}</div>
          <div className="px-mk-s">{[fmtDate(x.d, true), timeOf(x.at)].filter(Boolean).join(' · ')}</div></span>
        {b && <span className="px-tag" style={{ color: b.color }}>{t(b.label)}</span>}
      </button>
    })}</div>}
    {!list.length && <div className="empty small">{t('No readings yet.')}</div>}
  </>
}

function bpSheet(entry = null) {
  ui().openSheet(close => <BpForm entry={entry} close={close} />)
}
function BpForm({ entry, close }) {
  const [d, setD] = useState(entry?.d || todayISO())
  const [time, setTime] = useState(() => { const x = entry?.at ? new Date(entry.at) : new Date(); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0') })
  const [sys, setSys] = useState(entry?.sys ?? null)
  const [dia, setDia] = useState(entry?.dia ?? null)
  const [hr, setHr] = useState(entry?.hr ?? null)
  const save = () => {
    if (!(sys > 50 && sys < 260 && dia > 30 && dia < 180)) { toast(t('Check the two numbers.')); return }
    const at = Date.parse(d + 'T' + (time || '08:00') + ':00')
    update(s => { s.bpLog = withRecord(s.bpLog, entry?.id || rid(), { d, at: Number.isFinite(at) ? at : Date.now(), sys: Math.round(sys), dia: Math.round(dia), ...(hr > 0 ? { hr: Math.round(hr) } : {}) }) })
    close(); toast(t('Saved'))
  }
  const remove = () => confirmSheet({ title: t('Remove this reading?'), confirmText: t('Remove'), danger: true,
    onConfirm: () => { update(s => { s.bpLog = withoutRecord(s.bpLog, entry.id) }); close() } })
  const b = bpBand(sys, dia)
  return <>
    <h3>{t('Blood pressure')}</h3>
    <div className="nx-grid">
      <label>{t('Systolic (top)')}<NumberField nullable decimal={false} value={sys} onChange={setSys} /></label>
      <label>{t('Diastolic (bottom)')}<NumberField nullable decimal={false} value={dia} onChange={setDia} /></label>
      <label>{t('Pulse (optional)')}<NumberField nullable decimal={false} value={hr} onChange={setHr} /></label>
      <label>{t('Date')}<DateField compact value={d} max={todayISO()} onChange={setD} label={t('Date')} /></label>
      <label>{t('Time')}<input type="time" className="timef" value={time} onChange={e => setTime(e.target.value)} /></label>
    </div>
    {b && <div className="small" style={{ color: b.color, marginBottom: 10 }}>{t(b.label)}</div>}
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {entry && <><div style={{ height: 8 }} /><Button variant="ghost" className="danger" icon="trash" onClick={remove}>{t('Remove')}</Button></>}
  </>
}

/* ============================================================== home card == */

export function ProtocolHomeCard({ S, onOpen }) {
  const d = todayISO()
  const due = dueList(S, d)
  if (!due.length) return null
  const done = due.filter(x => x.taken.length).length
  return <div className="card tap-host">
    <CardHead icon="syringe" tint="var(--purple)" eyebrow={t('Protocol')} title={done === due.length ? t('All done today') : t('{0} of {1} done today', done, due.length)}
      open={{ onClick: onOpen }} action={<Icon name="chevronRight" className="chev" />} />
    {due.filter(x => !x.taken.length).slice(0, 4).map(({ item }) => {
      const site = item.route === 'im' || item.route === 'subq' ? nextSite(S, item) : null
      return <div key={item.id} className="px-due">
        <ItemIcon item={item} />
        <div className="px-due-m"><div className="px-due-t">{item.name}</div>
          <div className="px-due-s">{[doseText(item.dose, item.unit), site ? t('site: {0}', t(site)) : null].filter(Boolean).join(' · ')}</div></div>
        <Button size="sm" variant="tinted" icon="check" onClick={() => quickLog(S, item, d, site)}>{t('Done')}</Button>
      </div>
    })}
  </div>
}
