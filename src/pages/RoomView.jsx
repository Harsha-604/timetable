import { useState } from 'react'
import { useStore } from '../store/useStore'
import { DAYS_ORDER } from '../utils/constants'
import { fmtTime, hue } from '../utils/helpers'

export default function RoomView() {
  const { classes, rooms, subjects, timetable, settings } = useStore()
  const [roomId, setRoomId] = useState('')

  const selectedRoomId = roomId || (rooms.length > 0 ? (rooms[0].roomNo || rooms[0].id) : '')
  const selectedRoom = rooms.find(
    (r) => r.id === selectedRoomId || r.roomNo === selectedRoomId || r.name === selectedRoomId
  )

  const periods = settings.periods || []
  const teachingPeriods = periods.filter((p) => !p.brk)
  const allSubs = Object.values(subjects).flat()

  // Build room schedule: { [day]: { [pid]: [ { classId, slot, sub } ] } }
  const schedule = {}
  let totalUsage = 0

  if (selectedRoom) {
    const rKey = (selectedRoom.roomNo || selectedRoom.name || selectedRoom.id).toLowerCase()

    classes.forEach((c) => {
      const tt = timetable[c.id] || {}
      Object.entries(tt).forEach(([day, slots]) => {
        Object.entries(slots).forEach(([pid, slot]) => {
          if (!slot.roomId) return
          if (slot.roomId.toLowerCase() === rKey) {
            schedule[day] = schedule[day] || {}
            schedule[day][pid] = schedule[day][pid] || []
            const sub = allSubs.find((s) => s.id === slot.subId)
            schedule[day][pid].push({ classId: c.id, slot, sub })
          }
        })
      })
    })
  }

  const activeDays = DAYS_ORDER.filter((d) =>
    classes.some((c) => (c.workingDays || []).includes(d))
  )

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Room &amp; Lab Timetable View</h2>
            <p>View occupancy and usage across all classrooms and labs to detect conflicts.</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 350, marginBottom: '1.25rem' }}>
        <div className="field">
          <label>Select Room / Lab</label>
          <select value={selectedRoomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">— Select Room —</option>
            {rooms.map((r) => (
              <option key={r.id || r.name} value={r.roomNo || r.id || r.name}>
                {r.roomNo || r.name} {r.labName ? `(${r.labName})` : ''} [{r.type || 'Classroom'}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedRoom && (
        <div className="card">
          <div className="card-header">
            <h3>
              🏛️ {selectedRoom.roomNo || selectedRoom.name}{' '}
              {selectedRoom.labName ? `(${selectedRoom.labName})` : ''} — Weekly Usage
            </h3>
            <span className="tag blue">{selectedRoom.type || 'Classroom'}</span>
            {selectedRoom.capacity && (
              <span className="tag" style={{ marginLeft: '.3rem' }}>
                Cap: {selectedRoom.capacity}
              </span>
            )}
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

                      const bookings = schedule[day]?.[p.id] || []
                      if (bookings.length > 0) {
                        totalUsage++
                        const isClash = bookings.length > 1
                        return (
                          <td
                            key={p.id}
                            className={`tt-slot filled${isClash ? ' clash' : ''}`}
                            style={{
                              '--h': isClash ? 0 : 200,
                              background: isClash ? 'var(--redbg)' : undefined,
                            }}
                          >
                            {bookings.map((b, idx) => (
                              <div key={idx} style={{ marginBottom: '.2rem' }}>
                                <b style={{ fontSize: '.72rem', color: 'var(--accent2)' }}>
                                  {b.classId}
                                </b>
                                <span style={{ fontSize: '.68rem' }}>
                                  {b.sub?.code || b.sub?.name || 'Class'}
                                </span>
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
            Room Occupancy: <b style={{ color: 'var(--ink)' }}>{totalUsage}</b> periods/week
          </p>
        </div>
      )}
    </div>
  )
}

