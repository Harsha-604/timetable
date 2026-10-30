import { useState } from 'react'
import { useStore } from '../store/useStore'
import { DAYS_ORDER } from '../utils/constants'
import { fmtTime } from '../utils/helpers'

export default function FacultyView() {
  const { classes, faculty, rooms, subjects, timetable, settings } = useStore()
  const [facId, setFacId] = useState('')

  const selectedFacId = facId || (faculty.length > 0 ? faculty[0].id : '')
  const fac = faculty.find((f) => f.id === selectedFacId)

  const periods = settings.periods || []
  const allDays = DAYS_ORDER
  const allSubs = Object.values(subjects).flat()

  const schedule = {}
  let totalPeriods = 0

  if (selectedFacId) {
    classes.forEach((c) => {
      const tt = timetable[c.id] || {}
      Object.entries(tt).forEach(([day, ps]) => {
        Object.entries(ps).forEach(([pid, slot]) => {
          const team = slot.facIds || (slot.facId ? [slot.facId] : [])
          if (!team.includes(selectedFacId)) return

          schedule[day] = schedule[day] || {}
          schedule[day][pid] = schedule[day][pid] || []

          const sub = allSubs.find((s) => s.id === slot.subId)
          const room = rooms.find(
            (r) =>
              r.id === slot.roomId ||
              r.roomNo === slot.roomId ||
              r.name === slot.roomId
          )
          schedule[day][pid].push({
            classId: c.id,
            subCode: slot.subCode || sub?.code || sub?.name || '?',
            roomName: room?.roomNo || room?.name || slot.roomId || '',
          })
        })
      })
    })
  }

  const activeDays = allDays.filter((d) =>
    classes.some((c) => (c.workingDays || []).includes(d))
  )

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Faculty Schedule View</h2>
            <p>Full weekly schedule for any faculty member across all branches and classes.</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 350, marginBottom: '1.25rem' }}>
        <div className="field">
          <label>Select Faculty Member</label>
          <select value={selectedFacId} onChange={(e) => setFacId(e.target.value)}>
            <option value="">— Choose Faculty —</option>
            {faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.short}) — Max: {f.max || 30}
              </option>
            ))}
          </select>
        </div>
      </div>

      {fac && (
        <div className="card">
          <div className="card-header">
            <h3>
              👤 {fac.name} ({fac.short}) — Weekly Schedule
            </h3>
            <span className="tag">{fac.dept || 'Faculty'}</span>
            <span className="tag blue" style={{ marginLeft: '.3rem' }}>
              Max: {fac.max || 30} periods/wk
            </span>
          </div>

          <div className="tt-grid-wrap">
            <table className="tt-grid">
              <thead>
                <tr>
                  <th className="day-col">Day</th>
                  {periods.map((p) =>
                    p.brk ? (
                      <th key={p.id} className="brk">
                        {p.label}
                      </th>
                    ) : (
                      <th key={p.id}>
                        {p.label}
                        <small>
                          {fmtTime(p.start)}-{fmtTime(p.end)}
                        </small>
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {activeDays.map((day) => (
                  <tr key={day}>
                    <th className="day-col">{day}</th>
                    {periods.map((p) => {
                      if (p.brk) return <td key={p.id} className="brk" />

                      const slots = schedule[day]?.[p.id] || []
                      if (slots.length > 0) {
                        totalPeriods++
                        const isClash = slots.length > 1
                        return (
                          <td
                            key={p.id}
                            className={`tt-slot filled${isClash ? ' clash' : ''}`}
                            style={{
                              '--h': isClash ? 0 : 220,
                              background: isClash ? 'var(--redbg)' : undefined,
                            }}
                          >
                            {slots.map((s, i) => (
                              <div key={i} style={{ marginBottom: '.2rem' }}>
                                <b style={{ fontSize: '.72rem' }}>{s.subCode}</b>
                                <span style={{ fontSize: '.68rem', color: 'var(--accent2)' }}>
                                  {s.classId}
                                </span>
                                {s.roomName && (
                                  <em style={{ fontSize: '.65rem', color: 'var(--muted)' }}>
                                    ({s.roomName})
                                  </em>
                                )}
                              </div>
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

          <p style={{ marginTop: '.75rem', fontSize: '.84rem', color: 'var(--muted)' }}>
            Total Allocated:{' '}
            <b
              style={{
                color: totalPeriods > (fac.max || 30) ? 'var(--red)' : 'var(--ink)',
              }}
            >
              {totalPeriods}
            </b>{' '}
            / {fac.max || 30} periods/week
            {totalPeriods > (fac.max || 30) && (
              <span className="tag red" style={{ marginLeft: '.5rem' }}>
                Exceeds Max Limit!
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
