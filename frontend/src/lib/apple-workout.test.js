import { describe, it, expect, afterEach } from 'vitest'
import { appleWorkoutOf, shortcutUrl, canRunShortcuts, runStartShortcut, runEndShortcut, setOpenUrl, DEFAULT_SHORTCUT } from './apple-workout.js'

const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 }
const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }
const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }

describe('apple workout shortcut', () => {
  afterEach(() => setOpenUrl(url => { window.location.href = url }))

  it('reads the setting with safe defaults', () => {
    expect(appleWorkoutOf({})).toEqual({ on: false, shortcut: DEFAULT_SHORTCUT, ask: false, endShortcut: '' })
    expect(appleWorkoutOf({ appleWorkout: { on: true, shortcut: '  Gym  ' } })).toMatchObject({ on: true, shortcut: 'Gym' })
  })
  it('builds the URL scheme with the name encoded', () => {
    expect(shortcutUrl('Start Strength Workout')).toBe('shortcuts://run-shortcut?name=Start%20Strength%20Workout')
  })
  it('only an iPhone or iPad can run it', () => {
    expect(canRunShortcuts(iphone)).toBe(true)
    expect(canRunShortcuts(ipad)).toBe(true)
    expect(canRunShortcuts(mac)).toBe(false)
  })
  it('does nothing while off, and opens the shortcut when on', () => {
    const opened = []
    setOpenUrl(u => opened.push(u))
    expect(runStartShortcut({ appleWorkout: { on: false } })).toBe(false)
    expect(runStartShortcut({ appleWorkout: { on: true, shortcut: 'Lift' } }, { force: true })).toBe(true)
    expect(opened).toEqual(['shortcuts://run-shortcut?name=Lift'])
  })
  it('the end shortcut needs a name', () => {
    expect(runEndShortcut({ appleWorkout: { on: true } })).toBe(false)
  })
})
