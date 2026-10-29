import { useState } from 'react'
import { useStore } from '../store/useStore'
import { DAYS_ORDER } from '../utils/constants'
import { fmtTime } from '../utils/helpers'

export default function FacultyView() {
  const { faculty, rooms, subjects, timetable, settings } = useStore()
  const [facId, setFacId] = useState('')

  const periods = settings.periods
  const allDays = DAYS_ORDER

  const schedule = {}
  for (const [key, dayMap] of Object.entries(timetable)) {
    const [b, y] = key.split('_')
    for (const [day, ps] of Object.entries(dayMap))
      for (const [pid, slot] of Object.entries(ps)) {
        if (slot.facId !== facId) continue
        schedule[day] = schedule[day] || {}
        schedule[day][pid] = schedule[day][pid] || []
        const sub  = Object.values(subjects).flat().find(s => s.id === slot.subId)
        const room = rooms.find(r => r.id === slot.roomId)
        schedule[day][pid].push({ branch: b, year: y, subName: sub?.name || '?', roomName: room?.name || '' })
      }
  }

  const activeDays = allDays.filter(d => Object.values(settings.days).some(arr => Array.isArray(arr) && arr.includes(d)))
  const fac = faculty.find(f => f.id === facId)
  let total = 0

  return (
    <div>
      <div className="page-header">
        <div className="row"><div><h2>Faculty Schedule View</h2><p>Full week schedule for any faculty member across all branches.</p></div></div>
      </div>

      <div style={{ maxWidth: 280, marginBottom: '1.25rem' }}>
        <div className="field">
          <label>Select Faculty</label>
          <select value={facId} onChange={e => setFacId(e.target.value)}>
            <option value="">— Choose —</option>
            {faculty.map(f => <option key={f.id} value={f.id}>{f.name} ({f.short})</option>)}
          </select>
        </div>
      </div>

      {facId && (
        <div className="card">
          <div className="card-header"><h3>📅 {fac?.name || 'Faculty'} — Full Week</h3></div>
          <div className="tt-grid-wrap">
            <table className="tt-grid">
              <thead>
                <tr>
                  <th className="day-col">Day</th>
                  {periods.map(p => p.brk
                    ? <th key={p.id} className="brk">{p.label}</th>
                    : <th key={p.id}>{p.label}<small>{fmtTime(p.start)}</small></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeDays.map(day => (
                  <tr key={day}>
                    <th className="day-col">{day}</th>
                    {periods.map(p => {
                      if (p.brk) return <td key={p.id} className="brk" />
                      const slots = (schedule[day] || {})[p.id] || []
                      if (slots.length) {
                        total += slots.length
                        const isClash = slots.length > 1
                        return (
                          <td key={p.id} className={`tt-slot filled${isClash ? ' clash' : ''}`} style={{ '--h': isClash ? 0 : 220 }}>
                            {slots.map((s, i) => (
                              <span key={i}><b style={{ fontSize: '.7rem' }}>{s.branch} Y{s.year}</b><span>{s.subName}</span>{s.roomName ? <em>{s.roomName}</em> : null}</span>
                            ))}
                          </td>
                        )
                      }
                      return <td key={p.id} className="tt-slot" />
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: '.75rem', fontSize: '.82rem', color: 'var(--muted)' }}>
            Total: <b style={{ color: 'var(--ink)' }}>{total}</b> periods/week
            {fac?.max ? ` (max: ${fac.max})` : ''}
            {total > parseInt(fac?.max || 9999) ? <span className="tag red" style={{ marginLeft: '.4rem' }}>Over limit</span> : null}
          </p>
        </div>
      )}
    </div>
  )
}
