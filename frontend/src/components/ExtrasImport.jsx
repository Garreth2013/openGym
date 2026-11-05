// "Import data file" (fork addition, lib/extras-import.js): picks a file, says what is in it, and
// loads it once the person agrees. Lives in Nutrition's settings and at the foot of Protocol.
import { useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { readExtras, applyExtras, countsText } from '../lib/extras-import.js'
import { confirmSheet } from '../sheets.jsx'
import { Button } from './ui.jsx'

const toast = m => useUI.getState().toast(m)

export default function ExtrasImportButton({ variant = 'ghost', size = 'sm' }) {
  const input = useRef(null)
  const onFile = async ev => {
    const file = ev.target.files && ev.target.files[0]
    ev.target.value = ''
    if (!file) return
    let text = ''
    try { text = await file.text() } catch { toast(t('That file could not be read.')); return }
    const r = readExtras(text)
    if (r.error) {
      toast(r.error === 'empty' ? t('There is nothing to import in that file.') : t('That is not an openGym data file. Workouts go through Settings → Data & backup.'))
      return
    }
    confirmSheet({
      title: t('Import this data?'),
      message: t('Adds {0}. Entries you made in the app stay as they are; importing the same file again replaces its own entries.', countsText(r.counts, t)),
      confirmText: t('Import'),
      onConfirm: () => {
        let done = {}
        useStore.getState().update(s => { done = applyExtras(s, r.data) })
        toast(countsText(done, t) ? t('Imported: {0}', countsText(done, t)) : t('Nothing new to import.'))
      },
    })
  }
  return <>
    <input ref={input} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
    <Button variant={variant} size={size} icon="download" onClick={() => input.current?.click()}>{t('Import data file')}</Button>
  </>
}
