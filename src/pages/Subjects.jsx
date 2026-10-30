import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/Modal'
import { BRANCHES, YEARS } from '../utils/constants'
import { uid, getBranchYearKey } from '../utils/helpers'
import { importSubjectsFromFile } from '../utils/importer'
import { dlTemplate } from '../utils/exporter'

export default function Subjects() {
  const {
    rooms,
    subjects,
    addSubject,
    updateSubject,
    deleteSubject,
    clearClassSubjects,
    clearAllSubjects,
    mergeSubjects,
    replaceSubjects,
    toast,
  } = useStore()

  const [branch, setBranch] = useState(BRANCHES[0])
  const [year, setYear] = useState(YEARS[0])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})

  const key = getBranchYearKey(branch, year)
  const subs = subjects[key] || []
  const labRooms = rooms.filter((r) => r.type === 'Lab')
  const roomOptions = labRooms.length ? labRooms : rooms

  const openAdd = () => {
    setForm({
      name: '',
      code: '',
      type: 'Theory',
      periods: 3,
      block: 1,
      facultyReq: 1,
      labRoomId: '',
      commonGroup: '',
    })
    setModal({})
  }

  const openEdit = (s) => {
    setForm({
      ...s,
      facultyReq: s.facultyReq ?? (s.type === 'Lab' ? 2 : 1),
      labRoomId: s.labRoomId || '',
      commonGroup: s.commonGroup || '',
    })
    setModal(s)
  }

  const closeModal = () => setModal(null)

  const save = () => {
    if (!form.name?.trim()) {
      toast('Subject name required', 'err')
      return
    }
    const type = form.type || 'Theory'
    const isLab = type === 'Lab' || type === 'Project'
    if (isLab && !form.labRoomId) {
      toast('Lab / Project subjects require a Lab Room', 'err')
      return
    }

    const data = {
      name: form.name.trim(),
      code: form.code?.trim() || form.name.trim(),
      type,
      periods: parseInt(form.periods, 10) || 1,
      block: parseInt(form.block, 10) || 1,
      facultyReq:
        parseInt(form.facultyReq, 10) || (type === 'Lab' ? 2 : 1),
      labRoomId: form.labRoomId || '',
      commonGroup: form.commonGroup?.trim() || '',
    }

    if (modal?.id) {
      updateSubject(key, modal.id, data)
      toast('Subject updated', 'ok')
    } else {
      addSubject(key, { id: uid('s'), ...data })
      toast('Subject added', 'ok')
    }
    closeModal()
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const { map, added, updated, duplicates, unknown } = await importSubjectsFromFile(file, subjects)
      replaceSubjects(map)
      const problems = [
        duplicates.length ? `duplicate codes: ${duplicates.join(', ')}` : '',
        unknown.length ? `rows skipped (bad branch/year): ${unknown.join('; ')}` : '',
      ].filter(Boolean).join('. ')
      const msg = `Subjects: ${added} added, ${updated} updated`
      toast(problems ? `${msg}. ${problems}` : msg, problems ? 'err' : 'ok')
    } catch (err) {
      toast('Import failed: ' + err.message, 'err')
    }
    e.target.value = ''
  }

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Subjects</h2>
            <p>
              Manage subjects per branch and year (shared by all sections of that branch+year).
            </p>
          </div>
          <div className="actions">
            <label className="filebtn">
              📊 Import Excel/CSV{' '}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} hidden />
            </label>
            <button className="btn btn-secondary" onClick={() => dlTemplate('subjects')}>
              ⬇ Download Template
            </button>
            {subs.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (
                    confirm(
                      `Delete all ${subs.length} subjects for ${branch} Year ${year}?`
                    )
                  ) {
                    clearClassSubjects(key)
                    toast('Cleared class subjects', 'ok')
                  }
                }}
              >
                🗑 Clear This Class
              </button>
            )}
            {Object.values(subjects).some((a) => a.length) && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm('Delete ALL subjects across all branches?')) {
                    clearAllSubjects()
                    toast('All subjects cleared', 'ok')
                  }
                }}
              >
                🗑 Clear All
              </button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>
              + Add Subject
            </button>
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          background: 'var(--surface2)',
          fontSize: '.8rem',
          color: 'var(--muted)',
          padding: '.75rem 1rem',
        }}
      >
        <b>Excel Columns:</b> <code>Branch</code>, <code>Year</code>, <code>Subject Code</code>,{' '}
        <code>Subject Name</code>, <code>Type</code> (Theory/Lab/Project), <code>Periods/Week</code>,{' '}
        <code>Block Size</code>, <code>Faculty Required</code>, <code>Lab Room</code>,{' '}
        <code>Common Slot Group</code>
      </div>

      {/* Branch / Year selector */}
      <div className="toolbar">
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {BRANCHES.map((b) => (
            <button
              key={b}
              className={`btn ${b === branch ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setBranch(b)}
            >
              {b}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginLeft: '.75rem' }}>
          {YEARS.map((y) => (
            <button
              key={y}
              className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setYear(y)}
            >
              Year {y}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>
            {branch} — Year {year}
          </h3>
          <span className="tag">
            {subs.length} subjects · {subs.reduce((a, s) => a + (s.periods || 0), 0)} periods/wk
          </span>
        </div>
        {!subs.length ? (
          <div className="empty-state">
            <div className="icon">📚</div>
            <p>
              No subjects for {branch} Year {year}.
            </p>
            <button className="btn btn-primary" onClick={openAdd}>
              + Add Subject
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject Name</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Periods</th>
                  <th style={{ textAlign: 'right' }}>Block</th>
                  <th style={{ textAlign: 'right' }}>Fac Req</th>
                  <th>Lab Room</th>
                  <th>Common Group</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'right' }}>{i + 1}</td>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td>
                      <code>{s.code || '—'}</code>
                    </td>
                    <td>
                      <span
                        className={`tag ${s.type === 'Lab'
                            ? 'green'
                            : s.type === 'Project'
                              ? 'purple'
                              : ''
                          }`}
                      >
                        {s.type}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{s.periods}</td>
                    <td style={{ textAlign: 'right' }}>{s.block}</td>
                    <td style={{ textAlign: 'right' }}>{s.facultyReq || 1}</td>
                    <td>{s.labRoomId ? <span className="tag green">{s.labRoomId}</span> : '—'}</td>
                    <td>{s.commonGroup ? <span className="tag yellow">{s.commonGroup}</span> : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>
                        ✏️
                      </button>{' '}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)' }}
                        onClick={() => {
                          if (confirm(`Delete subject ${s.name}?`)) {
                            deleteSubject(key, s.id)
                            toast('Deleted', 'ok')
                          }
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <Modal
          title={modal.id ? 'Edit Subject' : 'Add Subject'}
          onClose={closeModal}
          actions={
            <>
              <button className="btn btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Save
              </button>
            </>
          }
        >
          <div className="field field-full">
            <label>Subject Name *</label>
            <input
              value={form.name || ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Blockchain Technologies"
            />
          </div>
          <div className="field">
            <label>Subject Code (Display Code)</label>
            <input
              value={form.code || ''}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="e.g. BCT or PE-V:SQT"
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={form.type || 'Theory'}
              onChange={(e) => {
                const type = e.target.value
                setForm((f) => ({
                  ...f,
                  type,
                  facultyReq: type === 'Lab' ? (f.facultyReq > 1 ? f.facultyReq : 2) : 1,
                  block: type === 'Lab' ? (f.block > 1 ? f.block : 2) : f.block,
                }))
              }}
            >
              <option value="Theory">Theory</option>
              <option value="Lab">Lab</option>
              <option value="Project">Project</option>
            </select>
          </div>
          <div className="field">
            <label>Periods / Week</label>
            <input
              type="number"
              min="1"
              max="20"
              value={form.periods || 3}
              onChange={(e) => setForm((f) => ({ ...f, periods: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Block Size</label>
            <select
              value={form.block || 1}
              onChange={(e) => setForm((f) => ({ ...f, block: e.target.value }))}
            >
              <option value={1}>1 period</option>
              <option value={2}>2 periods (contiguous)</option>
              <option value={3}>3 periods (contiguous)</option>
            </select>
          </div>
          <div className="field">
            <label>Faculty Required</label>
            <input
              type="number"
              min="1"
              max="5"
              value={form.facultyReq ?? (form.type === 'Lab' ? 2 : 1)}
              onChange={(e) => setForm((f) => ({ ...f, facultyReq: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Lab Room {(form.type === 'Lab' || form.type === 'Project') ? '*' : '(optional)'}</label>
            <select
              value={form.labRoomId || ''}
              onChange={(e) => setForm((f) => ({ ...f, labRoomId: e.target.value }))}
            >
              <option value="">— Select Lab Room —</option>
              {roomOptions.map((r) => (
                <option key={r.id || r.name} value={r.name || r.roomNo || r.id}>
                  {r.name || r.roomNo} {r.labName ? `(${r.labName})` : ''} [{r.type || 'Room'}]
                </option>
              ))}
            </select>
          </div>
          <div className="field field-full">
            <label>Common Slot Group (Optional, e.g. OE-1)</label>
            <input
              value={form.commonGroup || ''}
              onChange={(e) => setForm((f) => ({ ...f, commonGroup: e.target.value }))}
              placeholder="e.g. OE-1"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
