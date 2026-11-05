// Start an Apple Workout when an openGym session starts (fork addition).
//
// Some things only count a workout recorded by Apple's own Workout app (Discovery Vitality reads
// Apple Fitness, not third-party apps). iOS Shortcuts has a built-in "Start Workout" action that
// starts any Workout app type on the paired Apple Watch, Traditional Strength Training included.
// A web app cannot call it directly, but it can open the shortcuts:// URL scheme, which runs a
// named shortcut. So the person makes a one-action shortcut once, and Start runs it.
//
//   S.appleWorkout = { on: bool, shortcut: 'Start Strength Workout', ask: bool, endShortcut?: string }
//
// A plain setting, synced like any other. It only fires on an iPhone or iPad (the only place
// Shortcuts can reach the watch), and never for a session the watch itself started or for
// logging a past workout.

export const DEFAULT_SHORTCUT = 'Start Strength Workout'

export function appleWorkoutOf(S) {
  const a = S?.appleWorkout && typeof S.appleWorkout === 'object' ? S.appleWorkout : {}
  return {
    on: a.on === true,
    shortcut: typeof a.shortcut === 'string' && a.shortcut.trim() ? a.shortcut.trim().slice(0, 120) : DEFAULT_SHORTCUT,
    ask: a.ask === true,
    endShortcut: typeof a.endShortcut === 'string' ? a.endShortcut.trim().slice(0, 120) : '',
  }
}

/** The URL that runs shortcut `name`. */
export const shortcutUrl = name => 'shortcuts://run-shortcut?name=' + encodeURIComponent(String(name || ''))

/** Whether this device can run a shortcut at all: an iPhone or iPad (iPadOS reports a Mac). */
export function canRunShortcuts(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false
  const ua = String(nav.userAgent || '')
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1
}

/** Opens `url`. Kept apart so a test can stand in for the browser. */
export let openUrl = url => { window.location.href = url }
export function setOpenUrl(fn) { openUrl = fn }

/**
 * Runs the start shortcut if the setting is on and this device can. Returns true when it ran.
 * `force` skips the device check (the Settings test button on a desktop shows the URL instead).
 */
export function runStartShortcut(S, { force = false } = {}) {
  const a = appleWorkoutOf(S)
  if (!a.on && !force) return false
  if (!force && !canRunShortcuts()) return false
  openUrl(shortcutUrl(a.shortcut))
  return true
}

/** The same for the optional end shortcut, run when a session is finished. */
export function runEndShortcut(S) {
  const a = appleWorkoutOf(S)
  if (!a.on || !a.endShortcut || !canRunShortcuts()) return false
  openUrl(shortcutUrl(a.endShortcut))
  return true
}
