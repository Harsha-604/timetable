import { useMemo, useRef, useState } from 'react'
import { parseFacultyWorkbook } from '../utils/invigilation/excelParser'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SEMESTER_NUMBERS = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 }
const DEFAULT_START = '09:30'
const DEFAULT_END = '12:30'

function dateAsWeekday(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return DAYS[new Date(year, month - 1, day).getDay()]
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function formatTime(totalMinutes) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function getActivitySemesters(activity) {
  const text = String(activity || '').toUpperCase()
  const semesters = new Set()
  const roman = 'VIII|VII|VI|V|IV|III|II|I'
  const patterns = [
    new RegExp(`\\b(${roman})\\s*SEM(?:ESTER)?\\b`, 'g'),
    new RegExp(`\\bSEM(?:ESTER)?\\s*[-:]?\\s*(${roman})\\b`, 'g'),
    /\b([1-8])(?:ST|ND|RD|TH)\s*SEM(?:ESTER)?\b/g,
    /\bSEM(?:ESTER)?\s*[-:]?\s*([1-8])(?:ST|ND|RD|TH)?\b/g,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      semesters.add(SEMESTER_NUMBERS[match[1]] || Number(match[1]))
    }
  }
  return semesters
}

function isProtectedFaculty(faculty) {
  const name = faculty.facultyName.toUpperCase()
  return /\bA?HOD\b/.test(name) ||
    faculty.sourceBlocks.some((block) => /\bHOD\b/i.test(block.sheetName)) ||
    /\bDR\.?\s*B\.?\s*SANDHYA\b/i.test(name)
}

function isServiceFaculty(faculty) {
  return faculty.sourceBlocks.some((block) => /service\s*faculty/i.test(block.sheetName))
}

function getConflicts(faculty, day, windowStart, windowEnd, semester) {
  return faculty.occupiedSlots.filter((slot) => {
    if (getActivitySemesters(slot.activity).has(Number(semester))) return false
    const dayIndex = DAYS.indexOf(day)
    const slotDayIndex = DAYS.indexOf(slot.day)
    let dayOffset = (slotDayIndex - dayIndex + 7) % 7
    if (dayOffset > 3) dayOffset -= 7
    const slotStart = toMinutes(slot.start) + dayOffset * 1440
    const slotEnd = toMinutes(slot.end) + dayOffset * 1440
    return slotStart < windowEnd && slotEnd > windowStart
  })
}

export default function Invigilation() {
  const inputRef = useRef(null)
  const [workbook, setWorkbook] = useState(null)
  const [fileName, setFileName] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState(DEFAULT_START)
  const [end, setEnd] = useState(DEFAULT_END)
  const [semester, setSemester] = useState('')
  const [error, setError] = useState('')

  const day = dateAsWeekday(date)
  const hasTimes = Boolean(start && end)
  const invalidTime = hasTimes && toMinutes(end) <= toMinutes(start)
  const results = useMemo(() => {
    if (!workbook || !day || !hasTimes || !semester || invalidTime) return null
    const examStart = toMinutes(start)
    const examEnd = toMinutes(end)
    const windowStart = examStart - 60
    const windowEnd = examEnd + 60
    const serviceFaculty = workbook.facultyMembers.filter(isServiceFaculty)
    const protectedFaculty = workbook.facultyMembers.filter(isProtectedFaculty)
    const candidates = workbook.facultyMembers.filter((faculty) =>
      !isServiceFaculty(faculty) && !isProtectedFaculty(faculty)
    )

    return {
      windowStart,
      windowEnd,
      excludedServiceCount: serviceFaculty.length,
      excludedProtectedCount: protectedFaculty.length,
      eligible: candidates.filter((faculty) =>
        getConflicts(faculty, day, windowStart, windowEnd, semester).length === 0
      ),
      unavailable: candidates
        .map((faculty) => ({
          ...faculty,
          conflicts: getConflicts(faculty, day, windowStart, windowEnd, semester),
        }))
        .filter((faculty) => faculty.conflicts.length > 0),
    }
  }, [workbook, day, start, end, hasTimes, invalidTime, semester])

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const data = await file.arrayBuffer()
      const parsed = parseFacultyWorkbook(data)
      if (!parsed.facultyMembers.length) {
        throw new Error('No timetable blocks were found in this workbook.')
      }
      setWorkbook(parsed)
      setFileName(file.name)
    } catch (err) {
      setWorkbook(null)
      setFileName('')
      setError(`Could not read this timetable: ${err.message}`)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Invigilation</h2>
          <p>Find faculty with no scheduled classes during the exam or the hour before and after.</p>
        </div>
      </div>

      <section className="card invigilation-controls">
        <div className="field field-full">
          <label>Faculty timetable workbook</label>
          <div className="invigilation-upload">
            <button className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
              {fileName ? 'Replace workbook' : 'Upload Excel workbook'}
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} hidden />
            <span className="invigilation-file-name">{fileName || 'No workbook uploaded'}</span>
            {workbook && <span className="tag">{workbook.uniqueFacultyCount} faculty</span>}
          </div>
        </div>

        <div className="invigilation-exam-fields">
          <div className="field">
            <label htmlFor="exam-date">Exam date</label>
            <input id="exam-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            {day && <small className="muted">{day}</small>}
          </div>
          <div className="field">
            <label htmlFor="exam-start">Exam starts</label>
            <input id="exam-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="exam-end">Exam ends</label>
            <input id="exam-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="exam-semester">Exam semester</label>
            <select id="exam-semester" value={semester} onChange={(event) => setSemester(event.target.value)}>
              <option value="">Select semester</option>
              {Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}{['st', 'nd', 'rd'][index] || 'th'} semester</option>)}
            </select>
          </div>
        </div>

        {hasTimes && <div className="invigilation-rule">
          Eligible faculty must be free from <b>{formatTime(toMinutes(start) - 60)}</b> to <b>{formatTime(toMinutes(end) + 60)}</b> around the exam. Periods for the selected semester are treated as free.
        </div>}
        {invalidTime && <p className="invigilation-error">Exam end time must be later than the start time.</p>}
        {error && <p className="invigilation-error">{error}</p>}
      </section>

      {workbook?.warnings?.length > 0 && (
        <section className="card invigilation-notice">
          <b>Workbook parsing notes</b>
          <ul>{workbook.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </section>
      )}

      {workbook?.possibleMatches?.length > 0 && (
        <section className="card invigilation-notice">
          <b>Names kept separate for safety</b>
          <p>These possible matches have not been merged, so each name is assessed independently:</p>
          <ul>{workbook.possibleMatches.map((match, index) => <li key={index}>{match.firstName} / {match.secondName}</li>)}</ul>
        </section>
      )}

      {!workbook ? (
        <div className="card empty-state"><p>Upload the faculty timetable workbook to check availability.</p></div>
      ) : !date || !semester ? (
        <div className="card empty-state"><p>Choose an exam date and semester to see eligible faculty.</p></div>
      ) : invalidTime ? null : results && (
        <>
          <section className="card">
            <div className="invigilation-results-header">
              <div>
                <h3>Eligible faculty</h3>
                <p>{day}, {date} · Semester {semester} · Exam {start}–{end} · Free {formatTime(results.windowStart)}–{formatTime(results.windowEnd)}</p>
              </div>
              <span className="tag">{results.eligible.length} available</span>
            </div>
            <p className="invigilation-exclusion-note">Excluded from invigilation: {results.excludedServiceCount} service faculty and {results.excludedProtectedCount} HOD/AHOD or Dr. B. Sandhya.</p>
            {results.eligible.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Faculty</th><th>Timetable source</th><th>Other occupied periods</th><th>Selected-semester periods treated as free</th></tr></thead>
                  <tbody>{results.eligible.map((faculty) => {
                    const daySlots = faculty.occupiedSlots.filter((slot) => slot.day === day)
                    const semesterSlots = daySlots.filter((slot) => getActivitySemesters(slot.activity).has(Number(semester)))
                    const otherSlots = daySlots.filter((slot) => !getActivitySemesters(slot.activity).has(Number(semester)))
                    return <tr key={faculty.facultyName}>
                      <td><b>{faculty.facultyName}</b></td>
                      <td>{[...new Set(faculty.sourceBlocks.map((block) => block.sheetName))].join(', ') || '—'}</td>
                      <td>{otherSlots.length ? otherSlots.map((slot) => `${slot.start}–${slot.end}`).join(', ') : 'None'}</td>
                      <td>{semesterSlots.length ? semesterSlots.map((slot) => `${slot.start}–${slot.end}`).join(', ') : 'None'}</td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
            ) : <div className="empty-state"><p>No faculty meet the availability conditions for this exam.</p></div>}
          </section>

          <section className="card">
            <div className="invigilation-results-header">
              <div><h3>Unavailable during the required window</h3><p>Classes overlapping the exam or its one-hour buffer.</p></div>
              <span className="tag danger">{results.unavailable.length}</span>
            </div>
            {results.unavailable.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Faculty</th><th>Conflicting class periods</th></tr></thead>
                  <tbody>{results.unavailable.map((faculty) => <tr key={faculty.facultyName}>
                    <td><b>{faculty.facultyName}</b></td>
                    <td>{faculty.conflicts.map((slot) => `${slot.start}–${slot.end}`).join(', ')}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : <div className="empty-state"><p>Everyone in the workbook is available for this window.</p></div>}
          </section>
        </>
      )}
    </div>
  )
}
