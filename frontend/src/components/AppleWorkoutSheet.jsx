// Settings → Workout → Start an Apple Workout (fork addition, lib/apple-workout.js).
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { appleWorkoutOf, canRunShortcuts, runStartShortcut, shortcutUrl, DEFAULT_SHORTCUT } from '../lib/apple-workout.js'
import { Button, Row, Switch, TextField } from './ui.jsx'
import '../extras.css'

export function appleWorkoutSheet() {
  useUI.getState().openSheet(close => <AppleWorkout close={close} />)
}

function AppleWorkout({ close }) {
  const S = useStore(s => s.S)
  const a = appleWorkoutOf(S)
  const [name, setName] = useState(a.shortcut)
  const [end, setEnd] = useState(a.endShortcut)
  const set = patch => useStore.getState().update(s => { s.appleWorkout = { ...appleWorkoutOf(s), ...patch } })
  const saveNames = () => set({ shortcut: name.trim() || DEFAULT_SHORTCUT, endShortcut: end.trim() })
  const ios = canRunShortcuts()
  const test = () => {
    saveNames()
    if (!ios) { useUI.getState().toast(t('Open openGym on your iPhone to test. It would open {0}', shortcutUrl(name.trim() || DEFAULT_SHORTCUT))); return }
    runStartShortcut({ appleWorkout: { on: true, shortcut: name.trim() || DEFAULT_SHORTCUT } }, { force: true })
  }

  return <>
    <h3>{t('Start an Apple Workout')}</h3>
    <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
      {t('When you start a session here, openGym runs a Shortcut that starts a Traditional Strength Training workout on your Apple Watch. The workout is recorded by Apple’s own Workout app, so Apple Fitness and anything that reads it (Discovery Vitality, for one) count it.')}
    </div>
    <Row icon="watch" iconTint="var(--green)" title={t('Run the Shortcut on Start')} subtitle={ios ? null : t('Works on iPhone and iPad. This device will skip it.')}>
      <Switch checked={a.on} onChange={v => { saveNames(); set({ on: v }) }} />
    </Row>
    <div style={{ height: 10 }} />
    <label className="nx-field">{t('Shortcut name (exactly as in the Shortcuts app)')}
      <TextField value={name} maxLength={120} onChange={e => setName(e.target.value)} onBlur={saveNames} placeholder={DEFAULT_SHORTCUT} />
    </label>
    <div style={{ height: 10 }} />
    <label className="nx-field">{t('Shortcut when you finish (optional)')}
      <TextField value={end} maxLength={120} onChange={e => setEnd(e.target.value)} onBlur={saveNames} placeholder={t('Leave empty to end the workout on the watch')} />
    </label>

    <h4 className="sec" style={{ marginTop: 16 }}>{t('Make the Shortcut once')}</h4>
    <ol className="small" style={{ lineHeight: 1.6, paddingInlineStart: 20, margin: '4px 0 12px', color: 'var(--label-2)' }}>
      <li>{t('Open the Shortcuts app on your iPhone and tap +.')}</li>
      <li>{t('Add the action “Start Workout”.')}</li>
      <li>{t('Tap the workout type and choose Traditional Strength Training. Leave the goal on Open.')}</li>
      <li>{t('Name the shortcut “{0}” (the name above) and tap Done.', name.trim() || DEFAULT_SHORTCUT)}</li>
      <li>{t('Add openGym to your Home Screen from Safari and start workouts from there.')}</li>
    </ol>
    <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
      {t('iOS opens the Shortcuts app for a moment to run it. Tap the small back arrow in the top-left corner to come straight back to your session. If you also use the openGym iPhone app, switch off its watch app and its Apple Health workouts, so the session is not counted twice.')}
    </div>
    <Button onClick={test} icon="play">{t('Test the Shortcut')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={() => { saveNames(); close() }}>{t('Done')}</Button>
  </>
}
