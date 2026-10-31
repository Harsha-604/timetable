import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { BRANCHES, YEARS, DAYS_ORDER } from '../utils/constants'
import { fmtTime, hue, getBranchYearKey } from '../utils/helpers'
import { generateScheduleAsync } from '../utils/generator'

export default function TimetableView({ onNavigate, initialClassId }) {
  const {
    classes,
    faculty,
    rooms,
    subjects,
    timetable,
    settings,
    assignments,
    setSlot,
    toggleCellLock,
    swapSlots,
    setAllTimetables,
    toast,
  } = useStore()

  const [selectedClassId, setSelectedClassId] = useState(
    () => initialClassId || classes[0]?.id || 'CIC-4-A'
  )
  const [slotModal, setSlotModal] = useState(null) // { day, pid }
  const [slotForm, setSlotForm] = useState({})
  const [confirmClash, setConfirmClash] = useState(false)
  const [draggedSlot, setDraggedSlot] = useState(null) // { day, pid }
  const [isRegenerating, setIsRegenerating] = useState(false)

  const currentClass =
    classes.find((c) => c.id === selectedClassId) || classes[0] || null

  const byKey = currentClass
    ? getBranchYearKey(currentClass.branch, currentClass.year)
    : ''
  const classSubs = subjects[byKey] || []
  const allSubs = Object.values(subjects).flat()
  const tt = (currentClass && timetable[currentClass.id]) || {}
  const days = currentClass?.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const periods = settings.periods || []

  // Global occupancy map to detect clashes across all classes
  // key: `${facId}|${day}|${pid}` -> [ { classId, slot } ]
  // key: `${roomId}|${day}|${pid}` -> [ { classId, slot } ]
  const globalClashes = useMemo(() => {
    const facOcc = {}
    const roomOcc = {}

    classes.forEach((c) => {
      const classTT = timetable[c.id] || {}
      Object.entries(classTT).forEach(([day, daySlots]) => {
        Object.entries(daySlots).forEach(([pid, slot]) => {
          const team = slot.facIds || (slot.facId ? [slot.facId] : [])
          team.forEach((fid) => {
            const fKey = `${fid}|${day}|${pid}`
            if (!facOcc[fKey]) facOcc[fKey] = []
            facOcc[fKey].push({ classId: c.id, slot })
          })

          if (slot.roomId) {
            const rKey = `${slot.roomId.toLowerCase()}|${day}|${pid}`
            if (!roomOcc[rKey]) roomOcc[rKey] = []
            roomOcc[rKey].push({ classId: c.id, slot })
          }
        })
      })
    })

    return { facOcc, roomOcc }
  }, [classes, timetable])

  // Helper to check if a specific cell in the current class has a clash
  const getSlotClashes = (day, pid, slot) => {
    if (!slot) return []
    const reasons = []
    const team = slot.facIds || (slot.facId ? [slot.facId] : [])

    team.forEach((fid) => {
      const fKey = `${fid}|${day}|${pid}`
      const bookings = globalClashes.facOcc[fKey] || []
      const otherBookings = bookings.filter((b) => b.classId !== currentClass?.id)
      if (otherBookings.length > 0) {
        const facObj = faculty.find((f) => f.id === fid)
        reasons.push(
          `${facObj?.short || fid} is in ${otherBookings.map((b) => b.classId).join(', ')} at ${day} ${pid}`
        )
      }
    })

    if (slot.roomId) {
      const rKey = `${slot.roomId.toLowerCase()}|${day}|${pid}`
      const bookings = globalClashes.roomOcc[rKey] || []
      const otherBookings = bookings.filter((b) => b.classId !== currentClass?.id)
      if (otherBookings.length > 0) {
        reasons.push(
          `Room ${slot.roomId} is used by ${otherBookings.map((b) => b.classId).join(', ')} at ${day} ${pid}`
        )
      }
    }

    return reasons
  }

  // Live modal clash detection
  const liveClashReasons = useMemo(() => {
    if (!slotModal) return []
    const { day, pid } = slotModal
    const reasons = []
    const team = slotForm.facIds || []

    team.forEach((fid) => {
      const fKey = `${fid}|${day}|${pid}`
      const bookings = globalClashes.facOcc[fKey] || []
      const otherBookings = bookings.filter((b) => b.classId !== currentClass?.id)
      if (otherBookings.length > 0) {
        const facObj = faculty.find((f) => f.id === fid)
        reasons.push(
          `${facObj?.short || fid} is scheduled in ${otherBookings.map((b) => b.classId).join(', ')} at ${day} ${pid}`
        )
      }
    })

    if (slotForm.roomId) {
      const rKey = `${slotForm.roomId.toLowerCase()}|${day}|${pid}`
      const bookings = globalClashes.roomOcc[rKey] || []
      const otherBookings = bookings.filter((b) => b.classId !== currentClass?.id)
      if (otherBookings.length > 0) {
        reasons.push(
          `Room ${slotForm.roomId} is already booked in ${otherBookings.map((b) => b.classId).join(', ')} at ${day} ${pid}`
        )
      }
    }

    return reasons
  }, [slotModal, slotForm, globalClashes, currentClass, faculty])

  const openSlot = (day, pid) => {
    const slot = tt[day]?.[pid] || {}
    setSlotForm({
      subId: slot.subId || '',
      facIds: slot.facIds || (slot.facId ? [slot.facId] : []),
      roomId: slot.roomId || currentClass?.homeRoomId || '',
      blockSize: slot.blockSize || 1,
      locked: slot.locked || false,
    })
    setConfirmClash(false)
    setSlotModal({ day, pid })
  }

  const closeSlot = () => {
    setSlotModal(null)
    setConfirmClash(false)
  }

  const handleSaveSlot = (force = false) => {
    if (!slotModal || !currentClass) return
    const { day, pid } = slotModal

    if (!slotForm.subId) {
      setSlot(currentClass.id, day, pid, null)
      toast('Slot cleared', 'ok')
      closeSlot()
      return
    }

    if (liveClashReasons.length > 0 && !force && !confirmClash) {
      setConfirmClash(true)
      return
    }

    const sub = allSubs.find((s) => s.id === slotForm.subId)
    setSlot(currentClass.id, day, pid, {
      subId: slotForm.subId,
      subCode: sub?.code || sub?.name || '?',
      facIds: slotForm.facIds,
      facId: slotForm.facIds[0] || '',
      roomId: slotForm.roomId,
      blockStart: pid,
      blockSize: parseInt(slotForm.blockSize, 10) || 1,
      locked: slotForm.locked,
    })

    toast('Slot saved!', 'ok')
    closeSlot()
  }

  const handleClearSlot = () => {
    if (!slotModal || !currentClass) return
    setSlot(currentClass.id, slotModal.day, slotModal.pid, null)
    toast('Slot cleared', 'ok')
    closeSlot()
  }

  // Drag and drop handlers
  const handleDragStart = (e, day, pid) => {
    setDraggedSlot({ day, pid })
    e.dataTransfer.setData('text/plain', `${day}|${pid}`)
  }

  const handleDrop = (e, targetDay, targetPid) => {
    e.preventDefault()
    if (!draggedSlot || !currentClass) return
    if (draggedSlot.day === targetDay && draggedSlot.pid === targetPid) return

    swapSlots(currentClass.id, draggedSlot.day, draggedSlot.pid, targetDay, targetPid)
    toast(`Swapped ${draggedSlot.day} P${draggedSlot.pid} with ${targetDay} P${targetPid}`, 'ok')
    setDraggedSlot(null)
  }

  // Regenerate unlocked cells
  const handleRegenerateUnlocked = async () => {
    if (!currentClass) return
    setIsRegenerating(true)
    toast('Regenerating unlocked cells…', 'info')

    try {
      const res = await generateScheduleAsync({
        classes: [currentClass],
        subjects,
        faculty,
        rooms,
        assignments,
        settings,
        existingTimetables: timetable,
        options: { attempts: 150 },
      })
      setAllTimetables(res.timetables)
      toast('Unlocked cells regenerated!', 'ok')
    } catch (err) {
      toast('Regeneration failed: ' + err.message, 'err')
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Class Timetable View &amp; Manual Editor</h2>
            <p>
              Layout matching reference with period headers, lunch column, cell merging, and live
              clash detection.
            </p>
          </div>
          <div className="actions">
            <button
              className="btn btn-secondary"
              onClick={handleRegenerateUnlocked}
              disabled={isRegenerating}
            >
              ⚡ Regenerate Unlocked Cells
            </button>
            <button className="btn btn-primary" onClick={() => onNavigate('generate')}>
              🚀 Full Multi-Class Generator
            </button>
          </div>
        </div>
      </div>

      {/* Class Selector */}
      <div className="toolbar">
        <span style={{ fontWeight: 600, fontSize: '.84rem', color: 'var(--muted)' }}>
          Class:
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
        <span className="spacer" />
        {currentClass && (
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <span className="tag">Room: {currentClass.homeRoomId || 'Unset'}</span>
            <span className="tag green">Advisor: {currentClass.advisor || 'Unset'}</span>
            <span className="tag yellow">w.e.f: {currentClass.wef || '01-08-2026'}</span>
          </div>
        )}
      </div>

      {!currentClass ? (
        <div className="card">
          <div className="empty-state">
            <p>No classes defined. Go to Settings to add sections.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '1.5rem' }}>
          {/* ── Official Reference Header ── */}
          <div
            style={{
              textAlign: 'center',
              borderBottom: '2px solid var(--border2)',
              paddingBottom: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <h2
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: 'var(--ink)',
                letterSpacing: '.03em',
              }}
            >
              Time-Table for B.E Semester-{currentClass.semester || 'VII'}
            </h2>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '1.75rem',
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
                <b>Semester Dates:</b> {currentClass.semesterFrom || 'Aug 2026'} –{' '}
                {currentClass.semesterTo || 'Dec 2026'}
              </span>
              <span>
                <b>w.e.f:</b> {currentClass.wef || '01-08-2026'}
              </span>
            </div>
          </div>

          {/* ── Timetable Grid ── */}
          <div className="tt-grid-wrap">
            <table className="tt-grid" style={{ minWidth: 850 }}>
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
                {days.map((day) => {
                  let skipCount = 0

                  return (
                    <tr key={day}>
                      <th className="day-col">{day}</th>
                      {periods.map((p, pIdx) => {
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

                        const slot = tt[day]?.[p.id]
                        const isMultiBlock = slot && slot.blockSize > 1
                        const isBlockStart = !slot || !slot.blockStart || slot.blockStart === p.id

                        if (slot && isMultiBlock && isBlockStart) {
                          // Merge multi-period block cells
                          skipCount = slot.blockSize - 1
                        }

                        const clashes = getSlotClashes(day, p.id, slot)
                        const hasClash = clashes.length > 0

                        if (slot) {
                          const sub = allSubs.find((s) => s.id === slot.subId)
                          const team = slot.facIds || (slot.facId ? [slot.facId] : [])
                          const facObjects = faculty.filter((f) => team.includes(f.id))
                          const facShorts = facObjects.map((f) => f.short).join(',')

                          const roomObj = rooms.find(
                            (r) =>
                              r.roomNo === slot.roomId ||
                              r.name === slot.roomId ||
                              r.id === slot.roomId
                          )
                          const isLab = sub?.type === 'Lab' || sub?.type === 'Project'
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
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, day, p.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => handleDrop(e, day, p.id)}
                              onClick={() => openSlot(day, p.id)}
                              className={`tt-slot filled${hasClash ? ' clash' : ''}`}
                              style={{
                                '--h': h,
                                border: hasClash ? '2px solid var(--red)' : undefined,
                                background: hasClash
                                  ? 'var(--redbg)'
                                  : `hsl(${h} 45% 15%)`,
                                position: 'relative',
                                cursor: 'grab',
                              }}
                              title={hasClash ? clashes.join('\n') : 'Click to edit / Drag to swap'}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <b
                                  style={{
                                    fontSize: '.82rem',
                                    color: `hsl(${h} 80% 75%)`,
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {slot.subCode || sub?.code || sub?.name || 'Class'}
                                </b>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleCellLock(currentClass.id, day, p.id)
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '.75rem',
                                    cursor: 'pointer',
                                    padding: '0 2px',
                                  }}
                                  title={slot.locked ? 'Locked (Click to unlock)' : 'Unlocked'}
                                >
                                  {slot.locked ? '🔒' : '🔓'}
                                </button>
                              </div>

                              {/* Line 2: Faculty short names in brackets */}
                              <span
                                style={{
                                  fontSize: '.74rem',
                                  color: 'var(--ink)',
                                  fontWeight: 600,
                                  marginTop: '2px',
                                }}
                              >
                                {facShorts ? `(${facShorts})` : ''}
                              </span>

                              {/* Line 3: for labs (Lab Name, Room No) in distinct emerald color */}
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

                              {hasClash && (
                                <span
                                  style={{
                                    fontSize: '.65rem',
                                    color: 'var(--red)',
                                    fontWeight: 700,
                                    display: 'block',
                                    marginTop: '2px',
                                  }}
                                >
                                  ⚠️ Clash!
                                </span>
                              )}
                            </td>
                          )
                        }

                        // Empty Slot
                        return (
                          <td
                            key={p.id}
                            className="tt-slot"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, day, p.id)}
                            onClick={() => openSlot(day, p.id)}
                          />
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Official Reference Footer & Legend Table ── */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <div>
                <b style={{ fontSize: '.9rem' }}>Class Advisor: </b>
                <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>
                  {currentClass.advisor || '—'}
                </span>
              </div>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                Tip: Drag &amp; drop cells to swap. Click any cell to edit or lock.
              </div>
            </div>

            <h4
              style={{
                fontSize: '.85rem',
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                marginBottom: '.5rem',
              }}
            >
              Course Legend &amp; Faculty
            </h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Type</th>
                    <th>Faculty Member(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {classSubs.map((s) => {
                    const assignedIds = assignments[currentClass.id]?.[s.id] || []
                    const facList = faculty.filter((f) => assignedIds.includes(f.id))
                    const facString = facList.length
                      ? facList.map((f) => `${f.name} (${f.short})`).join(', ')
                      : '—'

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
                        <td style={{ color: 'var(--ink)' }}>{facString}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Slot Modal ── */}
      {slotModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && closeSlot()}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3>
              {currentClass?.id} — {slotModal.day} Period {slotModal.pid}
            </h3>

            {/* Live Clash Notification */}
            {liveClashReasons.length > 0 && (
              <div
                style={{
                  background: 'var(--redbg)',
                  border: '1px solid var(--red)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '.6rem .75rem',
                  marginBottom: '1rem',
                  fontSize: '.82rem',
                }}
              >
                <b style={{ color: 'var(--red)' }}>⚠️ Clash Detected:</b>
                <ul style={{ paddingLeft: '1.25rem', marginTop: '.25rem' }}>
                  {liveClashReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                <div style={{ marginTop: '.4rem', fontSize: '.75rem', color: 'var(--muted)' }}>
                  Saving with a clash will mark this cell red across all views.
                </div>
              </div>
            )}

            <div className="form-grid" style={{ gap: '.75rem' }}>
              <div className="field field-full">
                <label>Subject</label>
                <select
                  value={slotForm.subId}
                  onChange={(e) => {
                    const sId = e.target.value
                    const s = classSubs.find((x) => x.id === sId)
                    setSlotForm((f) => ({
                      ...f,
                      subId: sId,
                      blockSize: s?.block || 1,
                      roomId:
                        s?.type === 'Lab' || s?.type === 'Project'
                          ? s.labRoomId || f.roomId
                          : currentClass?.homeRoomId || f.roomId,
                    }))
                  }}
                >
                  <option value="">— Free Period —</option>
                  {classSubs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code || s.name} — {s.name} ({s.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field field-full">
                <label>Faculty Team (Checkboxes)</label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '.35rem',
                    background: 'var(--surface2)',
                    padding: '.5rem',
                    borderRadius: 'var(--radius-sm)',
                    maxHeight: 120,
                    overflowY: 'auto',
                  }}
                >
                  {faculty.map((f) => {
                    const isSelected = (slotForm.facIds || []).includes(f.id)
                    return (
                      <label
                        key={f.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.25rem',
                          padding: '.2rem .5rem',
                          borderRadius: '99px',
                          background: isSelected ? 'var(--accent)' : 'var(--surface3)',
                          color: isSelected ? '#fff' : 'var(--ink)',
                          fontSize: '.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const cur = slotForm.facIds || []
                            setSlotForm((prev) => ({
                              ...prev,
                              facIds: e.target.checked
                                ? [...cur, f.id]
                                : cur.filter((x) => x !== f.id),
                            }))
                          }}
                        />
                        {f.short} ({f.name})
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="field">
                <label>Room</label>
                <select
                  value={slotForm.roomId}
                  onChange={(e) => setSlotForm((f) => ({ ...f, roomId: e.target.value }))}
                >
                  <option value="">— Select Room —</option>
                  {rooms.map((r) => (
                    <option key={r.id || r.name} value={r.roomNo || r.name || r.id}>
                      {r.roomNo || r.name} {r.labName ? `(${r.labName})` : ''} [{r.type || 'Room'}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Block Size</label>
                <select
                  value={slotForm.blockSize || 1}
                  onChange={(e) => setSlotForm((f) => ({ ...f, blockSize: e.target.value }))}
                >
                  <option value={1}>1 period</option>
                  <option value={2}>2 periods (Merged)</option>
                  <option value={3}>3 periods (Merged)</option>
                </select>
              </div>

              <div className="field field-full">
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.4rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!slotForm.locked}
                    onChange={(e) => setSlotForm((f) => ({ ...f, locked: e.target.checked }))}
                  />
                  <span>🔒 Lock this cell (keep fixed during auto-regeneration)</span>
                </label>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <button className="btn btn-danger btn-sm" onClick={handleClearSlot}>
                Clear Slot
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={closeSlot}>
                Cancel
              </button>
              {confirmClash ? (
                <button
                  className="btn btn-danger"
                  onClick={() => handleSaveSlot(true)}
                >
                  Save Anyway (Clash)
                </button>
              ) : (
                <button
                  className={`btn ${liveClashReasons.length > 0 ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => handleSaveSlot(false)}
                >
                  {liveClashReasons.length > 0 ? 'Review Clash' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
