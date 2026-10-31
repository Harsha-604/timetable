import { useState, useRef, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { autoAssignFaculty, generateScheduleAsync } from '../utils/generator'
import { validateState, isFacultyQualified, auditTimetableHardViolations } from '../utils/validator'
import { getBranchYearKey } from '../utils/helpers'
import { usePublish } from '../utils/usePublish'

export default function Generate({ onNavigate }) {
  const state = useStore()
  const { publishing, deployStatus, handlePublish } = usePublish({ onNavigate })
  const {
    classes,
    faculty,
    rooms,
    subjects,
    settings,
    assignments,
    lockedAssignments,
    subjectFacultyPresets,
    importErrors,
    timetable,
    setAssignment,
    setAllAssignments,
    toggleLockAssignment,
    setAllTimetables,
    toast,
  } = state

  const [step, setStep] = useState('review') // 'review' | 'generate'
  const [selectedClassIds, setSelectedClassIds] = useState(() =>
    classes.map((c) => c.id)
  )
  const [attempts, setAttempts] = useState(200)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [genReport, setGenReport] = useState(null)
  const logRef = useRef(null)

  // Validation report
  const validation = useMemo(() => {
    return validateState({
      classes,
      faculty,
      rooms,
      subjects,
      settings,
      assignments,
      importErrors: importErrors || [],
    })
  }, [classes, faculty, rooms, subjects, settings, assignments, importErrors])

  const selectedClasses = classes.filter((c) => selectedClassIds.includes(c.id))

  const toggleSelectAll = () => {
    if (selectedClassIds.length === classes.length) {
      setSelectedClassIds([])
    } else {
      setSelectedClassIds(classes.map((c) => c.id))
    }
  }

  const toggleSelectClass = (id) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  // Step A: Auto-assign
  const handleAutoAssign = () => {
    const updated = autoAssignFaculty({
      classes: selectedClasses,
      subjects,
      faculty,
      existingAssignments: assignments,
      lockedAssignments,
    })
    setAllAssignments(updated)
    toast('Teaching teams auto-assigned from qualified faculty!', 'ok')
  }

  const handleFacultyChange = (classId, subjectId, facId, checked) => {
    const cur = assignments[classId]?.[subjectId] || []
    const next = checked ? [...cur, facId] : cur.filter((id) => id !== facId)
    setAssignment(classId, subjectId, next)
  }

  // Step B: Run Generator
  const handleRunGenerator = async () => {
    if (!validation.isValid) {
      toast('Please fix validation errors before generating', 'err')
      return
    }
    if (selectedClasses.length === 0) {
      toast('Please select at least one class to generate', 'err')
      return
    }

    // 1) Every selected class needs its own home classroom. Fill blanks with free classrooms.
    const roomKey = (h) => {
      const r = rooms.find((x) => x.id === h || x.name === h || x.roomNo === h)
      return r ? r.roomNo || r.name : h
    }
    const classroomNos = rooms.filter((r) => r.type !== 'Lab').map((r) => r.roomNo || r.name)
    const usedRooms = new Set(classes.map((c) => c.homeRoomId).filter(Boolean).map(roomKey))
    const homeRooms = {}
    for (const c of selectedClasses) {
      let hr = c.homeRoomId ? roomKey(c.homeRoomId) : ''
      if (!hr) {
        hr = classroomNos.find((no) => !usedRooms.has(no)) || ''
        if (!hr) {
          toast(`Not enough classrooms: ${c.id} has no home room. Add classrooms or set it in Settings.`, 'err')
          return
        }
        usedRooms.add(hr)
        state.updateClass(c.id, { homeRoomId: hr })
      }
      homeRooms[c.id] = hr
    }
    const seenRooms = {}
    for (const [cid, hr] of Object.entries(homeRooms)) {
      if (seenRooms[hr]) {
        toast(`${cid} and ${seenRooms[hr]} share home room ${hr}. Give each class its own room in Settings.`, 'err')
        return
      }
      seenRooms[hr] = cid
    }
    const classesForGen = selectedClasses.map((c) => ({ ...c, homeRoomId: homeRooms[c.id] }))

    // 2) Fill in teaching teams for any subject without one (keeps every existing team).
    const keepExisting = {}
    Object.entries(assignments || {}).forEach(([cid, m]) => {
      keepExisting[cid] = {}
      Object.entries(m || {}).forEach(([sid, team]) => {
        if (team && team.length) keepExisting[cid][sid] = true
      })
    })
    const filledAssignments = autoAssignFaculty({
      classes: classesForGen,
      subjects,
      faculty,
      existingAssignments: assignments,
      lockedAssignments: keepExisting,
    })
    setAllAssignments(filledAssignments)
    const noTeam = []
    classesForGen.forEach((c) => {
      ;(subjects[getBranchYearKey(c.branch, c.year)] || []).forEach((s) => {
        if (!(filledAssignments[c.id]?.[s.id] || []).length) noTeam.push(`${c.id} ${s.code || s.name}`)
      })
    })
    if (noTeam.length) {
      toast(`No qualified faculty for: ${noTeam.slice(0, 5).join(', ')}${noTeam.length > 5 ? ` and ${noTeam.length - 5} more` : ''}`, 'err')
      return
    }

    setRunning(true)
    setProgress(0)
    setStatus('Preparing multi-class scheduler…')
    setGenReport(null)

    try {
      const result = await generateScheduleAsync({
        classes: classesForGen,
        subjects,
        faculty,
        rooms,
        assignments: filledAssignments,
        settings,
        existingTimetables: timetable,
        options: { attempts: Number(attempts) || 200 },
        onProgress: (pct) => {
          setProgress(pct)
          setStatus(`Running optimization attempts… ${pct}%`)
        },
      })

      // Run independent hard violations audit over final timetables
      const audit = auditTimetableHardViolations({
        timetables: result.timetables,
        classes: classesForGen,
        subjects,
        faculty,
        rooms,
        assignments: filledAssignments,
        settings,
        unplaced: result.unplaced,
      })
      result.hardViolations = audit.hardViolations
      result.hardValid = audit.isValid

      setAllTimetables(result.timetables)
      setGenReport(result)
      setStatus('Complete!')

      if (audit.hardViolations.length === 0) {
        toast(`Generated timetables with 0 hard violations! (Score: ${result.score})`, 'ok')
      } else {
        toast(`Generated with ${audit.hardViolations.length} hard violations`, 'err')
      }
    } catch (err) {
      toast('Generator error: ' + err.message, 'err')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Generate Timetable</h2>
            <p>Generate all classes together with shared faculty and room constraints.</p>
          </div>
          <div className="actions">
            <button
              className={`btn ${step === 'review' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStep('review')}
            >
              Step A: Review Assignments
            </button>
            <button
              className={`btn ${step === 'generate' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStep('generate')}
            >
              Step B: Schedule &amp; Generate
            </button>
          </div>
        </div>
      </div>

      {/* Validation Report Banner */}
      {!validation.isValid && (
        <div
          className="card"
          style={{
            border: "1px solid var(--danger)", borderLeft: "4px solid var(--danger)", background: "var(--dangerbg)",
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
            
            <b style={{ color: 'var(--danger)' }}>Validation Errors (Generation Blocked):</b>
          </div>
          <ul style={{ paddingLeft: '1.5rem', fontSize: '.84rem', color: 'var(--ink)' }}>
            {validation.errors.map((err, i) => (
              <li key={i} style={{ marginBottom: '.2rem' }}>
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div
          className="card"
          style={{
            border: "1px solid var(--border)", borderLeft: "4px solid var(--border2)", background: "var(--surface2)",
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.3rem' }}>
            
            <b style={{ color: "var(--ink)" }}>Faculty Workload Warnings:</b>
          </div>
          <ul style={{ paddingLeft: '1.5rem', fontSize: '.8rem', color: 'var(--muted)' }}>
            {validation.warnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {validation.warnings.length > 5 && (
              <li>...and {validation.warnings.length - 5} more warnings</li>
            )}
          </ul>
        </div>
      )}

      {/* ─── STEP A: Review & Lock Assignments ─── */}
      {step === 'review' && (
        <div>
          <div className="card">
            <div className="card-header">
              <h3>Step A: Faculty Teaching Assignments</h3>
              <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                Each class section can have different faculty teams for the same subject.
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleAutoAssign}>
                  Auto-Assign All Qualified
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setStep('generate')}>
                  Proceed to Schedule →
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={toggleSelectAll}>
                {selectedClassIds.length === classes.length ? 'Deselect All' : 'Select All Classes'}
              </button>
              {classes.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    background: selectedClassIds.includes(c.id)
                      ? 'var(--accentbg)'
                      : 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '.3rem .6rem',
                    cursor: 'pointer',
                    fontSize: '.82rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedClassIds.includes(c.id)}
                    onChange={() => toggleSelectClass(c.id)}
                  />
                  <span>
                    <b>{c.id}</b>
                  </span>
                </label>
              ))}
            </div>

            {selectedClasses.map((c) => {
              const byKey = getBranchYearKey(c.branch, c.year)
              const subList = subjects[byKey] || []
              const classAss = assignments[c.id] || {}

              return (
                <div
                  key={c.id}
                  style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '.75rem',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '.4rem',
                    }}
                  >
                    <div>
                      <b style={{ fontSize: '1rem', color: "var(--ink)" }}>{c.id}</b>
                      <span className="tag" style={{ marginLeft: '.5rem' }}>
                        {subList.length} subjects
                      </span>
                      <span className="tag" style={{ marginLeft: '.3rem' }}>
                        Home: {c.homeRoomId || 'Unset'}
                      </span>
                    </div>
                  </div>

                  {subList.length === 0 ? (
                    <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                      No subjects defined for {byKey}.
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th>Type</th>
                            <th style={{ textAlign: 'right' }}>Req</th>
                            <th>Assigned Faculty Team</th>
                            <th>Lock Team</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subList.map((s) => {
                            const req = s.facultyReq ?? (s.type === 'Lab' ? 2 : 1)
                            const currentTeam = classAss[s.id] || []
                            const isLocked = !!lockedAssignments[c.id]?.[s.id]
                            const hasExcelPreset = Boolean(
                              subjectFacultyPresets?.[byKey]?.[s.code]?.sections?.[c.section] ||
                                subjectFacultyPresets?.[byKey]?.[s.code]?.all
                            )
                            const isPresetTeam = hasExcelPreset && currentTeam.length > 0
                            const availableFaculty = faculty.filter(
                              (f) => currentTeam.includes(f.id) || isFacultyQualified(f, s, byKey)
                            )

                            return (
                              <tr key={s.id}>
                                <td>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                                    <b>{s.code || s.name}</b>
                                    {isPresetTeam && (
                                      <span className="tag green" style={{ fontSize: '.68rem' }}>
                                        From Excel
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    style={{
                                      display: 'block',
                                      fontSize: '.72rem',
                                      color: 'var(--muted)',
                                    }}
                                  >
                                    {s.name} ({s.periods} p/wk)
                                  </span>
                                </td>
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
                                <td style={{ textAlign: 'right' }}>{req}</td>
                                <td>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                                    {availableFaculty.map((f) => {
                                      const isChosen = currentTeam.includes(f.id)
                                      return (
                                        <label
                                          key={f.id}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '.25rem',
                                            background: isChosen
                                              ? 'var(--accent)'
                                              : 'var(--surface3)',
                                            color: isChosen ? '#fff' : 'var(--ink)',
                                            padding: '.2rem .45rem',
                                            borderRadius: '99px',
                                            fontSize: '.74rem',
                                            cursor: isLocked ? 'not-allowed' : 'pointer',
                                            opacity: isLocked && !isChosen ? 0.4 : 1,
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            disabled={isLocked}
                                            checked={isChosen}
                                            onChange={(e) =>
                                              handleFacultyChange(
                                                c.id,
                                                s.id,
                                                f.id,
                                                e.target.checked
                                              )
                                            }
                                          />
                                          {f.short}
                                        </label>
                                      )
                                    })}
                                    {availableFaculty.length === 0 && (
                                      <span style={{ color: 'var(--danger)', fontSize: '.75rem' }}>
                                        No qualified faculty!
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <button
                                    className={`btn btn-sm ${
                                      isLocked ? 'btn-primary' : 'btn-ghost'
                                    }`}
                                    onClick={() => toggleLockAssignment(c.id, s.id)}
                                  >
                                    {isLocked ? 'Locked' : 'Unlocked'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── STEP B: Schedule & Generator Engine ─── */}
      {step === 'generate' && (
        <div>
          <div className="card">
            <div className="card-header">
              <h3>Step B: Multi-Class Scheduler</h3>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div>
                <label style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 600 }}>
                  Selected Classes ({selectedClasses.length})
                </label>
                <div style={{ marginTop: '.3rem', fontSize: '.84rem' }}>
                  {selectedClasses.map((c) => c.id).join(', ') || 'None'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 600 }}>
                  Optimization Attempts
                </label>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  step="50"
                  value={attempts}
                  onChange={(e) => setAttempts(e.target.value)}
                  style={{ width: 120, marginTop: '.3rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleRunGenerator}
                  disabled={running || !validation.isValid || selectedClasses.length === 0}
                  style={{ height: 38 }}
                >
                  {running ? 'Scheduling…' : 'Generate Timetables'}
                </button>
              </div>
            </div>

            {running && (
              <div style={{ marginTop: '1rem' }}>
                <div className="progress-bar">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: '.4rem' }}>
                  {status}
                </p>
              </div>
            )}
          </div>

          {/* Generator Result Report */}
          {genReport && (
            <div className="card">
              <div className="card-header">
                <h3>Scheduling Report</h3>
                <span
                  className={`tag ${(genReport.hardViolations || []).length === 0 ? '' : 'danger'}`}
                  style={{ fontSize: '.8rem' }}
                >
                  {(genReport.hardViolations || []).length === 0
                    ? '0 Hard Violations'
                    : `${(genReport.hardViolations || []).length} Hard Violations`}
                </span>
                <span className="tag" style={{ marginLeft: '.3rem' }}>
                  Soft Penalty Score: {genReport.score}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                  {deployStatus && (
                    <span style={{ fontSize: '.78rem' }}>
                      {deployStatus.state === 'failed' ? (
                        <a
                          href={deployStatus.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--danger)', textDecoration: 'underline' }}
                        >
                          Deploy failed, see Actions
                        </a>
                      ) : deployStatus.state === 'live' ? (
                        <span className="tag" style={{ color: 'var(--ink)', fontWeight: 600 }}>Live</span>
                      ) : (
                        <span className="tag" style={{ color: 'var(--muted)' }}>Deploying…</span>
                      )}
                    </span>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={publishing}
                    onClick={handlePublish}
                  >
                    {publishing ? 'Publishing…' : 'Publish'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onNavigate('view-tt')}
                  >
                    View Timetable →
                  </button>
                </div>
              </div>

              {(genReport.hardViolations || []).length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ color: 'var(--danger)', fontSize: '.9rem', marginBottom: '.4rem' }}>
                    Hard Violations ({(genReport.hardViolations || []).length}):
                  </h4>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Class / Item</th>
                          <th>Day &amp; Period</th>
                          <th>Rule</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {genReport.hardViolations.map((v, i) => (
                          <tr key={i}>
                            <td>
                              <b>{v.classId || v.facId || v.roomId || 'General'}</b>
                            </td>
                            <td>{v.day ? `${v.day} ${v.period || ''}` : '—'}</td>
                            <td>
                              <span className="tag danger">{v.rule}</span>
                            </td>
                            <td style={{ color: 'var(--danger)' }}>{v.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {genReport.violations.length > 0 ? (
                <div>
                  <h4 style={{ color: "var(--ink)", fontSize: '.9rem', marginBottom: '.4rem' }}>
                    Soft Rule Deviations ({genReport.violations.length}):
                  </h4>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }} className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Class / Faculty</th>
                          <th>Day &amp; Period</th>
                          <th>Rule</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {genReport.violations.map((v, i) => (
                          <tr key={i}>
                            <td>
                              <b>{v.classId || v.facId}</b>
                            </td>
                            <td>
                              {v.day} {v.period ? `(${v.period})` : ''}
                            </td>
                            <td>
                              <span className="tag">{v.rule}</span>
                            </td>
                            <td>{v.text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p style={{ color: "var(--ink)", fontSize: '.84rem' }}>
                  Zero soft-rule violations.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
