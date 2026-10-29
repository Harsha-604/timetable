import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { BRANCHES, YEARS } from '../utils/constants'
import { generateClass } from '../utils/generator'

export default function Generate({ onNavigate }) {
  const state = useStore()
  const { faculty, rooms, subjects, settings, setTimetable, toast } = state
  const [running, setRunning]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus]     = useState('')
  const [log, setLog]           = useState([])
  const logRef = useRef(null)

  const addLog = (text, kind = '') => setLog(l => [...l, { text, kind }])

  const run = async () => {
    const keys = BRANCHES.flatMap(b => YEARS.map(y => `${b}_${y}`))
      .filter(k => document.getElementById('chk_' + k)?.checked)
    if (!keys.length) { toast('Select at least one class', 'err'); return }

    const overwrite = document.getElementById('optOverwrite')?.checked ?? true
    const autoFac   = document.getElementById('optAutoFac')?.checked   ?? true
    const autoRoom  = document.getElementById('optAutoRoom')?.checked  ?? true

    setRunning(true); setLog([]); setProgress(0)
    addLog('Starting generator…', 'info')

    const gFacOcc  = {}
    const gRoomOcc = {}

    // Pre-fill occupancy from existing (non-overwrite) timetables
    if (!overwrite) {
      for (const [key, dayMap] of Object.entries(state.timetable)) {
        if (keys.includes(key)) continue
        for (const [day, ps] of Object.entries(dayMap))
          for (const [pid, slot] of Object.entries(ps)) {
            const tag = `${day}|${pid}`
            if (slot.facId)  { gFacOcc[slot.facId]  ||= new Set(); gFacOcc[slot.facId].add(tag)  }
            if (slot.roomId) { gRoomOcc[slot.roomId] ||= new Set(); gRoomOcc[slot.roomId].add(tag) }
          }
      }
    }

    for (let ki = 0; ki < keys.length; ki++) {
      const key  = keys[ki]
      const [branch, yearStr] = key.split('_')
      const year = parseInt(yearStr)
      setProgress(Math.round((ki / keys.length) * 100))
      setStatus(`Processing ${branch} Year ${year}…`)
      addLog(`\n→ ${branch} Year ${year}`, 'info')

      if (!overwrite && state.timetable[key] && Object.keys(state.timetable[key]).length) {
        addLog('  Skipped (exists)', 'ok'); continue
      }
      if (!(subjects[key] || []).length) { addLog('  No subjects — skipped', 'err'); continue }

      const { tt, log: clog, summary } = generateClass({
        key, state: { faculty, rooms, subjects, settings }, gFacOcc, gRoomOcc, autoFac, autoRoom
      })

      clog.forEach(l => addLog('  ' + l.text, l.kind))
      addLog('  ' + summary.text, summary.kind)
      setTimetable(key, tt)

      await new Promise(r => setTimeout(r, 20))
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }

    setProgress(100); setStatus('Done!')
    addLog('\n✅ Generation complete! Go to View/Edit to review.', 'ok')
    toast('Timetables generated!', 'ok')
    setRunning(false)
  }

  return (
    <div>
      <div className="page-header">
        <div className="row"><div><h2>Generate Timetable</h2><p>Auto-generate clash-free timetables for all classes.</p></div></div>
      </div>

      {(!faculty.length || !rooms.length) && (
        <div className="card" style={{ borderColor: 'var(--yellow)', background: 'var(--yellowbg)', marginBottom: '1rem' }}>
          ⚠️ Please add Faculty and Rooms before generating.
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Select Classes to Generate</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '.5rem' }}>
          {BRANCHES.flatMap(b => YEARS.map(y => {
            const key  = `${b}_${y}`
            const subs = subjects[key] || []
            return (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.55rem .75rem', cursor: subs.length ? 'pointer' : 'default', fontSize: '.84rem', opacity: subs.length ? 1 : 0.4 }}>
                <input type="checkbox" id={`chk_${key}`} defaultChecked={subs.length > 0} disabled={!subs.length} />
                <span><b>{b} Y{y}</b><br /><span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{subs.length} subj</span></span>
              </label>
            )
          }))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Options</h3></div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[
            ['optOverwrite', 'Overwrite existing'],
            ['optAutoFac',   'Auto-assign unset faculty'],
            ['optAutoRoom',  'Auto-assign rooms'],
          ].map(([id, label]) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.84rem' }}>
              <input type="checkbox" id={id} defaultChecked /> {label}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Generator</h3>
          <button className="btn btn-success" onClick={run} disabled={running} style={{ marginLeft: 'auto' }}>
            {running ? '⏳ Running…' : '⚡ Generate Now'}
          </button>
        </div>
        {running && (
          <div>
            <div className="progress-bar"><i style={{ width: progress + '%' }} /></div>
            <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '.4rem 0' }}>{status}</p>
          </div>
        )}
        {log.length > 0 && (
          <div ref={logRef} className="gen-log" style={{ marginTop: '.75rem' }}>
            {log.map((l, i) => <span key={i} className={l.kind}>{l.text}{'\n'}</span>)}
          </div>
        )}
        {!running && log.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem' }} onClick={() => onNavigate('view-tt')}>
            📋 View Timetable →
          </button>
        )}
      </div>
    </div>
  )
}
