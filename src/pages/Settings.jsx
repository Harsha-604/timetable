import { useState } from 'react'
import { useStore } from '../store/useStore'
import { BRANCHES, YEARS, DAYS_ORDER, DEFAULT_PERIODS, DEFAULT_LAB_WINDOWS } from '../utils/constants'
import { uid, sectionLetter } from '../utils/helpers'
import cic4Sample from '../sample/cic4.json'

export default function Settings() {
  const {
    classes,
    rooms,
    settings,
    setSectionCount,
    removeClass,
    updateClass,
    setPeriods,
    resetPeriods,
    setLabWindows,
    loadProject,
    toast,
  } = useStore()

  const [periods, setPeriodState] = useState(() => JSON.parse(JSON.stringify(settings.periods || DEFAULT_PERIODS)))
  const [labWindows, setLabWindowsState] = useState(() => JSON.parse(JSON.stringify(settings.labWindows || DEFAULT_LAB_WINDOWS)))
  const [filterBranch, setFilterBranch] = useState('ALL')
  const [filterYear, setFilterYear] = useState('ALL')

  // Classroom options for home classroom
  const classrooms = rooms.filter((r) => r.type === 'Classroom' || !r.type)
  const roomPool = classrooms.length ? classrooms : rooms

  // Period helpers
  const teachingPeriods = periods.filter((p) => !p.brk)

  const updatePeriod = (i, field, val) => {
    const p = [...periods]
    p[i] = { ...p[i], [field]: val }
    setPeriodState(p)
  }

  const addPeriod = () =>
    setPeriodState((p) => [
      ...p,
      { id: uid('p'), label: `P${p.length + 1}`, start: '', end: '', brk: false },
    ])

  const removePeriod = (i) => setPeriodState((p) => p.filter((_, j) => j !== i))

  const savePeriods = () => {
    setPeriods(periods)
    toast('Periods saved!', 'ok')
  }

  const doResetPeriods = () => {
    const d = JSON.parse(JSON.stringify(DEFAULT_PERIODS))
    setPeriodState(d)
    const dw = JSON.parse(JSON.stringify(DEFAULT_LAB_WINDOWS))
    setLabWindowsState(dw)
    resetPeriods()
    toast('Periods & lab windows reset to default', 'ok')
  }

  // Lab windows helpers
  const addLabWindow = () => {
    if (teachingPeriods.length < 2) {
      toast('Need at least 2 teaching periods to define a window', 'err')
      return
    }
    const nextWin = [teachingPeriods[0].id, teachingPeriods[1].id]
    const updated = [...labWindows, nextWin]
    setLabWindowsState(updated)
    setLabWindows(updated)
  }

  const updateLabWinPeriod = (winIdx, pos, pid) => {
    const updated = labWindows.map((w, idx) => {
      if (idx !== winIdx) return w
      const copy = [...w]
      copy[pos] = pid
      return copy
    })
    setLabWindowsState(updated)
    setLabWindows(updated)
  }

  const removeLabWindow = (idx) => {
    const updated = labWindows.filter((_, i) => i !== idx)
    setLabWindowsState(updated)
    setLabWindows(updated)
  }

  const handleSectionCountChange = (b, y, newCount) => {
    const cur = classes.filter((c) => c.branch === b && Number(c.year) === Number(y))
    if (newCount < cur.length) {
      const removing = cur[cur.length - 1]
      if (
        confirm(
          `Remove section ${removing.id}? This will also delete its timetable and assignments.`
        )
      ) {
        removeClass(removing.id)
        toast(`Section ${removing.id} removed`, 'ok')
      }
    } else if (newCount > cur.length) {
      setSectionCount(b, y, newCount)
      toast(`Added section ${b}-${y}-${sectionLetter(cur.length)}`, 'ok')
    }
  }

  const handleToggleDay = (classId, day) => {
    const cls = classes.find((c) => c.id === classId)
    if (!cls) return
    const cur = cls.workingDays || []
    const updated = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day]
    const sorted = DAYS_ORDER.filter((d) => updated.includes(d))
    updateClass(classId, { workingDays: sorted })
  }

  const handleLoadSample = () => {
    if (
      confirm(
        'Load the sample reference dataset (CIC-4-A reference class + AIML-4-A)? This will replace current data.'
      )
    ) {
      loadProject(cic4Sample)
      toast('Reference sample dataset loaded successfully!', 'ok')
    }
  }

  const filteredClasses = classes.filter((c) => {
    if (filterBranch !== 'ALL' && c.branch !== filterBranch) return false
    if (filterYear !== 'ALL' && Number(c.year) !== Number(filterYear)) return false
    return true
  })

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Settings &amp; Dynamic Sections</h2>
            <p>Configure classes, sections, working days, home rooms, and period schedules.</p>
          </div>
          <div className="actions">
            <button className="btn btn-secondary" onClick={handleLoadSample}>
              ⭐ Load Reference Sample (CIC-4-A)
            </button>
          </div>
        </div>
      </div>

      {/* ── Section Counts per Branch & Year ── */}
      <div className="card">
        <div className="card-header">
          <h3>👥 Sections per Branch &amp; Year</h3>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
            Set 0 to N sections per branch+year. Adding a section creates the class entity.
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 640, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th
                  style={{
                    padding: '.5rem .75rem',
                    textAlign: 'left',
                    fontSize: '.75rem',
                    color: 'var(--muted)',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--surface2)',
                  }}
                >
                  Branch
                </th>
                {YEARS.map((y) => (
                  <th
                    key={y}
                    style={{
                      padding: '.5rem .75rem',
                      textAlign: 'center',
                      fontSize: '.75rem',
                      color: 'var(--muted)',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--surface2)',
                    }}
                  >
                    Year {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BRANCHES.map((b) => (
                <tr key={b}>
                  <td
                    style={{
                      padding: '.6rem .75rem',
                      fontWeight: 700,
                      fontSize: '.88rem',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--surface2)',
                    }}
                  >
                    {b}
                  </td>
                  {YEARS.map((y) => {
                    const secs = classes.filter((c) => c.branch === b && Number(c.year) === Number(y))
                    return (
                      <td
                        key={y}
                        style={{
                          padding: '.5rem .75rem',
                          borderBottom: '1px solid var(--border)',
                          textAlign: 'center',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.5rem',
                            background: 'var(--surface2)',
                            padding: '.25rem .5rem',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0 .4rem', fontSize: '1rem' }}
                            disabled={secs.length === 0}
                            onClick={() => handleSectionCountChange(b, y, secs.length - 1)}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                            {secs.length}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0 .4rem', fontSize: '1rem' }}
                            onClick={() => handleSectionCountChange(b, y, secs.length + 1)}
                          >
                            +
                          </button>
                        </div>
                        <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: '.2rem' }}>
                          {secs.length
                            ? secs.map((s) => s.section).join(', ')
                            : 'No sections'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Per-Class Settings: Home room, Working Days, Saturday Periods, Metadata ── */}
      <div className="card">
        <div className="card-header">
          <h3>🏛️ Class Entities Configuration</h3>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
            Configure home classroom, working days, advisor, and dates for each active class.
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              style={{ width: 110, padding: '.3rem .5rem', fontSize: '.78rem' }}
            >
              <option value="ALL">All Branches</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              style={{ width: 100, padding: '.3rem .5rem', fontSize: '.78rem' }}
            >
              <option value="ALL">All Years</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredClasses.length === 0 ? (
          <div className="empty-state">
            <p>No classes defined. Use the section counters above to add sections.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredClasses.map((cls) => {
              const isSatOn = (cls.workingDays || []).includes('Sat')
              return (
                <div
                  key={cls.id}
                  style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '.75rem',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '.5rem',
                      flexWrap: 'wrap',
                      gap: '.5rem',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--accent2)',
                          marginRight: '.75rem',
                        }}
                      >
                        {cls.id}
                      </span>
                      <span className="tag">{cls.branch}</span>
                      <span className="tag" style={{ marginLeft: '.3rem' }}>
                        Year {cls.year} (Sem {cls.semester || 'VII'})
                      </span>
                      <span className="tag" style={{ marginLeft: '.3rem' }}>
                        Sec {cls.section}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)' }}
                      onClick={() => {
                        if (confirm(`Delete section ${cls.id} and its timetable?`)) {
                          removeClass(cls.id)
                          toast(`Section ${cls.id} removed`, 'ok')
                        }
                      }}
                    >
                      🗑 Remove Section
                    </button>
                  </div>

                  <div className="form-grid" style={{ gap: '.75rem' }}>
                    {/* Home Classroom */}
                    <div className="field">
                      <label>Home Classroom</label>
                      <select
                        value={cls.homeRoomId || ''}
                        onChange={(e) => updateClass(cls.id, { homeRoomId: e.target.value })}
                      >
                        <option value="">— Select Classroom —</option>
                        {roomPool.map((r) => (
                          <option key={r.id || r.name} value={r.id || r.name}>
                            {r.name || r.roomNo} ({r.type || 'Room'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Class Advisor */}
                    <div className="field">
                      <label>Class Advisor</label>
                      <input
                        value={cls.advisor || ''}
                        onChange={(e) => updateClass(cls.id, { advisor: e.target.value })}
                        placeholder="e.g. Dr. M. V. Ramana Rao"
                      />
                    </div>

                    {/* Working Days */}
                    <div className="field field-full">
                      <label>Working Days &amp; Saturday Schedule</label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '.75rem',
                          flexWrap: 'wrap',
                          background: 'var(--surface)',
                          padding: '.5rem .75rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        {DAYS_ORDER.map((d) => (
                          <label
                            key={d}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '.3rem',
                              fontSize: '.82rem',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={(cls.workingDays || []).includes(d)}
                              onChange={() => handleToggleDay(cls.id, d)}
                            />
                            {d}
                          </label>
                        ))}

                        <div
                          style={{
                            marginLeft: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '.4rem',
                            opacity: isSatOn ? 1 : 0.4,
                          }}
                        >
                          <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                            Saturday Periods:
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="8"
                            disabled={!isSatOn}
                            value={cls.saturdayPeriods ?? 4}
                            onChange={(e) =>
                              updateClass(cls.id, {
                                saturdayPeriods: parseInt(e.target.value, 10) || 4,
                              })
                            }
                            style={{ width: 55, padding: '.2rem .4rem', fontSize: '.78rem' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Metadata fields */}
                    <div className="field">
                      <label>w.e.f (With Effect From)</label>
                      <input
                        value={cls.wef || ''}
                        onChange={(e) => updateClass(cls.id, { wef: e.target.value })}
                        placeholder="01-08-2026"
                      />
                    </div>

                    <div className="field">
                      <label>Academic Year &amp; Semester</label>
                      <div style={{ display: 'flex', gap: '.4rem' }}>
                        <input
                          value={cls.ay || '2026-27'}
                          onChange={(e) => updateClass(cls.id, { ay: e.target.value })}
                          placeholder="A.Y. 2026-27"
                          style={{ flex: 1 }}
                        />
                        <input
                          value={cls.semester || ''}
                          onChange={(e) => updateClass(cls.id, { semester: e.target.value })}
                          placeholder="Sem (VII)"
                          style={{ width: 90 }}
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label>Semester Duration (From → To)</label>
                      <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                        <input
                          value={cls.semesterFrom || ''}
                          onChange={(e) => updateClass(cls.id, { semesterFrom: e.target.value })}
                          placeholder="Aug 2026"
                        />
                        <span style={{ color: 'var(--muted)' }}>→</span>
                        <input
                          value={cls.semesterTo || ''}
                          onChange={(e) => updateClass(cls.id, { semesterTo: e.target.value })}
                          placeholder="Dec 2026"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Lab Windows Configuration ── */}
      <div className="card">
        <div className="card-header">
          <h3>🔬 Lab Windows (Multi-Period Blocks)</h3>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
            Allowed contiguous periods for 2+ period blocks. Default: [P1,P2], [P3,P4], [P5,P6].
            Blocks never span breaks or lunch.
          </span>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={addLabWindow}
          >
            + Add Lab Window
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem' }}>
          {labWindows.map((win, idx) => (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.4rem',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '.4rem .6rem',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '.78rem', color: 'var(--green)' }}>
                Window {idx + 1}:
              </span>
              <select
                value={win[0] || ''}
                onChange={(e) => updateLabWinPeriod(idx, 0, e.target.value)}
                style={{ width: 75, padding: '.2rem .3rem', fontSize: '.78rem' }}
              >
                {teachingPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span style={{ color: 'var(--muted)' }}>&amp;</span>
              <select
                value={win[1] || ''}
                onChange={(e) => updateLabWinPeriod(idx, 1, e.target.value)}
                style={{ width: 75, padding: '.2rem .3rem', fontSize: '.78rem' }}
              >
                {teachingPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red)', padding: '0 .3rem' }}
                onClick={() => removeLabWindow(idx)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Daily Period Schedule ── */}
      <div className="card">
        <div className="card-header">
          <h3>⏰ Daily Period Schedule</h3>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
            Configurable period timings, morning break, and lunch break.
          </span>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={addPeriod}
          >
            + Add Period
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {periods.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                gap: '.5rem',
                alignItems: 'center',
                background: p.brk ? 'var(--surface3)' : 'var(--surface2)',
                borderRadius: 'var(--radius-sm)',
                padding: '.5rem .75rem',
                borderLeft: p.brk ? '3px solid var(--yellow)' : '3px solid var(--accent)',
              }}
            >
              <input
                value={p.label}
                onChange={(e) => updatePeriod(i, 'label', e.target.value)}
                style={{ width: 75 }}
                placeholder="Label"
              />
              <input
                type="time"
                value={p.start}
                onChange={(e) => updatePeriod(i, 'start', e.target.value)}
                style={{ width: 110 }}
              />
              <span style={{ color: 'var(--muted)' }}>→</span>
              <input
                type="time"
                value={p.end}
                onChange={(e) => updatePeriod(i, 'end', e.target.value)}
                style={{ width: 110 }}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.3rem',
                  fontSize: '.82rem',
                  cursor: 'pointer',
                  marginLeft: '.5rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!p.brk}
                  onChange={(e) => updatePeriod(i, 'brk', e.target.checked)}
                />{' '}
                Break / Lunch
              </label>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto', color: 'var(--red)' }}
                onClick={() => removePeriod(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '.75rem', display: 'flex', gap: '.5rem' }}>
          <button className="btn btn-primary" onClick={savePeriods}>
            Save Periods
          </button>
          <button className="btn btn-ghost" onClick={doResetPeriods}>
            Reset to Default
          </button>
        </div>
      </div>
    </div>
  )
}
