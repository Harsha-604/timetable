import { useState, useEffect, useMemo } from 'react'
import { fmtTime, hue, getBranchYearKey } from '../utils/helpers'
import { DAYS_ORDER } from '../utils/constants'
import { exportExcel, exportPDF } from '../utils/exporter'

export default function PublicViewer({ onOpenEditor }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeTab, setActiveTab] = useState('class') // 'class' | 'faculty' | 'room'
  const [selectedClassId, setSelectedClassId] = useState('')
  const [facultySearch, setFacultySearch] = useState('')
  const [selectedFacId, setSelectedFacId] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')

  // Fetch data.json from BASE_URL on mount - holds in component state only, never touches localStorage
  useEffect(() => {
    setLoading(true)
    const baseUrl = import.meta.env.BASE_URL || '/'
    const dataUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}data.json`

    fetch(dataUrl, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) {
          throw new Error('No published timetable data found.')
        }
        return res.json()
      })
      .then((json) => {
        setData(json)
        if (json.classes && json.classes.length > 0) {
          setSelectedClassId(json.classes[0].id)
        }
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const classes = data?.classes || []
  const faculty = data?.faculty || []
  const rooms = data?.rooms || []
  const subjects = data?.subjects || {}
  const timetable = data?.timetable || {}
  const settings = data?.settings || { periods: [] }
  const savedAt = data?.savedAt || null

  const periods = settings.periods || []
  const allSubs = useMemo(() => Object.values(subjects).flat(), [subjects])
  const activeDays = DAYS_ORDER.filter((d) =>
    classes.some((c) => (c.workingDays || []).includes(d))
  )

  // ── Class View Data ──
  const currentClass =
    classes.find((c) => c.id === selectedClassId) || classes[0] || null
  const classTT = currentClass ? timetable[currentClass.id] || {} : {}
  const classDays = currentClass?.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const byKey = currentClass
    ? getBranchYearKey(currentClass.branch, currentClass.year)
    : ''
  const classSubs = subjects[byKey] || []

  // ── Faculty View Data ──
  const filteredFaculty = useMemo(() => {
    if (!facultySearch.trim()) return faculty
    const q = facultySearch.toLowerCase()
    return faculty.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.short.toLowerCase().includes(q) ||
        (f.dept && f.dept.toLowerCase().includes(q))
    )
  }, [faculty, facultySearch])

  const activeFacId =
    selectedFacId || (filteredFaculty.length > 0 ? filteredFaculty[0].id : '')
  const activeFaculty = faculty.find((f) => f.id === activeFacId)

  const facSchedule = useMemo(() => {
    const map = {}
    if (!activeFacId) return map

    classes.forEach((c) => {
      const tt = timetable[c.id] || {}
      Object.entries(tt).forEach(([day, ps]) => {
        Object.entries(ps).forEach(([pid, slot]) => {
          const team = slot.facIds || (slot.facId ? [slot.facId] : [])
          if (team.includes(activeFacId)) {
            if (!map[day]) map[day] = {}
            if (!map[day][pid]) map[day][pid] = []
            const sub = allSubs.find((s) => s.id === slot.subId)
            const room = rooms.find(
              (r) =>
                r.id === slot.roomId ||
                r.roomNo === slot.roomId ||
                r.name === slot.roomId
            )
            map[day][pid].push({
              classId: c.id,
              subCode: slot.subCode || sub?.code || sub?.name || '?',
              roomName: room?.roomNo || room?.name || slot.roomId || '',
            })
          }
        })
      })
    })
    return map
  }, [activeFacId, classes, timetable, allSubs, rooms])

  // ── Room View Data ──
  const activeRoomId =
    selectedRoomId || (rooms.length > 0 ? (rooms[0].roomNo || rooms[0].id) : '')
  const activeRoom = rooms.find(
    (r) => r.id === activeRoomId || r.roomNo === activeRoomId || r.name === activeRoomId
  )

  const roomSchedule = useMemo(() => {
    const map = {}
    if (!activeRoom) return map
    const rKey = (activeRoom.roomNo || activeRoom.name || activeRoom.id).toLowerCase()

    classes.forEach((c) => {
      const tt = timetable[c.id] || {}
      Object.entries(tt).forEach(([day, slots]) => {
        Object.entries(slots).forEach(([pid, slot]) => {
          if (slot.roomId && slot.roomId.toLowerCase() === rKey) {
            if (!map[day]) map[day] = {}
            if (!map[day][pid]) map[day][pid] = []
            const sub = allSubs.find((s) => s.id === slot.subId)
            map[day][pid].push({
              classId: c.id,
              subCode: slot.subCode || sub?.code || sub?.name || 'Class',
            })
          }
        })
      })
    })
    return map
  }, [activeRoom, classes, timetable, allSubs])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '1rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, var(--accent2), var(--purple))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            CSE Allied Timetables
          </h1>
          <div style={{ fontSize: '.84rem', color: 'var(--muted)', marginTop: '.2rem' }}>
            Official Published Schedule · A.Y. 2026-27
            {savedAt && (
              <span style={{ marginLeft: '.75rem', color: 'var(--green)' }}>
                ● Last published: {new Date(savedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          {classes.length > 0 && (
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--surface2)',
                borderRadius: 'var(--radius-sm)',
                padding: '.25rem',
              }}
            >
              <button
                className={`btn btn-sm ${activeTab === 'class' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('class')}
              >
                📋 Classes
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'faculty' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('faculty')}
              >
                👤 Faculty
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'room' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('room')}
              >
                🏛️ Rooms &amp; Labs
              </button>
            </div>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={onOpenEditor}
            title="Open coordinator editor (#edit)"
          >
            ⚙️ Coordinator Login / Edit
          </button>
        </div>
      </header>

      {/* Loading state */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: 'var(--muted)' }}>Loading published timetable…</p>
        </div>
      )}

      {/* Empty / Not Published state */}
      {!loading && (!data || classes.length === 0) && (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.5rem' }}>
            Timetable not published yet
          </h2>
          <p style={{ color: 'var(--muted)', maxWidth: 500, margin: '0 auto 1.5rem' }}>
            The coordinator has not published a finalized schedule yet. If you are the coordinator,
            go to the editor to generate and publish data.json.
          </p>
          <button className="btn btn-primary" onClick={onOpenEditor}>
            ⚙️ Go to Coordinator Editor (#edit)
          </button>
        </div>
      )}

      {/* ─── TAB 1: Class Timetable ─── */}
      {!loading && classes.length > 0 && activeTab === 'class' && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '.75rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '.84rem', color: 'var(--muted)' }}>
              Select Class:
            </span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{ width: 180, fontWeight: 700 }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} ({c.branch} Y{c.year})
                </option>
              ))}
            </select>

            {currentClass && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => exportExcel(currentClass.id, data)}
                >
                  📊 Export Excel
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => exportPDF(currentClass.id, data)}
                >
                  📄 Export PDF
                </button>
              </div>
            )}
          </div>

          {currentClass ? (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div
                style={{
                  textAlign: 'center',
                  borderBottom: '2px solid var(--border2)',
                  paddingBottom: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>
                  Time-Table for B.E Semester-{currentClass.semester || 'VII'}
                </h2>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '1.5rem',
                    fontSize: '.85rem',
                    color: 'var(--muted)',
                    marginTop: '.35rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <b>Branch:</b> {currentClass.branch} (Sec {currentClass.section})
                  </span>
                  <span>
                    <b>Room No:</b> {currentClass.homeRoomId || '—'}
                  </span>
                  <span>
                    <b>Academic Year:</b> {currentClass.ay || '2026-27'}
                  </span>
                  <span>
                    <b>w.e.f:</b> {currentClass.wef || '01-08-2026'}
                  </span>
                </div>
              </div>

              {/* Grid */}
              <div className="tt-grid-wrap">
                <table className="tt-grid" style={{ minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th className="day-col">Day</th>
                      {periods.map((p) =>
                        p.brk ? (
                          <th
                            key={p.id}
                            className="brk"
                            style={{
                              background: 'var(--surface3)',
                              color: 'var(--yellow)',
                              fontWeight: 700,
                              width: 44,
                            }}
                          >
                            {p.label}
                            <small>{fmtTime(p.start)}</small>
                          </th>
                        ) : (
                          <th key={p.id} style={{ minWidth: 105 }}>
                            <b>{p.label}</b>
                            <small>
                              {fmtTime(p.start)} - {fmtTime(p.end)}
                            </small>
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {classDays.map((day) => {
                      let skipCount = 0
                      return (
                        <tr key={day}>
                          <th className="day-col">{day}</th>
                          {periods.map((p) => {
                            if (skipCount > 0) {
                              skipCount--
                              return null
                            }

                            if (p.brk) {
                              return (
                                <td
                                  key={p.id}
                                  className="brk"
                                  style={{
                                    background: 'var(--surface3)',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                    fontSize: '.68rem',
                                    color: 'var(--muted)',
                                  }}
                                >
                                  {p.label.toUpperCase()}
                                </td>
                              )
                            }

                            const slot = classTT[day]?.[p.id]
                            const isMultiBlock = slot && slot.blockSize > 1
                            const isBlockStart =
                              !slot || !slot.blockStart || slot.blockStart === p.id

                            if (slot && isMultiBlock && isBlockStart) {
                              skipCount = slot.blockSize - 1
                            }

                            if (slot) {
                              const sub = allSubs.find((s) => s.id === slot.subId)
                              const team = slot.facIds || (slot.facId ? [slot.facId] : [])
                              const facShorts = faculty
                                .filter((f) => team.includes(f.id))
                                .map((f) => f.short)
                                .join(',')

                              const roomObj = rooms.find(
                                (r) =>
                                  r.roomNo === slot.roomId ||
                                  r.name === slot.roomId ||
                                  r.id === slot.roomId
                              )
                              const isLab =
                                sub?.type === 'Lab' || sub?.type === 'Project'
                              const labDisplay =
                                roomObj?.labName && roomObj?.roomNo
                                  ? `(${roomObj.labName}, ${roomObj.roomNo})`
                                  : roomObj?.name
                                  ? `(${roomObj.name})`
                                  : slot.roomId
                                  ? `(${slot.roomId})`
                                  : ''

                              const h = hue(allSubs.findIndex((s) => s.id === slot.subId))

                              return (
                                <td
                                  key={p.id}
                                  colSpan={slot.blockSize || 1}
                                  className="tt-slot filled"
                                  style={{
                                    '--h': h,
                                    background: `hsl(${h} 45% 15%)`,
                                  }}
                                >
                                  <b
                                    style={{
                                      fontSize: '.82rem',
                                      color: `hsl(${h} 80% 75%)`,
                                    }}
                                  >
                                    {slot.subCode || sub?.code || sub?.name || 'Class'}
                                  </b>
                                  {facShorts && (
                                    <span
                                      style={{
                                        fontSize: '.74rem',
                                        color: 'var(--ink)',
                                        fontWeight: 600,
                                        marginTop: '2px',
                                      }}
                                    >
                                      ({facShorts})
                                    </span>
                                  )}
                                  {isLab && labDisplay && (
                                    <span
                                      style={{
                                        fontSize: '.7rem',
                                        color: 'var(--green)',
                                        fontWeight: 700,
                                        marginTop: '2px',
                                        display: 'block',
                                      }}
                                    >
                                      {labDisplay}
                                    </span>
                                  )}
                                </td>
                              )
                            }

                            return <td key={p.id} className="tt-slot" />
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div
                style={{
                  marginTop: '1.5rem',
                  borderTop: '1px solid var(--border)',
                  paddingTop: '1rem',
                }}
              >
                <div style={{ marginBottom: '.75rem' }}>
                  <b style={{ fontSize: '.9rem' }}>Class Advisor: </b>
                  <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>
                    {currentClass.advisor || '—'}
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Subject Code</th>
                        <th>Subject Name</th>
                        <th>Type</th>
                        <th>Faculty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classSubs.map((s) => {
                        const assignedIds = data?.assignments?.[currentClass.id]?.[s.id] || []
                        const facNames = faculty
                          .filter((f) => assignedIds.includes(f.id))
                          .map((f) => `${f.name} (${f.short})`)
                          .join(', ')
                        return (
                          <tr key={s.id}>
                            <td>
                              <b>{s.code || s.name}</b>
                            </td>
                            <td>{s.name}</td>
                            <td>
                              <span
                                className={`tag ${
                                  s.type === 'Lab'
                                    ? 'green'
                                    : s.type === 'Project'
                                    ? 'purple'
                                    : ''
                                }`}
                              >
                                {s.type}
                              </span>
                            </td>
                            <td>{facNames || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <p>No class timetable available.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: Faculty View ─── */}
      {!loading && classes.length > 0 && activeTab === 'faculty' && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '.75rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="search"
              placeholder="🔍 Search faculty by name or short code…"
              value={facultySearch}
              onChange={(e) => setFacultySearch(e.target.value)}
              style={{
                width: 300,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '.4rem .7rem',
                color: 'var(--ink)',
              }}
            />

            <select
              value={activeFacId}
              onChange={(e) => setSelectedFacId(e.target.value)}
              style={{ width: 220 }}
            >
              {filteredFaculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.short})
                </option>
              ))}
            </select>
          </div>

          {activeFaculty ? (
            <div className="card">
              <div className="card-header">
                <h3>
                  👤 {activeFaculty.name} ({activeFaculty.short}) — Schedule
                </h3>
                <span className="tag">{activeFaculty.dept || 'Faculty'}</span>
                <span className="tag blue" style={{ marginLeft: '.3rem' }}>
                  Max: {activeFaculty.max || 30} periods/wk
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
                          const bookings = facSchedule[day]?.[p.id] || []
                          if (bookings.length > 0) {
                            return (
                              <td key={p.id} className="tt-slot filled" style={{ '--h': 210 }}>
                                {bookings.map((b, i) => (
                                  <div key={i} style={{ marginBottom: '.2rem' }}>
                                    <b style={{ fontSize: '.72rem' }}>{b.subCode}</b>
                                    <span style={{ fontSize: '.68rem', color: 'var(--accent2)' }}>
                                      {b.classId}
                                    </span>
                                    {b.roomName && (
                                      <em style={{ fontSize: '.65rem', color: 'var(--muted)' }}>
                                        ({b.roomName})
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
            </div>
          ) : (
            <div className="card">
              <p>No faculty found matching search.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: Room View ─── */}
      {!loading && classes.length > 0 && activeTab === 'room' && (
        <div>
          <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
            <label style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 600 }}>
              Select Room / Laboratory:
            </label>
            <select
              value={activeRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              style={{ width: '100%', marginTop: '.3rem' }}
            >
              {rooms.map((r) => (
                <option key={r.id || r.name} value={r.roomNo || r.id || r.name}>
                  {r.roomNo || r.name} {r.labName ? `(${r.labName})` : ''} [{r.type || 'Room'}]
                </option>
              ))}
            </select>
          </div>

          {activeRoom ? (
            <div className="card">
              <div className="card-header">
                <h3>
                  🏛️ {activeRoom.roomNo || activeRoom.name}{' '}
                  {activeRoom.labName ? `(${activeRoom.labName})` : ''} — Weekly Usage
                </h3>
                <span className="tag green">{activeRoom.type || 'Room'}</span>
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
                          const bookings = roomSchedule[day]?.[p.id] || []
                          if (bookings.length > 0) {
                            return (
                              <td key={p.id} className="tt-slot filled" style={{ '--h': 150 }}>
                                {bookings.map((b, i) => (
                                  <div key={i}>
                                    <b style={{ fontSize: '.72rem', color: 'var(--accent2)' }}>
                                      {b.classId}
                                    </b>
                                    <span style={{ fontSize: '.68rem' }}>{b.subCode}</span>
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
            </div>
          ) : (
            <div className="card">
              <p>No room selected.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
