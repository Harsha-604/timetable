import { useState } from 'react'
import { useStore } from '../store/useStore'
import { BRANCHES, YEARS, DAYS_ORDER } from '../utils/constants'
import { fmtTime, hue } from '../utils/helpers'

export default function TimetableView({ onNavigate }) {
  const { faculty, rooms, subjects, timetable, settings, setSlot, toast } = useStore()
  const [branch, setBranch] = useState(BRANCHES[0])
  const [year, setYear]     = useState(YEARS[0])
  const [slotModal, setSlotModal] = useState(null) // { day, pid }
  const [slotForm, setSlotForm]   = useState({})

  const key     = `${branch}_${year}`
  const tt      = timetable[key] || {}
  const days    = settings.days[key] || ['Mon','Tue','Wed','Thu','Fri']
  const periods = settings.periods
  const subs    = subjects[key] || []
  const allSubs = Object.values(subjects).flat()

  // Clash detection across all timetables
  const gFacOcc = {}
  for (const [, dayMap] of Object.entries(timetable))
    for (const [day, ps] of Object.entries(dayMap))
      for (const [pid, slot] of Object.entries(ps)) {
        if (!slot.facId) continue
        const t = `${slot.facId}|${day}|${pid}`
        gFacOcc[t] = (gFacOcc[t] || 0) + 1
      }

  const subHue = (subId) => {
    const idx = allSubs.findIndex(s => s.id === subId)
    return idx < 0 ? 220 : hue(idx)
  }

  const openSlot = (day, pid) => {
    const slot = tt[day]?.[pid] || {}
    setSlotForm({ subId: slot.subId || '', facId: slot.facId || '', roomId: slot.roomId || '' })
    setSlotModal({ day, pid })
  }
  const closeSlot = () => setSlotModal(null)

  const saveSlot = () => {
    const { day, pid } = slotModal
    if (!slotForm.subId) { setSlot(key, day, pid, null) }
    else { setSlot(key, day, pid, { subId: slotForm.subId, facId: slotForm.facId, roomId: slotForm.roomId, blockStart: pid, blockSize: 1 }) }
    toast('Saved', 'ok'); closeSlot()
  }
  const clearSlot = () => { setSlot(key, slotModal.day, slotModal.pid, null); toast('Cleared', 'ok'); closeSlot() }

  const hasTT = Object.keys(tt).length > 0

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div><h2>View &amp; Edit Timetable</h2><p>Click any slot to edit it manually.</p></div>
          <div className="actions"><button className="btn btn-secondary" onClick={() => onNavigate('generate')}>⚡ Re-generate</button></div>
        </div>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {BRANCHES.map(b => <button key={b} className={`btn ${b === branch ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBranch(b)}>{b}</button>)}
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginLeft: '.75rem' }}>
          {YEARS.map(y => <button key={y} className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setYear(y)}>Year {y}</button>)}
        </div>
      </div>

      {!hasTT ? (
        <div className="card"><div className="empty-state"><div className="icon">📋</div><p>No timetable for {branch} Year {year}.</p><button className="btn btn-primary" onClick={() => onNavigate('generate')}>⚡ Generate Now</button></div></div>
      ) : (
        <div className="card">
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
                {days.map(day => (
                  <tr key={day}>
                    <th className="day-col">{day}</th>
                    {periods.map(p => {
                      if (p.brk) return <td key={p.id} className="brk" />
                      const slot = tt[day]?.[p.id]
                      const isClash = slot?.facId && (gFacOcc[`${slot.facId}|${day}|${p.id}`] || 0) > 1
                      if (slot) {
                        const sub  = allSubs.find(s => s.id === slot.subId)
                        const fac  = faculty.find(f => f.id === slot.facId)
                        const room = rooms.find(r => r.id === slot.roomId)
                        const h    = subHue(slot.subId)
                        const isCont = slot.blockStart && slot.blockStart !== p.id
                        return (
                          <td key={p.id} className={`tt-slot filled${isClash ? ' clash' : ''}`} style={{ '--h': h, opacity: isCont ? .65 : 1 }} onClick={() => openSlot(day, p.id)}>
                            {isCont
                              ? <span style={{ fontSize: '.65rem' }}>↑ continued</span>
                              : <><b>{sub?.name || '?'}</b><span>{fac ? fac.short : '—'}</span><em>{room ? room.name : '—'}</em></>
                            }
                          </td>
                        )
                      }
                      return <td key={p.id} className="tt-slot" onClick={() => openSlot(day, p.id)} />
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {subs.map((s, idx) => {
              const h = subHue(s.id)
              const f = faculty.find(x => x.id === s.facultyId)
              return (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', background: `hsl(${h} 55% 18%)`, border: `1px solid hsl(${h} 55% 28%)`, borderRadius: 99, padding: '.2rem .6rem', fontSize: '.72rem', fontWeight: 600 }}>
                  {s.name}{f ? <span style={{ color: 'var(--muted)' }}>({f.short})</span> : null}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Slot edit modal */}
      {slotModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeSlot()}>
          <div className="modal">
            <h3>{slotModal.day} — Period {slotModal.pid}</h3>
            <div className="form-grid" style={{ gap: '.65rem' }}>
              <div className="field field-full">
                <label>Subject</label>
                <select value={slotForm.subId} onChange={e => setSlotForm(f => ({ ...f, subId: e.target.value }))}>
                  <option value="">— Free —</option>
                  {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Faculty</label>
                <select value={slotForm.facId} onChange={e => setSlotForm(f => ({ ...f, facId: e.target.value }))}>
                  <option value="">— None —</option>
                  {faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Room</label>
                <select value={slotForm.roomId} onChange={e => setSlotForm(f => ({ ...f, roomId: e.target.value }))}>
                  <option value="">— None —</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-danger btn-sm" onClick={clearSlot}>Clear</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={closeSlot}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSlot}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
